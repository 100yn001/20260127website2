/**
 * Firebase Cloud Functions for YN Story Generation
 * Enables background story generation when app is closed
 */

import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const storage = admin.storage();

// API keys from environment variables (set in functions/.env file)
const XAI_API_KEY = process.env.XAI_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';

interface RecipeData {
  userName: string;
  setting: string;
  location: string;
  character: string;
  genderSelf: string;
  genderOther: string;
  trope: string;
  features: string[];
  featurePreferences: Record<string, string[]>;
  isNighttime: boolean;
  duration?: string;
  narrativeRatio?: number;
  voiceId?: string;
  prompt?: string;
  tags?: string[];
  narratorId?: string;
  narratorData?: any;
  coverColor?: string;
}

interface QueueItem {
  recipeData: RecipeData;
  followUpQuestions: string[];
  followUpAnswers: string[];
  status: string;
  progress: number;
  currentStep?: string;
  createdAt: admin.firestore.Timestamp;
  fcmToken?: string;
  storyId?: string;
  audioUrl?: string;
  audioChunkURLs?: string[];
  transcript?: string;
  completedAt?: admin.firestore.Timestamp;
  error?: string;
}

const DEFAULT_COVER_COLOR = '#8B7355';
const MAX_CHUNK_SIZE = 1000; // eleven_v3 has a lower char limit than older models

const VOICE_IDS = {
  male: 'Qe9WSybioZxssVEwlBSo',
  female: 'LEnmbrrxYsUYS7vsRRwD',
};

/**
 * Split text into chunks at sentence boundaries, each under MAX_CHUNK_SIZE chars.
 */
function splitTextIntoChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining.trim());
      break;
    }

    const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
    let splitIndex = -1;

    // Look for sentence endings: . ! ? followed by space or end
    for (let i = searchArea.length - 1; i >= 0; i--) {
      const char = searchArea[i];
      if ((char === '.' || char === '!' || char === '?') &&
          (i === searchArea.length - 1 || searchArea[i + 1] === ' ' || searchArea[i + 1] === '\n')) {
        splitIndex = i + 1;
        break;
      }
    }

    // Fallback: paragraph break
    if (splitIndex === -1) {
      const lastNewline = searchArea.lastIndexOf('\n');
      if (lastNewline > MAX_CHUNK_SIZE * 0.5) splitIndex = lastNewline + 1;
    }

    // Fallback: comma or semicolon
    if (splitIndex === -1) {
      for (let i = searchArea.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') {
          splitIndex = i + 1;
          break;
        }
      }
    }

    // Last resort: word boundary
    if (splitIndex === -1) {
      const lastSpace = searchArea.lastIndexOf(' ');
      splitIndex = lastSpace > 0 ? lastSpace + 1 : MAX_CHUNK_SIZE;
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Generate random depth layers for topographic artwork
 */
function generateDepthLayers(count: number = 5) {
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

/**
 * Update queue item status in Firestore
 */
async function updateQueueStatus(
  userId: string,
  queueId: string,
  updates: Partial<QueueItem>
) {
  await db.doc(`users/${userId}/queue/${queueId}`).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Send push notification when story is ready
 */
async function sendPushNotification(fcmToken: string, title: string) {
  if (!fcmToken) return;
  
  try {
    await admin.messaging().send({
      token: fcmToken,
      notification: {
        title: 'yourname',
        body: 'your story is ready',
      },
      data: {
        type: 'story_ready',
        title,
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });
    console.log('✅ Push notification sent');
  } catch (error) {
    console.error('❌ Failed to send push notification:', error);
  }
}

/**
 * Main Cloud Function: Generate story when queue item is created
 */
export const generateStory = onDocumentCreated(
  {
    document: 'users/{userId}/queue/{queueId}',
    timeoutSeconds: 540, // 9 minutes max
    memory: '1GiB',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data in snapshot');
      return;
    }

    const userId = event.params.userId;
    const queueId = event.params.queueId;
    const data = snapshot.data() as QueueItem;

    // Skip if already processing or completed
    if (data.status !== 'pending') {
      console.log(`Skipping queue item ${queueId}: status is ${data.status}`);
      return;
    }

    const recipe = data.recipeData;
    const followUpQuestions = data.followUpQuestions || [];
    const followUpAnswers = data.followUpAnswers || [];
    const fcmToken = data.fcmToken;

    console.log(`🚀 Starting story generation for user ${userId}, queue ${queueId}`);

    try {
      // Mark as generating
      await updateQueueStatus(userId, queueId, {
        status: 'generating',
        currentStep: 'generating_prompt',
        progress: 10,
      });

      // Build follow-up Q&A
      const followUpQA = followUpQuestions
        .map((q, i) => {
          const answer = followUpAnswers[i] || '';
          return answer ? `Q: ${q}\nA: ${answer}` : '';
        })
        .filter(Boolean)
        .join('\n\n');

      // Build recipe string
      let recipeString = `
setting: ${recipe.setting};
location: ${recipe.location};
character: ${recipe.character};
character gender: ${recipe.genderOther};
self gender: ${recipe.genderSelf};
trope: ${recipe.trope};
`;

      if (recipe.isNighttime && recipe.features?.length > 0) {
        const featureStrings = recipe.features.map((featureId) => {
          const prefs = recipe.featurePreferences?.[featureId] || [];
          const direction = prefs.includes('receive')
            ? 'self receives'
            : prefs.includes('give')
            ? 'self gives'
            : '';
          return `${featureId} in the following direction: ${direction}`;
        });
        recipeString += `features: ${featureStrings.join('; ')}`;
      }

      // STEP 1: Generate system prompt
      console.log('📝 Step 1: Generating system prompt...');
      
      const systemPromptGeneration = `
Consider the following elements of one ${recipe.isNighttime ? 'sex' : 'romantic'} scene. The user is ${recipe.genderSelf} and wants the voiceover to be that of a ${recipe.genderOther} character. The user's name is ${recipe.userName}.

The user has indicated that they want the following features: ${recipeString} and has provided the following additional details ${followUpQA}. These features should be incorporated subtly; the character shouldn't be too on the nose with these features but be subtle about incorporating them.

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
Make sure that the narration sounds natural and does not include any verbatim elements of the user's instructions.
`;

      const systemPromptResponse = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            {
              role: 'system',
              content: `You an expert in LLM prompting. ${recipe.isNighttime ? 'You are welcome to include nsfw content in your prompts.' : 'You do not include NSFW in your output.'}`,
            },
            { role: 'user', content: systemPromptGeneration },
          ],
        }),
      });

      if (!systemPromptResponse.ok) {
        throw new Error(`Grok API error: ${systemPromptResponse.status}`);
      }

      const systemPromptData = await systemPromptResponse.json();
      const finalSystemPrompt = systemPromptData.output?.[0]?.content?.[0]?.text;
      
      if (!finalSystemPrompt) {
        throw new Error('No system prompt generated');
      }

      console.log('✅ System prompt generated');

      // Update progress
      await updateQueueStatus(userId, queueId, {
        currentStep: 'generating_transcript',
        progress: 30,
      });

      // STEP 2: Generate transcript
      console.log('📝 Step 2: Generating transcript...');
      
      const wordCount =
        recipe.duration === '1min' ? 150 :
        recipe.duration === '5min' ? 800 :
        recipe.duration === '15min' ? 2300 : 1500;

      const narrativeRatioValue = recipe.narrativeRatio ?? 5;
      const narrativePercentage = (10 - narrativeRatioValue) * 10;
      const directPercentage = narrativeRatioValue * 10;

      const finalUserPrompt = recipe.isNighttime
        ? `Output a ${wordCount} word narration. Output ZERO stage directions, sound effects, or onomatopeias, except the following, as appropriate: [slowly], 'hmmmmm', 'ahhhhh', [chuckles]. Do not output any mention of word count. Your output should be ${narrativePercentage}% narration and ${directPercentage}% direct speech, straight to the point, just plain sex, first person, talking directly to the user, describing the sexual beats. DO NOT describe what you are doing, just do it. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character.`
        : `Output a ${wordCount} word SFW romantic narration. Output ZERO stage directions, sound effects, or onomatopeias. Do not output any mention of word count. The narration should be direct, you should be doing and not describing what you are doing. You should not narrate, you ARE the character.`;

      const transcriptResponse = await fetch('https://api.x.ai/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-4-1-fast-reasoning',
          input: [
            { role: 'system', content: finalSystemPrompt },
            { role: 'user', content: finalUserPrompt },
          ],
        }),
      });

      if (!transcriptResponse.ok) {
        throw new Error(`Grok API error: ${transcriptResponse.status}`);
      }

      const transcriptData = await transcriptResponse.json();
      const transcript = transcriptData.output?.[0]?.content?.[0]?.text;

      if (!transcript) {
        throw new Error('No transcript generated');
      }

      console.log('✅ Transcript generated, length:', transcript.length);

      // Update progress
      await updateQueueStatus(userId, queueId, {
        currentStep: 'generating_audio',
        progress: 50,
      });

      // STEP 3: Generate audio (chunked)
      console.log('🎤 Step 3: Generating audio (chunked)...');
      
      const voiceId = recipe.voiceId || VOICE_IDS[recipe.genderOther as 'male' | 'female'] || VOICE_IDS.male;
      const chunks = splitTextIntoChunks(transcript);
      console.log(`📝 Split into ${chunks.length} chunk(s) for TTS`);

      const chunkBuffers: Buffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`🎤 Generating chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
        const audioResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
              text: chunks[i],
              model_id: 'eleven_v3',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.5,
              },
            }),
          }
        );

        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          throw new Error(`ElevenLabs API error (chunk ${i}): ${audioResponse.status} - ${errorText}`);
        }

        chunkBuffers.push(Buffer.from(await audioResponse.arrayBuffer()));
        console.log(`✅ Chunk ${i + 1} generated: ${(chunkBuffers[i].length / 1024).toFixed(1)} KB`);
      }

      // Update progress
      await updateQueueStatus(userId, queueId, {
        currentStep: 'uploading',
        progress: 75,
      });

      // STEP 4: Upload each chunk individually to Firebase Storage
      console.log('📤 Step 4: Uploading chunks to Storage...');
      
      const bucket = storage.bucket();
      const timestamp = Date.now();
      const folder = recipe.isNighttime ? 'generated-audio/nighttime' : 'generated-audio/daytime';
      const audioChunkURLs: string[] = [];

      for (let i = 0; i < chunkBuffers.length; i++) {
        const filePath = `${folder}/${userId}-${timestamp}-chunk${i}.mp3`;
        const file = bucket.file(filePath);

        await file.save(chunkBuffers[i], {
          metadata: {
            contentType: 'audio/mpeg',
          },
        });

        await file.makePublic();
        const chunkUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        audioChunkURLs.push(chunkUrl);
        console.log(`✅ Chunk ${i + 1} uploaded: ${chunkUrl.substring(0, 80)}...`);
      }

      const audioUrl = audioChunkURLs[0];
      
      console.log('✅ Audio uploaded:', audioUrl);

      // STEP 5: Save story to Firestore
      console.log('💾 Step 5: Saving story...');
      
      const createdAt = admin.firestore.Timestamp.now();
      const title = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });

      const storyData: any = {
        title,
        audioUrl,
        audioChunkURLs,
        transcript,
        prompt: recipe.prompt || null,
        tags: recipe.tags || [],
        setting: recipe.setting,
        location: recipe.location,
        character: recipe.character,
        genderSelf: recipe.genderSelf,
        genderOther: recipe.genderOther,
        trope: recipe.trope,
        isNighttime: recipe.isNighttime,
        features: recipe.features || [],
        featurePreferences: recipe.featurePreferences || {},
        duration: recipe.duration || '10min',
        narrativeRatio: recipe.narrativeRatio || 5,
        createdAt,
        coverColor: recipe.coverColor || DEFAULT_COVER_COLOR,
        topographyLayers: generateDepthLayers(5),
      };

      if (recipe.narratorId) {
        storyData.narratorId = recipe.narratorId;
      }

      const storyRef = await db.collection(`users/${userId}/stories`).add(storyData);
      const storyId = storyRef.id;

      console.log('✅ Story saved with ID:', storyId);

      // STEP 6: Update queue item as complete
      await updateQueueStatus(userId, queueId, {
        status: 'complete',
        currentStep: 'complete',
        progress: 100,
        storyId,
        audioUrl,
        audioChunkURLs,
        transcript,
        completedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      });

      // STEP 7: Send push notification
      if (fcmToken) {
        await sendPushNotification(fcmToken, title);
      }

      console.log(`🎉 Story generation complete for queue ${queueId}`);
    } catch (error: any) {
      console.error('❌ Story generation failed:', error);

      await updateQueueStatus(userId, queueId, {
        status: 'error',
        currentStep: 'error',
        error: error.message || 'Unknown error',
      });
    }
  }
);
