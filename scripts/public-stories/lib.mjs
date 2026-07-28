// Shared helpers for the public-story batch generator.
//
// The Fable prompt engine below is copied from fable_test.mjs (the byte-mirror
// of constants/narration-modes.ts + services/fable-story.ts) — fable_test.mjs
// runs main() at import time and exports nothing, so these are copies, not
// imports. One deliberate change from the source: the builders take listener
// pronouns derived from recipe.genderSelf instead of hardcoded she/her, so
// for-him and m/m stories address the listener correctly. With a female
// listener (the default) the emitted prompts are identical to production.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const FABLE_MODEL = 'claude-fable-5';

// ── Pronouns ────────────────────────────────────────────────────────────────
export function pronounsFor(genderSelf) {
  if ((genderSelf || '').toLowerCase() === 'male') {
    return { subj: 'he', obj: 'him', poss: 'his' };
  }
  return { subj: 'she', obj: 'her', poss: 'her' };
}

// ── Mode data — mirror of constants/narration-modes.ts ──────────────────────
export const MODE_PARAMS = {
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

export function absoluteRulesCore(genderOther, p) {
  const partner = genderOther && genderOther.trim() ? genderOther.trim() : 'partner';
  return `You are not writing, recording, or narrating anything. You ARE ${p.poss} ${partner}, and this is happening RIGHT NOW — a breath away from ${p.obj}. There is no audience, no script, no story being told. There is only the two of you, here, now.

ABSOLUTE RULES:
- Present tense. Second person. Real time. You speak only to ${p.obj}.
- Begin ALREADY in the moment — already close, already touching. No scene-setting, no recap of how you got here. Drop straight in.
- DO things; never announce them. Never say "let me," "I'm going to," "now I'll," "I want to" + an action. If you'd touch ${p.obj}, it's already done — show it through what you feel and how ${p.subj} reacts.
- It is a DUET. React to ${p.obj} constantly — ${p.poss} breath, the sound ${p.subj} just made, how ${p.subj} moved, how ${p.subj} feels against you. Make ${p.poss} half of it felt, but never speak ${p.poss} lines for ${p.obj}.
- Real speech, not prose. Short. Broken. Trailing off. Commands and half-thoughts. Never literary, never a paragraph of description.
- Everything is murmured close to ${p.poss} ear — slow, hushed, barely above a breath. Never declarative, never announcer-energy. Let lines trail off with '…' and leave real pauses between them.
- Sparingly, you may use these audio cues and nothing else: [whispers], [softly], [slowly], [chuckles], and the breath sounds 'hmmmmm', 'ahhhhh'.
- Never break the moment. No meta, no narrator voice, no summarizing, no mention of time or length.`;
}

export function toneLine(isNighttime) {
  return isNighttime
    ? `- This is explicit and physical. Be graphic and unambiguous about every act — name what is happening, no euphemism, no fade to black.`
    : `- This is purely romantic and tender — closeness, warmth, words, and touch. Never sexual, never explicit. Keep it intimate but clean.`;
}

export function immersionEngine({ mode, genderOther, isNighttime, pron }) {
  const params = MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate;
  return `${absoluteRulesCore(genderOther, pron)}
${toneLine(isNighttime)}

${params.texture}`;
}

export function polishInstruction(mode) {
  const s = (MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate).polishStrictness;
  if (s === 'aggressive') return `Cut anything that reads like a sentence from a written story; strip it all the way to immediacy.`;
  if (s === 'preserve') return `Keep all the rich description. ONLY remove announcements ("let me" / "I'm going to" / "now I'll") and any fourth-wall break or meta line.`;
  return `Delete announcements and any obvious narrator sentences, but keep the light grounding details.`;
}

export function targetWordCount(minutes, mode) {
  return Math.round(minutes * (MODE_PARAMS[mode] ?? MODE_PARAMS.intermediate).wpm);
}

// ── Stage builders — copied from fable_test.mjs, pronoun-parameterized ──────
export function featureLineFrom(recipe, p) {
  return (recipe.features || [])
    .map((f) => {
      const prefs = (recipe.featurePreferences || {})[f] || [];
      const dir = prefs.includes('receive') ? `${p.subj} receives` : prefs.includes('give') ? `${p.subj} gives` : '';
      return dir ? `${f} (${dir})` : f;
    })
    .filter(Boolean)
    .join(', ');
}

export function buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA, pron: p }) {
  const seedBits = [
    recipe.setting && `scene seed: "${recipe.setting}"`,
    recipe.location && `location: ${recipe.location}`,
    recipe.character && `the partner: ${recipe.character}`,
    recipe.trope && `dynamic: ${recipe.trope}`,
    recipe.prompt && recipe.prompt !== recipe.setting && `extra notes: ${recipe.prompt}`,
    followUpQA && `what ${p.subj} shared:\n${followUpQA}`,
  ].filter(Boolean).join('\n');

  const system = isNighttime
    ? `You are a scene planner for an intimate, explicit first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. NSFW is fine; be concrete and specific. No preamble, no commentary.`
    : `You are a scene planner for a tender, romantic first-person audio. Output TERSE internal notes ONLY — never prose, never dialogue, never anything meant to be spoken aloud. Keep it warm and physical but never sexual. No preamble, no commentary.`;

  const beats = isNighttime
    ? `BEATS: three escalation beats from first contact, through ${featureLine}, to ${p.poss} finish — three short arrows, e.g. pull ${p.obj} in -> slow fingers -> ${p.subj} falls apart.`
    : `BEATS: three emotional beats from first closeness to a warm, settled landing — three short arrows, e.g. pull ${p.obj} in -> foreheads together -> ${p.subj} melts. No sexual content.`;

  const user = `Plan the raw material for ONE continuous ${isNighttime ? 'intimate' : 'tender romantic'} scene. The listener is ${recipe.genderSelf || 'female'}; the speaker is ${p.poss} ${recipe.genderOther || 'partner'} partner. They are already alone together.
${seedBits}
${isNighttime && featureLine ? `Escalate naturally to: ${featureLine}.` : ''}

Output EXACTLY these four blocks, terse, no full sentences:
WHERE: one line — the specific place and the position they are already in (already close/touching), following from the seed.
JUST HAPPENED: one line — the small, real hinge that tips the evening into this (a look held too long, the last bite, ${p.obj} standing up, a hand at ${p.poss} back).
ANCHORS: three concrete sensory specifics unique to THIS scene (taste, fabric, light, sound, temperature), comma-separated.
${beats}

No names. No dialogue. Notes only.`;

  return { system, user };
}

