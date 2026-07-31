#!/usr/bin/env node
// YouTube hero-test generator — 3 script variants per spec → LLM judge → TTS.
//
//   node scripts/marketing/yt-pipeline/generate.mjs --phase text [--only slug]
//   node scripts/marketing/yt-pipeline/generate.mjs --phase judge [--only slug]
//   node scripts/marketing/yt-pipeline/generate.mjs --phase tts  [--only slug] [--yes]
//
// Output: scripts/marketing/yt-pipeline/out/<slug>/{variant-N.txt,judge.json,winner.txt,<slug>.mp3}
// Text stages run on claude-fable-5 via lib.mjs helpers; TTS = ElevenLabs eleven_v3.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {
  fableText, buildPolish, splitTextIntoChunks, enforceHardLimit,
  ttsChunk, chunkTtsText, mapWithConcurrency, retryable, TTS_CONCURRENCY,
} from '../../public-stories/lib.mjs';
import { SPECS, GENRE_PROFILES, VOICE_ID, specBySlug } from './specs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// override:true — the repo .env is the source of truth even when the parent
// environment exports its own (possibly stale) ANTHROPIC_API_KEY.
dotenv.config({ quiet: true, override: true, path: path.join(__dirname, '../../../.env') });
const OUT = path.join(__dirname, 'out');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const phase = flag('phase') || 'text';
const only = flag('only');
const yes = !!flag('yes');

const VARIANT_ANGLES = [
  'Play it restrained — maximum control, minimum words, let the silences carry it.',
  'Let a thread of wry, fond humor live inside it — the speaker can smile at themselves without breaking the mood.',
  'Rawer and more vulnerable — let the cracks show a little sooner and go a little deeper.',
];

// Words-per-minute by genre: these audios breathe; sleep breathes slowest.
const WPM = { jealous: 85, devoted: 80, sleep: 65, gfcomfort: 80 };

function pronOf(spec) {
  // narrator gender drives who is being spoken to
  return spec.genderOther === 'female'
    ? { role: 'his girlfriend', l: 'him', ls: 'he', lp: 'his' }
    : { role: 'her boyfriend', l: 'her', ls: 'she', lp: 'her' };
}

function ytEngine(spec) {
  const p = GENRE_PROFILES[spec.genre];
  const q = pronOf(spec);
  return `You are not writing, recording, or narrating anything. You ARE ${q.role}, and this is happening RIGHT NOW — ${q.ls} is right here. There is no audience, no script. Only the two of you.

ABSOLUTE RULES:
- Present tense. Second person. Real time. You speak only to ${q.l}.
- ${p.open}
- DO things; never announce them. Never "let me" / "I'm going to" / "now I'll". If you'd touch ${q.l}, it's already done — show it through what you feel and how ${q.ls} reacts.
- It is a DUET. React to ${q.l} constantly — ${q.lp} breath, ${q.lp} look, what ${q.ls} just said (never speak ${q.lp} lines for ${q.l}, but let what ${q.ls} says land between your lines).
- Real speech, not prose. Short. Broken. Trailing off. Use … for held pauses. Never literary, never a paragraph of description.
- Sparingly, you may use these audio cues and nothing else: [slowly], [chuckles], and the breath sounds 'hmmmmm', 'ahhhhh'.
- Never break the moment. No meta, no narrator voice, no summarizing, no mention of time or length.
${p.tone}

${p.arc}

${p.performance}

THE QUOTABLE: somewhere at the emotional center, land this line (or something within a breath of it), clean, with air around it: ${spec.quotable}`;
}

function buildNotes(spec) {
  const p = GENRE_PROFILES[spec.genre];
  const q = pronOf(spec);
  const system = `You are a scene planner for an emotionally intense but NON-EXPLICIT (YouTube-safe) second-person audio roleplay. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. No preamble.`;
  const user = `Plan raw material for ONE continuous scene. The speaker is ${q.role}; the listener is "you" (${q.l}). Premise:
${spec.premise}

${p.arc}

Output EXACTLY these four blocks, terse, no full sentences:
WHERE: one line — the place and the position they're in as it opens.
JUST HAPPENED: one line — the hinge that tips into the opening beat.
ANCHORS: three concrete sensory specifics unique to THIS scene, comma-separated.
BEATS: the three arc beats as three short arrows.

No names. No dialogue. Notes only.`;
  return { system, user };
}

async function generateVariant(spec, angleIdx) {
  const engine = ytEngine(spec);
  const targetWords = Math.round(spec.minutes * (WPM[spec.genre] || 80));
  const maxTok = Math.min(24000, Math.max(6000, targetWords * 6));

  const n = buildNotes(spec);
  const sceneNotes = await fableText(anthropic, n.system, n.user, 1000, `${spec.slug} notes`);

  const embodyUser = `This is happening now. Be in it from the very first word.

Use the following ONLY as your private knowledge of the scene. Never quote it, never let its note-like wording surface:
${sceneNotes}

VARIANT DIRECTION: ${VARIANT_ANGLES[angleIdx]}

Live the whole moment with ${pronOf(spec).l}, unbroken, through all three beats. Talk to ${pronOf(spec).l} the entire way. Aim for roughly ${targetWords} words — a full, unhurried ${spec.minutes}-minute moment, neither rushed nor padded. Output ONLY the words you say out loud — nothing else.`;
  let transcript = await fableText(anthropic, engine, embodyUser, maxTok, `${spec.slug} embody v${angleIdx + 1}`);

  const pol = buildPolish({ engine, mode: 'immersive', transcript });
  transcript = await fableText(anthropic, pol.system, pol.user, maxTok, `${spec.slug} polish v${angleIdx + 1}`);
  return transcript;
}

