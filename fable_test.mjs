#!/usr/bin/env node
/**
 * Local harness for the Fable immersion workflow — does NOT publish / touch
 * Firebase. Every TEXT stage runs on claude-fable-5. 3-stage pipeline:
 *   STAGE 1  scene-notes (terse INTERNAL raw material, not a script)
 *   STAGE 2  embody (Fable BECOMES the partner, plays the moment now)
 *   STAGE 3  immersion-polish (strips announcements / story-sentences)
 *
 * The mode textures + builders below are mirrored byte-for-byte from
 * constants/narration-modes.ts (this file runs under plain node and can't
 * resolve the app's `@/` alias). The stage builders match services/fable-story.ts.
 *
 * Usage:
 *   node fable_test.mjs                 # single run, mode=immersive, NSFW, with TTS → mp3
 *   MODE=cinematic node fable_test.mjs  # pick a mode
 *   TONE=sfw node fable_test.mjs        # romantic instead of explicit
 *   TEXT_ONLY=1 node fable_test.mjs     # skip TTS (text validation only)
 *   VALIDATE=1 node fable_test.mjs      # all 3 modes, text-only, prints stats
 */

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

dotenv.config({ quiet: true });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FABLE_MODEL = 'claude-fable-5';
const VOICE_ID = 'GNLSu9X5LqN19dRA4iva'; // male, sensual/deep
const ELEVENLABS_API_KEY = process.env.ELEVENLABS || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Mode data — MIRROR of constants/narration-modes.ts ──────────────────────
const MODE_PARAMS = {
  immersive: {
    polishStrictness: 'aggressive',
    wpm: 85,
    texture: `TEXTURE — IMMERSIVE:
Strip everything to immediacy. Sparse. In media res. Every line is something happening THIS second. Almost no adjectives. The power is in the directness and in the silences between lines. If a sentence could sit in a written story, cut it — it has to sound like someone too far gone to narrate. Lean on short imperatives, single sensory call-outs, and raw reactions to her. Less is more; let the breath do the work.`,
  },
  intermediate: {
    polishStrictness: 'balanced',
    wpm: 115,
    texture: `TEXTURE — BALANCED:
Still present, still real-time second person, but with connective tissue between the beats so it breathes. A little light sensory framing is welcome — one grounding detail per beat (the warmth of her, a sound, the dark of the room) — but never description for its own sake. Pace it so it feels guided, not clipped: a real person present enough to put a few words to what they feel, then act. The midpoint between sparse and painterly.`,
  },
  cinematic: {
    polishStrictness: 'preserve',
    wpm: 140,
    texture: `TEXTURE — CINEMATIC:
Let it linger. Paint sensation — heat, weight, the air, her skin, the sounds. Slow the build, more words per beat, indulgent and descriptive. BUT never a detached narrator: every sensation you describe is one of you two feeling it right now, in second person, present tense. Rich, but still spoken aloud by a person inside the moment — not read off a page.`,
  },
};

function absoluteRulesCore(genderOther) {
  const partner = genderOther && genderOther.trim() ? genderOther.trim() : 'partner';
  return `You are not writing, recording, or narrating anything. You ARE her ${partner}, and this is happening RIGHT NOW — a breath away from her. There is no audience, no script, no story being told. There is only the two of you, here, now.

ABSOLUTE RULES:
- Present tense. Second person. Real time. You speak only to her.
- Begin ALREADY in the moment — already close, already touching. No scene-setting, no recap of how you got here. Drop straight in.
- DO things; never announce them. Never say "let me," "I'm going to," "now I'll," "I want to" + an action. If you'd touch her, it's already done — show it through what you feel and how she reacts.
- It is a DUET. React to her constantly — her breath, the sound she just made, how she moved, how she feels against you. Make her half of it felt, but never speak her lines for her.
- Real speech, not prose. Short. Broken. Trailing off. Commands and half-thoughts. Never literary, never a paragraph of description.
- Sparingly, you may use these audio cues and nothing else: [slowly], [chuckles], and the breath sounds 'hmmmmm', 'ahhhhh'.
- Never break the moment. No meta, no narrator voice, no summarizing, no mention of time or length.`;
}