export function buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime, pron: p }) {
  const arc = isNighttime
    ? `: first contact, the build${featureLine ? `, ${featureLine}` : ''}, through ${p.poss} finish and a few seconds of after`
    : `, from first closeness through to a warm, settled landing`;
  const user = `This is happening now. Be in it from the very first word — already close to ${p.obj}.

Use the following ONLY as your private knowledge of the scene. Never quote it, never let its note-like wording surface in what you say:
${sceneNotes}

Live the whole moment with ${p.obj}, unbroken${arc}. Talk to ${p.obj} the entire way. Aim for roughly ${targetWords} words — a full, unhurried ${minutes}-minute moment, neither rushed nor padded. Output ONLY the words you say to ${p.obj} out loud — nothing else.`;
  return { system: engine, user };
}

export function buildPolish({ engine, mode, transcript }) {
  const system = `${engine}

You are the SAME person, re-living the SAME moment — not an editor at a desk. You will be given what you said. Re-live it and make it even more immediate, keeping its content, its beats, and roughly its length.`;
  const user = `Re-live and tighten this. ${polishInstruction(mode)}
Also:
- Delete every announcement — "let me", "I'm going to", "now I'll", "I want to" + an action. Replace it with the thing already done, or with her reaction to it.
- Keep it present, second person, real-time, broken speech — murmured and unhurried, trailing lines with '…'. Keep [whispers]/[softly]/[slowly]/[chuckles]/'hmmmmm'/'ahhhhh' sparse.

Output ONLY the rewritten monologue, nothing else:

${transcript}`;
  return { system, user };
}

