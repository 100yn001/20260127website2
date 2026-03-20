#!/usr/bin/env node

/**
 * CLI script to generate and add stories to Firebase
 * without going through the frontend.
 *
 * Replicates the exact same pipeline as the app:
 *   1. Grok → system prompt
 *   2. Grok → transcript
 *   3. ElevenLabs → audio
 *   4. Firebase Storage → upload audio
 *   5. Firestore → save story document
 *
 * Usage:
 *   node scripts/add-story.mjs
 *
 * Requires .env with:
 *   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
 *   FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID, FIREBASE_APP_ID,
 *   XAI, ELEVENLABS
 */

import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getFirestore, setDoc, Timestamp } from 'firebase/firestore';
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

// ── API keys ────────────────────────────────────────────────────────────────

const XAI_API_KEY = process.env.XAI || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS || '';

if (!XAI_API_KEY) { console.error('❌ Missing XAI key in .env'); process.exit(1); }
if (!ELEVENLABS_API_KEY) { console.error('❌ Missing ELEVENLABS key in .env'); process.exit(1); }

// ── Constants ───────────────────────────────────────────────────────────────

const VOICE_IDS = {
  male: 'Qe9WSybioZxssVEwlBSo',
  female: 'LEnmbrrxYsUYS7vsRRwD',
};