function toneLine(isNighttime) {
  return isNighttime
    ? `- This is explicit and physical. Be graphic and unambiguous about every act — name what is happening, no euphemism, no fade to black.`
    : `- This is purely romantic and tender — closeness, warmth, words, and touch. Never sexual, never explicit. Keep it intimate but clean.`;
}

function immersionEngine({ mode, genderOther, isNighttime }) {
  const params = MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate;
  return `${absoluteRulesCore(genderOther)}
${toneLine(isNighttime)}

${params.texture}`;
}

function polishInstruction(mode) {
  const s = (MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate).polishStrictness;
  if (s === 'aggressive') return `Cut anything that reads like a sentence from a written story; strip it all the way to immediacy.`;
  if (s === 'preserve') return `Keep all the rich description. ONLY remove announcements ("let me" / "I'm going to" / "now I'll") and any fourth-wall break or meta line.`;
  return `Delete announcements and any obvious narrator sentences, but keep the light grounding details.`;
}

function targetWordCount(minutes, mode) {
  return Math.round(minutes * (MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate).wpm);
}

// ── Stage builders — MATCH services/fable-story.ts ──────────────────────────
function featureLineFrom(recipe) {
  return (recipe.features || [])
    .map((f) => {
      const prefs = (recipe.featurePreferences || {})[f] || [];
      const dir = prefs.includes('receive') ? 'she receives' : prefs.includes('give') ? 'she gives' : '';
      return dir ? `${f} (${dir})` : f;
    })
    .filter(Boolean)
    .join(', ');
}

function buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA }) {
  const seedBits = [
    recipe.setting && `scene seed: "${recipe.setting}"`,
    recipe.location && `location: ${recipe.location}`,
    recipe.character && `the partner: ${recipe.character}`,
    recipe.trope && `dynamic: ${recipe.trope}`,
    recipe.prompt && recipe.prompt !== recipe.setting && `extra notes: ${recipe.prompt}`,
    followUpQA && `what she shared:\n${followUpQA}`,
  ].filter(Boolean).join('\n');

  const system = isNighttime
    ? `You are a scene planner for an intimate, explicit first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. NSFW is fine; be concrete and specific. No preamble, no commentary.`
    : `You are a scene planner for a tender, romantic first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. Keep it warm and physical but never sexual. No preamble, no commentary.`;

  const beats = isNighttime
    ? `BEATS: three escalation beats from first contact, through ${featureLine}, to her finish — three short arrows, e.g. pull her in -> slow fingers -> she falls apart.`
    : `BEATS: three emotional beats from first closeness to a warm, settled landing — three short arrows, e.g. pull her in -> foreheads together -> she melts. No sexual content.`;

  const user = `Plan the raw material for ONE continuous ${isNighttime ? 'intimate' : 'tender romantic'} scene. The listener is ${recipe.genderSelf || 'her'}; the speaker is her ${recipe.genderOther || 'partner'} partner. They are already alone together.
${seedBits}
${isNighttime && featureLine ? `Escalate naturally to: ${featureLine}.` : ''}

Output EXACTLY these four blocks, terse, no full sentences:
WHERE: one line — the specific place and the position they are already in (already close/touching), following from the seed.
JUST HAPPENED: one line — the small, real hinge that tips the evening into this (a look held too long, the last bite, her standing up, a hand at her back).
ANCHORS: three concrete sensory specifics unique to THIS scene (taste, fabric, light, sound, temperature), comma-separated.
${beats}

No names. No dialogue. Notes only.`;

  return { system, user };
}

function buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime }) {
  const arc = isNighttime
    ? `: first contact, the build${featureLine ? `, ${featureLine}` : ''}, through her finish and a few seconds of after`
    : `, from first closeness through to a warm, settled landing`;
  const user = `This is happening now. Be in it from the very first word — already close to her.

Use the following ONLY as your private knowledge of the scene. Never quote it, never let its note-like wording surface in what you say:
${sceneNotes}

Live the whole moment with her, unbroken${arc}. Talk to her the entire way. Aim for roughly ${targetWords} words — a full, unhurried ${minutes}-minute moment, neither rushed nor padded. Output ONLY the words you say to her out loud — nothing else.`;
  return { system: engine, user };
}