// ── Fable calls ─────────────────────────────────────────────────────────────
export async function fableText(anthropic, system, user, maxTokens, label) {
  const msg = await anthropic.messages.create({
    model: FABLE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (msg.stop_reason === 'refusal') throw new Error(`CONTENT_MODERATION: refusal at "${label}".`);
  const text = (msg.content.find((b) => b.type === 'text') || {}).text || '';
  if (!text.trim()) throw new Error(`CONTENT_MODERATION: no text at "${label}" (stop_reason=${msg.stop_reason}).`);
  return text.trim();
}

export async function generateTranscript(anthropic, recipe, mode, isNighttime) {
  const minutes = parseInt((recipe.duration || '5min').match(/\d+/)[0], 10);
  const targetWords = targetWordCount(minutes, mode);
  const pron = pronounsFor(recipe.genderSelf);
  const featureLine = isNighttime ? featureLineFrom(recipe, pron) || 'their physical intimacy' : '';
  const engine = immersionEngine({ mode, genderOther: recipe.genderOther, isNighttime, pron });
  const maxTok = Math.min(24000, Math.max(6000, targetWords * 6));

  const notes = buildSceneNotes(recipe, { isNighttime, featureLine, followUpQA: '', pron });
  const sceneNotes = await retryable(
    () => fableText(anthropic, notes.system, notes.user, 1000, 'scene-notes'),
    { label: 'scene-notes' },
  );

  const emb = buildEmbody({ engine, sceneNotes, minutes, targetWords, featureLine, isNighttime, pron });
  let transcript = await retryable(
    () => fableText(anthropic, emb.system, emb.user, maxTok, 'embody'),
    { label: 'embody' },
  );

  const pol = buildPolish({ engine, mode, transcript });
  transcript = await retryable(
    () => fableText(anthropic, pol.system, pol.user, maxTok, 'polish'),
    { label: 'polish' },
  );
  return { transcript, targetWords, minutes };
}

export function announcementCount(t) {
  return (t.match(/\b(let me|i'm going to|i'm gonna|now i'll|i will|i want to)\b/gi) || []).length;
}

// ── ElevenLabs TTS — copied from fable_test.mjs ─────────────────────────────
export const MAX_CHUNK_SIZE = 1000;
export const HARD_TTS_LIMIT = 4500;
// 2, not 3: the ElevenLabs plan allows 5 concurrent requests and a 3-wide
// pool plus in-flight retries tripped concurrent_limit_exceeded in practice.
export const TTS_CONCURRENCY = 2;

export function splitTextIntoChunks(text) {
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

export function enforceHardLimit(chunks) {
  const out = [];
  for (const chunk of chunks) {
    if (chunk.length <= HARD_TTS_LIMIT) { out.push(chunk); continue; }
    let rem = chunk;
    while (rem.length > HARD_TTS_LIMIT) { const head = rem.slice(0, HARD_TTS_LIMIT); const sp = head.lastIndexOf(' '); const cut = sp > HARD_TTS_LIMIT * 0.5 ? sp : HARD_TTS_LIMIT; out.push(head.slice(0, cut).trim()); rem = rem.slice(cut).trim(); }
    if (rem.length > 0) out.push(rem);
  }
  return out;
}

// Prepended to every TTS chunk (each chunk is its own eleven_v3 call, so the
// delivery cue must re-assert itself per chunk or later chunks drift back to
// a declarative read). Specs can opt out with delivery: 'plain'.
export const DELIVERY_PREFIX = '[whispers][slowly] ';

export function chunkTtsText(chunkText, delivery, prefix = DELIVERY_PREFIX) {
  return delivery === 'plain' ? chunkText : prefix + chunkText;
}

export async function ttsChunk(text, voiceId, apiKey, settings = {}) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { stability: 0.5, similarity_boost: 0.5, ...settings } }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403 || /moderation|content/i.test(body)) {
      throw new Error(`CONTENT_MODERATION (ElevenLabs ${res.status}): ${body.slice(0, 200)}`);
    }
    const err = new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── ElevenLabs voice design (shapes match functions/src/voiceCallables.ts) ──
export async function designVoicePreviews(voiceDescription, text, apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice/design', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({ voice_description: voiceDescription, text, model_id: 'eleven_ttv_v3' }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`voice design ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.previews || [];
}

export async function createVoiceFromPreview(voiceName, voiceDescription, generatedVoiceId, apiKey) {
  const res = await fetch('https://api.elevenlabs.io/v1/text-to-voice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
    body: JSON.stringify({
      voice_name: voiceName,
      voice_description: voiceDescription,
      generated_voice_id: generatedVoiceId,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`voice create ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  if (!data.voice_id) throw new Error('ElevenLabs returned no voice_id');
  return data.voice_id;
}

// ── Cover art helpers — copied from scripts/add-story.mjs ───────────────────
export function generateDepthLayers(count = 5) {
  const layers = [];
  for (let i = 0; i < count; i++) {
    layers.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 20 + Math.random() * 50,
      opacity: 0.2 + Math.random() * 0.5,
      depth: Math.random(),
    });
  }
  return layers;
}

// ── Concurrency + retry ─────────────────────────────────────────────────────
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529]);

export async function retryable(fn, { retries = 3, baseMs = 2000, label = 'call' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (msg.startsWith('CONTENT_MODERATION')) throw err; // never retry moderation
      const status = err?.status ?? err?.response?.status;
      const transient =
        (typeof status === 'number' && RETRYABLE_STATUS.has(status)) ||
        /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|network|overloaded|Connection error/i.test(msg);
      if (!transient || attempt === retries) throw err;
      const wait = baseMs * 2 ** attempt;
      console.log(`   ↻ ${label}: transient error (${status ?? msg.slice(0, 60)}), retry ${attempt + 1}/${retries} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ── Manifest ────────────────────────────────────────────────────────────────
export function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function loadManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { narrators: {}, stories: {} };
  }
}

export function saveManifest(file, manifest) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

// ── Terminal input — hidden password prompt ─────────────────────────────────
// Processes stdin per CHARACTER, not per chunk: pasted or password-manager-
// filled passwords arrive as a single chunk (often with a trailing \r), and
// chunk-equality checks let that \r embed itself into the password →
// auth/invalid-credential with a perfectly correct password. Echoes '*' per
// accepted character so typos are visible.
export function parseHiddenInput(buffer, chunk) {
  // strip bracketed-paste markers some terminals wrap pastes in
  const s = chunk.replace(/\u001b\[20[01]~/g, '');
  for (const ch of s) {
    if (ch === '\n' || ch === '\r' || ch === '\u0004') {
      return { buffer, done: true, interrupted: false }; // ignore anything after Enter
    }
    if (ch === '\u0003') return { buffer, done: false, interrupted: true };
    if (ch === '\u007F' || ch === '\b') buffer = buffer.slice(0, -1);
    else if (ch >= ' ') buffer += ch; // drop other control chars (incl. ESC)
  }
  return { buffer, done: false, interrupted: false };
}

export function askHidden(promptText) {
  if (!process.stdin.isTTY) {
    // piped stdin: raw mode is TTY-only, so read one plain line instead
    return ask(promptText);
  }
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let password = '';
    const onData = (data) => {
      const res = parseHiddenInput(password, data.toString('utf8'));
      if (res.interrupted) {
        process.stdin.setRawMode(false);
        process.exit(1);
      }
      password = res.buffer;
      // re-render the mask to match the buffer (handles backspace + paste)
      process.stdout.write('\r\u001b[K' + promptText + '*'.repeat(password.length));
      if (res.done) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        console.log('');
        resolve(password);
      }
    };
    process.stdin.on('data', onData);
  });
}

export function ask(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText);
    process.stdin.resume();
    const onData = (chunk) => {
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      resolve(chunk.toString().trim());
    };
    process.stdin.on('data', onData);
  });
}
