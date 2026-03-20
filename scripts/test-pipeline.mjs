#!/usr/bin/env node

/**
 * Non-interactive pipeline test — hardcoded 15-min story.
 * Times every step to pinpoint where the bottleneck / failure is.
 *
 * Usage:  node scripts/test-pipeline.mjs
 */

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import readline from 'readline';

dotenv.config();

// ── Firebase setup ──────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

const XAI_API_KEY = process.env.XAI || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS || '';

if (!XAI_API_KEY) { console.error('❌ Missing XAI key'); process.exit(1); }
if (!ELEVENLABS_API_KEY) { console.error('❌ Missing ELEVENLABS key'); process.exit(1); }

const VOICE_IDS = { male: 'Qe9WSybioZxssVEwlBSo', female: 'LEnmbrrxYsUYS7vsRRwD' };
const MAX_CHUNK_SIZE = 1000; // eleven_v3 has a lower char limit than older models
const GROK_TIMEOUT = 5 * 60 * 1000;
const USER_EMAIL = 'ellepotterhead2006@gmail.com';

// ── Timing helper ───────────────────────────────────────────────────────────
function timer(label) {
  const start = Date.now();
  return {
    done: () => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ⏱️  ${label}: ${elapsed}s`);
      return elapsed;
    },
  };
}

// ── Text chunking (matches app code) ────────────────────────────────────────
function splitTextIntoChunks(text) {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining.trim());
      break;
    }
    const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
    let splitIndex = -1;
    for (let i = searchArea.length - 1; i >= 0; i--) {
      const char = searchArea[i];
      if ((char === '.' || char === '!' || char === '?') &&
          (i === searchArea.length - 1 || searchArea[i + 1] === ' ' || searchArea[i + 1] === '\n')) {
        splitIndex = i + 1;
        break;
      }
    }
    if (splitIndex === -1) {
      const lastNewline = searchArea.lastIndexOf('\n');
      if (lastNewline > MAX_CHUNK_SIZE * 0.5) splitIndex = lastNewline + 1;
    }
    if (splitIndex === -1) {
      for (let i = searchArea.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') { splitIndex = i + 1; break; }
      }
    }
    if (splitIndex === -1) {
      const lastSpace = searchArea.lastIndexOf(' ');
      splitIndex = lastSpace > 0 ? lastSpace + 1 : MAX_CHUNK_SIZE;
    }
    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  return chunks;
}

// ── Grok API ────────────────────────────────────────────────────────────────
async function callGrok(messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GROK_TIMEOUT);
  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        input: messages,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText.substring(0, 300)}`);
    }
    const data = await response.json();
    if (!data.output?.[0]?.content?.[0]?.text) {
      throw new Error('Invalid Grok response - no content returned');
    }
    return data.output[0].content[0].text;
  } finally {
    clearTimeout(timeout);
  }
}

// ── ElevenLabs API ──────────────────────────────────────────────────────────
async function generateAudioBuffer(text, voiceId) {
  const controller = new AbortController();
  const chunkTimeout = setTimeout(() => controller.abort(), 90000); // 90s per chunk
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_v3',
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText.substring(0, 300)}`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(chunkTimeout);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🧪 PIPELINE TEST — hardcoded 15-min SFW story\n');

  // Sign in
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise((resolve) => rl.question(`Password for ${USER_EMAIL}: `, resolve));
  rl.close();

  const t0 = timer('Firebase Auth');
  const userCred = await signInWithEmailAndPassword(auth, USER_EMAIL, password);
  const userId = userCred.user.uid;
  t0.done();
  console.log(`  ✅ Signed in as ${userId}\n`);

  // Hardcoded recipe — SFW, 15 min, male voice
  const recipe = {
    userName: 'Test',
    setting: 'modern',
    location: 'cozy apartment',
    character: 'boyfriend',
    genderSelf: 'female',
    genderOther: 'male',
    trope: 'established relationship',
    isNighttime: false,
    duration: '15min',
    narrativeRatio: 5,
    prompt: 'rainy evening, cooking dinner together',
    features: [],
    featurePreferences: {},
  };

  const voiceId = VOICE_IDS[recipe.genderOther];
  const followUpAnswer = '';

  let recipeString = `
setting: ${recipe.setting};
location: ${recipe.location};
character: ${recipe.character};
character gender: ${recipe.genderOther};
self gender: ${recipe.genderSelf};
trope: ${recipe.trope};
`;

  // ── STEP 1: System prompt ─────────────────────────────────────────────────
  console.log('── STEP 1: Grok → system prompt ──');
  const t1 = timer('Grok system prompt');
  const systemPromptGeneration = `
Consider the following elements of one romantic scene. The user is ${recipe.genderSelf} and wants the voiceover to be that of a ${recipe.genderOther} character. The user's name is ${recipe.userName}.

The user has indicated that they want the following features: ${recipeString} and has provided the following additional details ${followUpAnswer}. These features should be incorporated subtly; the character shouldn't be too on the nose with these features but be subtle about incorporating them.