function buildPolish({ engine, mode, transcript }) {
  const system = `${engine}

You are the SAME person, re-living the SAME moment — not an editor at a desk. You will be given what you said. Re-live it and make it even more immediate, keeping its content, its beats, and roughly its length.`;
  const user = `Re-live and tighten this. ${polishInstruction(mode)}
Also:
- Delete every announcement — "let me", "I'm going to", "now I'll", "I want to" + an action. Replace it with the thing already done, or with her reaction to it.
- Keep it present, second person, real-time, broken speech. Keep [slowly]/[chuckles]/'hmmmmm'/'ahhhhh' sparse.

Output ONLY the rewritten monologue, nothing else:

${transcript}`;
  return { system, user };
}

// ── Fable client ────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
async function fableText(system, user, maxTokens, label) {
  const msg = await anthropic.messages.create({ model: FABLE_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
  if (msg.stop_reason === 'refusal') throw new Error(`CONTENT_MODERATION: refusal at "${label}".`);
  const text = (msg.content.find((b) => b.type === 'text') || {}).text || '';
  if (!text.trim()) throw new Error(`CONTENT_MODERATION: no text at "${label}" (stop_reason=${msg.stop_reason}).`);
  return text.trim();
}

async function generateTranscript(recipe, mode, isNighttime) {
  const minutes = parseInt((recipe.duration || '5min').match(/\d+/)[0], 10);
  const targetWords = targetWordCount(minutes, mode);
  const featureLine = isNighttime ? featureLineFrom(recipe) || 'their physical intimacy' : '';
  const engine = immersionEngine({ mode, genderOther: recipe.genderOther, isNighttime });
  const maxTok = Math.min(24000, Math.max(6000, targetWords * 6));

  const notes = buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA: '' });
  const sceneNotes = await fableText(notes.system, notes.user, 1000, 'scene-notes');

  const emb = buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime });
  let transcript = await fableText(emb.system, emb.user, maxTok, 'embody');

  const pol = buildPolish({ engine, mode, transcript });
  transcript = await fableText(pol.system, pol.user, maxTok, 'polish');
  return { transcript, sceneNotes, targetWords, minutes };
}