async function judge(spec, variants) {
  const system = `You are a ruthless editor for a YouTube audio-roleplay channel. You judge scripts ONLY on what makes this genre perform: instant cold open, emotional arc that lands, performance realism (broken real speech, pauses), the quotable line placed clean, genre fit, and (for sleep) a true descent that never re-spikes. Output STRICT JSON only.`;
  const user = `Spec: ${spec.youtube.title}
Genre: ${spec.genre}. Quotable that must land: ${spec.quotable}

Three candidate scripts follow. Score each 1-10 on: coldOpen, arc, realism, quotable, genreFit. Then pick ONE winner (the one you'd actually publish) and say in one sentence why, plus at most 2 line-level fixes for the winner.

${variants.map((v, i) => `=== VARIANT ${i + 1} ===\n${v}`).join('\n\n')}

Output STRICT JSON: {"scores":[{"variant":1,"coldOpen":n,"arc":n,"realism":n,"quotable":n,"genreFit":n},...],"winner":<1|2|3>,"why":"...","fixes":["...","..."]}`;
  const raw = await fableText(anthropic, system, user, 2000, `${spec.slug} judge`);
  const match = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : raw);
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  const specs = only ? [specBySlug(only)].filter(Boolean) : SPECS;
  if (!specs.length) throw new Error(`No spec matches --only ${only}`);

  for (const spec of specs) {
    const dir = path.join(OUT, spec.slug);
    fs.mkdirSync(dir, { recursive: true });

    if (phase === 'text') {
      console.log(`\n✍️  ${spec.slug} — ${spec.minutes}min ${spec.genre} · 3 variants`);
      for (let i = 0; i < 3; i++) {
        const file = path.join(dir, `variant-${i + 1}.txt`);
        if (fs.existsSync(file) && !args.includes('--force')) { console.log(`   variant ${i + 1}: exists, skipping`); continue; }
        const t = await generateVariant(spec, i);
        fs.writeFileSync(file, t, 'utf8');
        console.log(`   variant ${i + 1}: ${t.split(/\s+/).length} words → ${path.relative(process.cwd(), file)}`);
      }
    }

    if (phase === 'judge') {
      const variants = [1, 2, 3].map((i) => fs.readFileSync(path.join(dir, `variant-${i}.txt`), 'utf8'));
      console.log(`\n⚖️  ${spec.slug} — judging…`);
      const verdict = await judge(spec, variants);
      fs.writeFileSync(path.join(dir, 'judge.json'), JSON.stringify(verdict, null, 2));
      fs.writeFileSync(path.join(dir, 'winner.txt'), variants[verdict.winner - 1], 'utf8');
      console.log(`   winner: variant ${verdict.winner} — ${verdict.why}`);
      verdict.fixes?.forEach((f) => console.log(`   fix: ${f}`));
    }

    if (phase === 'tts') {
      if (!process.env.ELEVENLABS) throw new Error('Missing ELEVENLABS');
      const winner = fs.readFileSync(path.join(dir, 'winner.txt'), 'utf8');
      const chunks = enforceHardLimit(splitTextIntoChunks(winner));
      const chars = winner.length;
      console.log(`\n🎤 ${spec.slug} — ${chunks.length} chunks, ${chars} chars (~${chars} ElevenLabs credits)`);
      if (!yes) { console.log('   pass --yes to run TTS'); continue; }
      // house delivery: per-chunk [whispers][slowly] prefix as in the app
      // pipeline — airy, close-mic, never declarative. Specs may override with
      // ttsPrefix (tag stack) and ttsSettings (e.g. { speed: 0.88 }).
      const buffers = await mapWithConcurrency(chunks, TTS_CONCURRENCY, (c, i) =>
        retryable(() => ttsChunk(chunkTtsText(c, undefined, spec.ttsPrefix), spec.voiceId || VOICE_ID, process.env.ELEVENLABS, spec.ttsSettings || {}), { label: `${spec.slug} chunk ${i + 1}`, retries: 5, baseMs: 4000 }));
      const all = Buffer.concat(buffers);
      const mp3 = path.join(dir, `${spec.slug}.mp3`);
      fs.writeFileSync(mp3, all);
      console.log(`   ✅ ${path.relative(process.cwd(), mp3)} (${(all.length / 1024 / 1024).toFixed(1)} MB, ~${(all.length / 16000 / 60).toFixed(1)} min)`);
    }
  }
  console.log('');
}

main().catch((e) => { console.error(`\n❌ ${e.message}\n`); process.exit(1); });