What I want you to think about is the best way to prompt an LLM to create the transcript of the voiceover that the user has requested.
Generate detailed a system prompt that will cause the LLM to generate a voiceover in the style of SFW romantic voiceovers on youtube.
In your prompt, include specific indications of content and phrases that would make sense for the character to include.
This LLM will act as the actual character; the system prompt should be as detailed as possible, and should instruct the LLM to act as the character requested by the user.
Do not include specifications with regard to time, or number of words. Do not include stage directions; the output should be pure text.
The prompt should be as detailed as possible.
When crafting this prompt, keep in mind that the goal is to create something that the listener will enjoy as much as possible.
Remember: the goal of this prompt is a narration in the style of SFW romantic audios you may find on Quinn, Dipsy or Youtube.
Make sure to include at least three necessary romantic beats that the character must include, building from the info given by the user.
Include a timeline, on how these specific acts are being performed, in what order, and how the character should transition between them.
Include a language bank with a list of phrases the character may weave in naturally into their monologue.
Do not include any nicknames, unless specifically requested in instructions above.
The character shouldn't be too verbose or literary. The output generated by your prompts should be purely romantic and never sexual.
Your output should be purely romantic and never sexual.
Make sure that the narration sounds natural and does not include any verbatim elements of the user's instructions. To make sure that the character is subtle, include instruction on words that the character shouldn't use to make sure that the character doesn't break the fourth wall and that the narration flows smoothly.
For example, if the user has indicated that they want the character to be dominant, that character SHOULD NEVER say 'look, I'm being so dominant' - the character should always show, rather than tell.
`;

  let finalSystemPrompt;
  try {
    finalSystemPrompt = await callGrok([
      { role: 'system', content: 'You an expert in LLM prompting. You do not include NSFW in your output. Your output should be purely romantic and never sexual. You do not mention any specific duration of time or word count.' },
      { role: 'user', content: systemPromptGeneration },
    ]);
    t1.done();
    console.log(`  ✅ Got system prompt (${finalSystemPrompt.length} chars)\n`);
  } catch (err) {
    t1.done();
    console.error(`  ❌ FAILED: ${err.message}\n`);
    process.exit(1);
  }

  // ── STEP 2: Transcript ────────────────────────────────────────────────────
  console.log('── STEP 2: Grok → transcript ──');
  const wordCount = 2300; // 15min
  const t2 = timer('Grok transcript');

  const finalUserPrompt = `Output a ${wordCount} word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `;

  let transcript;
  try {
    transcript = await callGrok([
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: finalUserPrompt },
    ]);
    t2.done();
    console.log(`  ✅ Got transcript: ${transcript.length} chars, ~${transcript.split(/\s+/).length} words\n`);
  } catch (err) {
    t2.done();
    console.error(`  ❌ FAILED: ${err.message}\n`);
    process.exit(1);
  }

  // ── STEP 3: ElevenLabs audio (always chunked) ────────────────────────────
  console.log('── STEP 3: ElevenLabs → audio (chunked) ──');
  const chunks = splitTextIntoChunks(transcript);
  console.log(`  Chunks: ${chunks.length} (sizes: ${chunks.map(c => c.length).join(', ')})`);

  const t3 = timer('ElevenLabs total');
  const chunkBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    const tc = timer(`  Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
    try {
      const buf = await generateAudioBuffer(chunks[i], voiceId);
      tc.done();
      console.log(`    ✅ ${(buf.length / 1024).toFixed(1)} KB`);
      chunkBuffers.push(buf);
    } catch (err) {
      tc.done();
      console.error(`    ❌ FAILED: ${err.message}`);
      process.exit(1);
    }
  }
  t3.done();
  console.log(`  ✅ ${chunkBuffers.length} chunks generated\n`);

  // ── STEP 4: Upload each chunk individually to Firebase Storage ────────────
  console.log('── STEP 4: Firebase Storage upload (per-chunk) ──');
  const t4 = timer('Firebase upload total');
  const audioChunkURLs = [];
  try {
    for (let i = 0; i < chunkBuffers.length; i++) {
      const timestamp = Date.now();
      const filename = `${userId}-${timestamp}-chunk${i}.mp3`;
      const storagePath = 'generated-audio/daytime';
      const storageRef = ref(storage, `${storagePath}/${filename}`);
      await uploadBytes(storageRef, chunkBuffers[i], { contentType: 'audio/mpeg' });
      await new Promise((r) => setTimeout(r, 300));
      const url = await getDownloadURL(storageRef);
      audioChunkURLs.push(url);
      console.log(`  ✅ Chunk ${i + 1}: ${url.substring(0, 80)}...`);
    }
    t4.done();
    console.log(`  ✅ All ${audioChunkURLs.length} chunks uploaded\n`);
  } catch (err) {
    t4.done();
    console.error(`  ❌ FAILED: ${err.message}\n`);
    process.exit(1);
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('══════════════════════════════════════');
  console.log('✅ FULL PIPELINE SUCCEEDED');
  console.log('══════════════════════════════════════');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