// ── ElevenLabs TTS ──────────────────────────────────────────────────────────
const MAX_CHUNK_SIZE = 1000, HARD_TTS_LIMIT = 4500;
function splitTextIntoChunks(text) {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const chunks = []; let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) { chunks.push(remaining.trim()); break; }
    const area = remaining.substring(0, MAX_CHUNK_SIZE); let idx = -1;
    for (let i = area.length - 1; i >= 0; i--) { const c = area[i]; if ((c === '.' || c === '!' || c === '?') && (i === area.length - 1 || area[i + 1] === ' ' || area[i + 1] === '\n')) { idx = i + 1; break; } }
    if (idx === -1) { const nl = area.lastIndexOf('\n'); if (nl > MAX_CHUNK_SIZE * 0.5) idx = nl + 1; }
    if (idx === -1) { for (let i = area.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) { if (area[i] === ',' || area[i] === ';') { idx = i + 1; break; } } }
    if (idx === -1) { const sp = area.lastIndexOf(' '); idx = sp > 0 ? sp + 1 : MAX_CHUNK_SIZE; }
    chunks.push(remaining.substring(0, idx).trim()); remaining = remaining.substring(idx).trim();
  }
  return chunks;
}
function enforceHardLimit(chunks) {
  const out = [];
  for (const chunk of chunks) {
    if (chunk.length <= HARD_TTS_LIMIT) { out.push(chunk); continue; }
    let rem = chunk;
    while (rem.length > HARD_TTS_LIMIT) { const head = rem.slice(0, HARD_TTS_LIMIT); const sp = head.lastIndexOf(' '); const cut = sp > HARD_TTS_LIMIT * 0.5 ? sp : HARD_TTS_LIMIT; out.push(head.slice(0, cut).trim()); rem = rem.slice(cut).trim(); }
    if (rem.length > 0) out.push(rem);
  }
  return out;
}
async function ttsChunk(text, voiceId) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
    body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.5 } }),
  });
  if (!res.ok) { const body = await res.text(); if (res.status === 401 || res.status === 403 || /moderation|content/i.test(body)) throw new Error(`CONTENT_MODERATION (ElevenLabs ${res.status}): ${body.slice(0, 200)}`); throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`); }
  return Buffer.from(await res.arrayBuffer());
}

function announcementCount(t) { return (t.match(/\b(let me|i'm going to|i'm gonna|now i'll|i will|i want to)\b/gi) || []).length; }

// ── Main ────────────────────────────────────────────────────────────────────
const recipe = {
  setting: 'makeout after dinner', genderSelf: 'female', genderOther: 'male',
  features: ['fingering'], featurePreferences: { fingering: ['receive'] }, duration: '5min',
};

async function main() {
  if (!ANTHROPIC_API_KEY) throw new Error('Missing ANTHROPIC_API_KEY in .env');

  if (process.env.VALIDATE === '1') {
    const tone = (process.env.TONE || 'nsfw') === 'nsfw';
    console.log(`\n🔬 VALIDATE — all 3 modes, ${tone ? 'NSFW' : 'SFW'}, text-only\n`);
    for (const mode of ['immersive', 'intermediate', 'cinematic']) {
      const { transcript, targetWords } = await generateTranscript(recipe, mode, tone);
      const words = transcript.split(/\s+/).length;
      console.log(`— ${mode.padEnd(13)} target ${String(targetWords).padStart(4)} | got ${String(words).padStart(4)} words | announcements: ${announcementCount(transcript)}`);
      const base = `fable-validate-${tone ? 'nsfw' : 'sfw'}-${mode}`;
      fs.writeFileSync(path.join(__dirname, `${base}.txt`), transcript, 'utf8');
    }
    console.log(`\n✅ Wrote fable-validate-*.txt for inspection. (announcements should be ~0 for immersive)\n`);
    return;
  }

  const mode = process.env.MODE || 'immersive';
  const isNighttime = (process.env.TONE || 'nsfw') === 'nsfw';
  const textOnly = process.env.TEXT_ONLY === '1';
  console.log(`\n🍷 "${recipe.setting}" — mode: ${mode} · ${isNighttime ? 'NSFW' : 'SFW'} · model: ${FABLE_MODEL}\n`);

  const { transcript, minutes, targetWords } = await generateTranscript(recipe, mode, isNighttime);
  console.log(`   transcript: ${transcript.split(/\s+/).length} words (target ${targetWords}) · announcements: ${announcementCount(transcript)}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const base = `fable-test-${mode}-${isNighttime ? 'nsfw' : 'sfw'}-${stamp}`;
  fs.writeFileSync(path.join(__dirname, `${base}.txt`), transcript, 'utf8');

  if (textOnly) { console.log(`\n✅ (text-only) → ${base}.txt\n`); return; }
  if (!ELEVENLABS_API_KEY) throw new Error('Missing ELEVENLABS in .env (use TEXT_ONLY=1 to skip TTS)');

  const chunks = enforceHardLimit(splitTextIntoChunks(transcript));
  console.log(`🎤 TTS — ${chunks.length} chunk(s)`);
  const buffers = [];
  for (let i = 0; i < chunks.length; i++) { process.stdout.write(`   chunk ${i + 1}/${chunks.length}… `); const b = await ttsChunk(chunks[i], VOICE_ID); buffers.push(b); console.log(`${(b.length / 1024).toFixed(1)} KB`); }
  const all = Buffer.concat(buffers);
  fs.writeFileSync(path.join(__dirname, `${base}.mp3`), all);
  console.log(`\n✅ → ${base}.mp3 (${(all.length / 1024).toFixed(1)} KB, ~${(all.length / 16000 / 60).toFixed(1)} min for ${minutes}-min target)\n`);
}

main().catch((err) => { console.error(`\n❌ ${err.message}\n`); if (/CONTENT_MODERATION/.test(err.message)) console.error('⚠️  Content-moderation block — flagging as requested.'); process.exit(1); });
