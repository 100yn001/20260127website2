#!/usr/bin/env node
/**
 * Test script for full story generation flow
 * Tests: Grok API -> Text chunking -> ElevenLabs (multiple chunks) -> Audio combination
 * Run with: node test-full-generation.js
 */

require('dotenv').config();

const XAI_API_KEY = process.env.XAI;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS;
const MAX_CHUNK_SIZE = 4500;

console.log('\n🔑 API Key Check:');
console.log('  XAI:', XAI_API_KEY ? `✓ (${XAI_API_KEY.substring(0, 8)}...)` : '✗ MISSING');
console.log('  ELEVENLABS:', ELEVENLABS_API_KEY ? `✓ (${ELEVENLABS_API_KEY.substring(0, 8)}...)` : '✗ MISSING');

if (!XAI_API_KEY || !ELEVENLABS_API_KEY) {
  console.error('\n❌ Missing API keys');
  process.exit(1);
}

// Text chunking function (same as in audio-generation.ts)
function splitTextIntoChunks(text) {
  if (text.length <= MAX_CHUNK_SIZE) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_SIZE) {
      chunks.push(remaining.trim());
      break;
    }

    const searchArea = remaining.substring(0, MAX_CHUNK_SIZE);
    let splitIndex = -1;
    
    // Search backwards for sentence boundary
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
      if (lastNewline > MAX_CHUNK_SIZE * 0.5) {
        splitIndex = lastNewline + 1;
      }
    }

    if (splitIndex === -1) {
      for (let i = searchArea.length - 1; i >= MAX_CHUNK_SIZE * 0.5; i--) {
        if (searchArea[i] === ',' || searchArea[i] === ';') {
          splitIndex = i + 1;
          break;
        }
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

async function generateTranscript() {
  console.log('\n📝 Step 1: Generating transcript with Grok...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  
  // Generate a longer transcript to test chunking
  const prompt = `Write a romantic scene of about 800 words. A cozy evening at home where two people who have been dating for a few months are cooking dinner together. Include dialogue, sensory details, and emotional moments. Make it heartfelt and intimate but appropriate.`;
  
  try {
    const startTime = Date.now();
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-fast-reasoning',
        messages: [
          { role: 'system', content: 'You are a skilled romantic fiction writer. Write vivid, emotional scenes.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    const elapsed = Date.now() - startTime;
    console.log(`  Response time: ${elapsed}ms`);
    console.log(`  Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('  ❌ API Error:', errorText);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('  ❌ Unexpected response structure');
      return null;
    }
    
    const transcript = data.choices[0].message.content;
    console.log(`  ✅ Transcript generated: ${transcript.length} chars`);
    console.log(`  Preview: ${transcript.substring(0, 150)}...`);
    return transcript;
    
  } catch (error) {
    clearTimeout(timeout);
    console.error('  ❌ Error:', error.message);
    return null;
  }
}

async function generateAudioChunk(text, chunkIndex, totalChunks) {
  const voiceId = 'LEnmbrrxYsUYS7vsRRwD'; // Female voice
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  
  console.log(`  🎤 Generating chunk ${chunkIndex + 1}/${totalChunks} (${text.length} chars)...`);
  
  try {
    const startTime = Date.now();
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_v3',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5,
          },
        }),
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`  ❌ Chunk ${chunkIndex + 1} API Error:`, errorText);
      return null;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('audio')) {
      console.error(`  ❌ Chunk ${chunkIndex + 1} returned non-audio:`, contentType);
      return null;
    }
    
    const audioBuffer = await response.arrayBuffer();
    console.log(`  ✅ Chunk ${chunkIndex + 1} complete: ${(audioBuffer.byteLength / 1024).toFixed(1)} KB in ${elapsed}ms`);
    return audioBuffer;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error(`  ❌ Chunk ${chunkIndex + 1} timed out`);
    } else {
      console.error(`  ❌ Chunk ${chunkIndex + 1} error:`, error.message);
    }
    return null;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('🧪 FULL STORY GENERATION TEST');
  console.log('========================================');
  
  const overallStart = Date.now();
  
  // Step 1: Generate transcript
  const transcript = await generateTranscript();
  if (!transcript) {
    console.log('\n❌ Failed to generate transcript');
    process.exit(1);
  }
  
  // Step 2: Split into chunks
  console.log('\n📝 Step 2: Splitting transcript into chunks...');
  const chunks = splitTextIntoChunks(transcript);
  console.log(`  Chunks: ${chunks.length}`);
  chunks.forEach((chunk, i) => {
    console.log(`  - Chunk ${i + 1}: ${chunk.length} chars`);
  });
  
  // Step 3: Generate audio for each chunk
  console.log('\n🎤 Step 3: Generating audio with ElevenLabs (eleven_v3)...');
  const audioBuffers = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const buffer = await generateAudioChunk(chunks[i], i, chunks.length);
    if (!buffer) {
      console.log('\n❌ Failed to generate audio chunk');
      process.exit(1);
    }
    audioBuffers.push(buffer);
  }
  
  // Step 4: Combine audio
  console.log('\n📦 Step 4: Combining audio chunks...');
  const totalSize = audioBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  console.log(`  Total audio size: ${(totalSize / 1024).toFixed(1)} KB (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
  
  const overallTime = Date.now() - overallStart;
  
  console.log('\n========================================');
  console.log('📊 RESULTS SUMMARY');
  console.log('========================================');
  console.log(`  Transcript: ${transcript.length} chars`);
  console.log(`  Chunks: ${chunks.length}`);
  console.log(`  Audio size: ${(totalSize / 1024).toFixed(1)} KB`);
  console.log(`  Total time: ${(overallTime / 1000).toFixed(1)}s`);
  console.log('\n✅ Full generation test PASSED!');
  console.log('========================================\n');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