const DEFAULT_COVER_COLOR = '#7f1d1d';
const MAX_CHUNK_SIZE = 1000; // eleven_v3 has a lower char limit than older models
const GROK_TIMEOUT = 5 * 60 * 1000;
const USER_EMAIL = 'ellepotterhead2006@gmail.com';

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateDepthLayers(count = 5) {
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

function splitTextIntoChunks(text) {
  if (text.length <= MAX_CHUNK_SIZE) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > MAX_CHUNK_SIZE) {
    let splitIndex = remaining.lastIndexOf('. ', MAX_CHUNK_SIZE);
    if (splitIndex === -1 || splitIndex < MAX_CHUNK_SIZE * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', MAX_CHUNK_SIZE);
    }
    if (splitIndex === -1) splitIndex = MAX_CHUNK_SIZE;
    else splitIndex += 1;
    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const askWithDefault = async (q, defaultVal) => {
  const answer = await ask(`${q} [${defaultVal}]: `);
  return answer.trim() || defaultVal;
};

const askMultiline = async (prompt) => {
  console.log(`${prompt} (enter an empty line to finish):`);
  const lines = [];
  while (true) {
    const line = await ask('  ');
    if (line.trim() === '') break;
    lines.push(line);
  }
  return lines.join('\n');
};

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
  console.log(`    📏 Sending ${text.length} chars to ElevenLabs...`);
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
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText.substring(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

// ── Firebase helpers ────────────────────────────────────────────────────────

async function saveStory(userId, storyData) {
  const storyRef = doc(collection(db, 'stories'));
  await setDoc(storyRef, {
    id: storyRef.id,
    userId,
    ...storyData,
    createdAt: Timestamp.fromDate(storyData.createdAt),
  });
  return storyRef.id;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🎙️  YN Story Generator (CLI)       ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Sign in
  const password = await ask(`Enter password for ${USER_EMAIL}: `);
  console.log('🔑 Signing in...');
  const userCred = await signInWithEmailAndPassword(auth, USER_EMAIL, password);
  const userId = userCred.user.uid;
  console.log(`✅ Signed in as ${userId}\n`);

  // ── Collect recipe inputs ───────────────────────────────────────────────

  console.log('── Recipe ──────────────────────────────');
  const userName = await askWithDefault('Your name in the story', 'you');
  const setting = await ask('Setting (e.g. modern, medieval, victorian): ');
  const location = await ask('Location (e.g. bedroom, library, garden): ');
  const character = await ask('Character (e.g. best friend, professor, stranger): ');
  const genderSelf = await askWithDefault('Your gender (male/female)', 'female');
  const genderOther = await askWithDefault('Character gender (male/female)', 'male');
  const trope = await ask('Trope (e.g. friends to lovers, forbidden love): ');
  const isNighttimeStr = await askWithDefault('Nighttime / NSFW? (yes/no)', 'yes');
  const isNighttime = isNighttimeStr.toLowerCase().startsWith('y');
  const duration = await askWithDefault('Duration (5min/10min/15min)', '10min');
  const narrativeRatio = parseInt(await askWithDefault('Narrative ratio 0-10 (0=all narration, 10=all direct)', '5'), 10);
  const prompt = await ask('Additional notes / prompt (optional): ');

  let features = [];
  let featurePreferences = {};
  if (isNighttime) {
    const featuresStr = await ask('Features (comma-separated, e.g. "dirty talk, praise"): ');
    features = featuresStr ? featuresStr.split(',').map((f) => f.trim()).filter(Boolean) : [];
    for (const feat of features) {
      const dir = await askWithDefault(`  "${feat}" direction (give/receive)`, 'receive');
      featurePreferences[feat] = [dir.trim()];
    }
  }

  const voiceIdInput = await ask(`Voice ID (or press enter for default ${genderOther}): `);
  const voiceId = voiceIdInput.trim() || VOICE_IDS[genderOther] || VOICE_IDS.male;

  const narratorId = await ask('Narrator ID (optional, press enter to skip): ');
  const coverColor = await askWithDefault('Cover color (hex)', DEFAULT_COVER_COLOR);

  // Optional: follow-up Q&A
  console.log('\n── Follow-up Q&A (optional) ────────────');
  const wantFollowUp = await askWithDefault('Provide follow-up Q&A? (yes/no)', 'no');
  let followUpQuestions = [];
  let followUpAnswers = [];

  if (wantFollowUp.toLowerCase().startsWith('y')) {
    const numQA = parseInt(await askWithDefault('How many Q&A pairs?', '4'), 10);
    for (let i = 0; i < numQA; i++) {
      const q = await ask(`  Q${i + 1}: `);
      const a = await ask(`  A${i + 1}: `);
      followUpQuestions.push(q);
      followUpAnswers.push(a);
    }
  }

  const recipe = {
    userName, setting, location, character,
    genderSelf, genderOther, trope, isNighttime,
    duration, narrativeRatio, prompt,
    features, featurePreferences,
    voiceId,
    narratorId: narratorId.trim() || undefined,
    coverColor,
  };

  console.log('\n── Recipe summary ──────────────────────');
  console.log(JSON.stringify(recipe, null, 2));
  const confirm = await askWithDefault('\nProceed? (yes/no)', 'yes');
  if (!confirm.toLowerCase().startsWith('y')) {
    console.log('Aborted.');
    process.exit(0);
  }

  // ── Generate ────────────────────────────────────────────────────────────

  // Combine Q&A
  const followUpQA = followUpQuestions.map((q, i) => {
    const answer = followUpAnswers[i] || '';
    return answer ? `Q: ${q}\nA: ${answer}` : '';
  }).filter(Boolean).join('\n\n');
  const followUpAnswer = followUpQA || followUpAnswers.join(' ');

  let recipeString = `
setting: ${recipe.setting};
location: ${recipe.location};
character: ${recipe.character};
character gender: ${recipe.genderOther};
self gender: ${recipe.genderSelf};
trope: ${recipe.trope};
`;
  if (recipe.isNighttime && recipe.features.length > 0) {
    const featureStrings = recipe.features.map((featureId) => {
      const prefs = recipe.featurePreferences[featureId] || [];
      const direction = prefs.includes('receive') ? 'self receives' : prefs.includes('give') ? 'self gives' : '';
      return `${featureId} in the following direction: ${direction}`;
    });
    recipeString += `features: ${featureStrings.join('; ')}`;
  }

  // STEP 1: Generate system prompt
  console.log('\n📝 Step 1: Generating system prompt via Grok...');
  const systemPromptGeneration = `
Consider the following elements of one ${recipe.isNighttime ? 'sex' : 'romantic'} scene. The user is ${recipe.genderSelf} and wants the voiceover to be that of a ${recipe.genderOther} character. The user's name is ${recipe.userName}.

The user has indicated that they want the following features: ${recipeString} and has provided the following additional details ${followUpAnswer}. These features should be incorporated subtly; the character shouldn't be too on the nose with these features but be subtle about incorporating them.

What I want you to think about is the best way to prompt an LLM to create the transcript of the voiceover that the user has requested.
Generate detailed a system prompt that will cause the LLM to generate a voiceover in the style of ${recipe.isNighttime ? 'sexual' : 'SFW romantic'} voiceovers on youtube.
In your prompt, include specific indications of content and phrases that would make sense for the character to include.
This LLM will act as the actual character; the system prompt should be as detailed as possible, and should instruct the LLM to act as the character requested by the user.
Do not include specifications with regard to time, or number of words. Do not include stage directions; the output should be pure text.
The prompt should be as detailed as possible.
When crafting this prompt, keep in mind that the goal is to create something that the listener will enjoy as much as possible.
Remember: the goal of this prompt is a narration in the style of ${recipe.isNighttime ? 'NSFW sexual' : 'SFW romantic'} audios you may find on Quinn, Dipsy or Youtube.
Make sure to include at least three necessary ${recipe.isNighttime ? 'erotic' : 'romantic'} beats that the character must ${recipe.isNighttime ? 'hit (specific sex acts, sex positions, etc.)' : 'include'}, building from the info given by the user.
Include a timeline, on how these specific acts are being performed, in what order, and how the character should transition between them.
Include a language bank with a list of phrases the character may weave in naturally into their monologue.
Do not include any nicknames, unless specifically requested in instructions above.
The character shouldn't be too verbose or literary. The output generated by your prompts should be ${recipe.isNighttime ? 'explicitely sexual' : 'purely romantic and never sexual'}.
${recipe.isNighttime ? "The LLM's output should be graphic and not ambiguous, with EXPLICIT references to the sexual acts that the character performs." : 'Your output should be purely romantic and never sexual.'}
Make sure that the narration sounds natural and does not include any verbatim elements of the user's instructions. To make sure that the character is subtle, include instruction on words that the character shouldn't use to make sure that the character doesn't break the fourth wall and that the narration flows smoothly.
For example, if the user has indicated that they want the character to be dominant, that character SHOULD NEVER say 'look, I'm being so dominant' - the character should always show, rather than tell.
`;

  const finalSystemPrompt = await callGrok([
    {
      role: 'system',
      content: `You an expert in LLM prompting. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include NSFW in your output. Your output should be purely romantic and never sexual.'} You do not mention any specific duration of time or word count.`,
    },
    { role: 'user', content: systemPromptGeneration },
  ]);
  console.log('✅ System prompt generated');

  // STEP 2: Generate transcript
  const wordCount = recipe.duration === '1min' ? 150 : recipe.duration === '5min' ? 800 : recipe.duration === '15min' ? 2300 : 1500;
  const narrativeRatioValue = recipe.narrativeRatio ?? 5;
  const narrativePercentage = (10 - narrativeRatioValue) * 10;
  const directPercentage = narrativeRatioValue * 10;

  const finalUserPrompt = recipe.isNighttime
    ? `Output a ${wordCount} word narration. Output ZERO stage directions, sound effects, or onomatopeias, except the following, as appropriate: [slowly], 'hmmmmm', 'ahhhhh', [chuckles]. Do not output any mention of word count. Your output should be ${narrativePercentage}% description of the environment and of what actions are taking place -- "see how I am doing X", things like that -- and ${directPercentage}% direct speech, straight to the point, just plain sex, first person, talking directly to the user, "you feel so good", "you like that?", direct things like that -- not necesarily verbatim, but in that spirit, describing the sexual beats. DO NOT describe what you are doing, just do it. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `
    : `Output a ${wordCount} word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character. `;

  console.log('📝 Step 2: Generating transcript via Grok...');
  const transcript = await callGrok([
    { role: 'system', content: finalSystemPrompt },
    { role: 'user', content: finalUserPrompt },
  ]);
  console.log(`✅ Transcript generated (${transcript.length} chars, ~${transcript.split(/\s+/).length} words)`);

  // STEP 3: Generate audio with ElevenLabs (always chunked)
  console.log('🎤 Step 3: Generating audio with ElevenLabs...');
  const chunks = splitTextIntoChunks(transcript);
  console.log(`  📝 Split into ${chunks.length} chunks`);

  const chunkBuffers = [];
  for (let i = 0; i < chunks.length; i++) {
    console.log(`  🎤 Chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    const buf = await generateAudioBuffer(chunks[i], voiceId);
    chunkBuffers.push(buf);
    console.log(`  ✅ Chunk ${i + 1}: ${(buf.length / 1024).toFixed(1)} KB`);
  }

  // STEP 4: Upload each chunk individually to Firebase Storage
  console.log('📤 Step 4: Uploading chunks to Firebase Storage...');
  const audioChunkURLs = [];
  for (let i = 0; i < chunkBuffers.length; i++) {
    const timestamp = Date.now();
    const filename = `${userId}-${timestamp}-chunk${i}.mp3`;
    const storagePath = recipe.isNighttime ? 'generated-audio/nighttime' : 'generated-audio/daytime';
    const storageRef = ref(storage, `${storagePath}/${filename}`);
    await uploadBytes(storageRef, chunkBuffers[i], { contentType: 'audio/mpeg' });
    await new Promise((r) => setTimeout(r, 300));
    const url = await getDownloadURL(storageRef);
    audioChunkURLs.push(url);
    console.log(`  ✅ Chunk ${i + 1} uploaded: ${url.substring(0, 80)}...`);
  }
  console.log(`✅ All ${audioChunkURLs.length} chunks uploaded`);

  // STEP 5: Save story to Firestore
  console.log('💾 Step 5: Saving story to Firestore...');
  const createdAt = new Date();
  const title = createdAt.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const storyData = {
    title,
    audioUrl: audioChunkURLs[0],
    audioChunkURLs,
    transcript,
    prompt: recipe.prompt || '',
    tags: [],
    setting: recipe.setting,
    location: recipe.location,
    character: recipe.character,
    genderSelf: recipe.genderSelf,
    genderOther: recipe.genderOther,
    trope: recipe.trope,
    isNighttime: recipe.isNighttime,
    features: recipe.features,
    featurePreferences: recipe.featurePreferences,
    duration: recipe.duration || '10min',
    narrativeRatio: recipe.narrativeRatio || 5,
    createdAt,
    coverColor: recipe.coverColor || DEFAULT_COVER_COLOR,
    topographyLayers: generateDepthLayers(5),
  };

  if (recipe.narratorId) {
    storyData.narratorId = recipe.narratorId;
  }

  const storyId = await saveStory(userId, storyData);

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   ✅  Story created successfully!     ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`  Story ID:  ${storyId}`);
  console.log(`  Title:     ${title}`);
  console.log(`  Audio:     ${audioChunkURLs[0].substring(0, 80)}...`);
  console.log(`  Transcript: ${transcript.substring(0, 100)}...`);

  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  rl.close();
  process.exit(1);
});
