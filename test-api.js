#!/usr/bin/env node
/**
 * Test script for Grok and ElevenLabs API calls
 * Run with: node test-api.js
 */

require('dotenv').config();

const XAI_API_KEY = process.env.XAI;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS;

console.log('\n🔑 API Key Check:');
console.log('  XAI:', XAI_API_KEY ? `✓ (${XAI_API_KEY.substring(0, 8)}...)` : '✗ MISSING');
console.log('  ELEVENLABS:', ELEVENLABS_API_KEY ? `✓ (${ELEVENLABS_API_KEY.substring(0, 8)}...)` : '✗ MISSING');

if (!XAI_API_KEY) {
  console.error('\n❌ XAI API key not found in .env file');
  process.exit(1);
}

async function testGrokAPI() {
  console.log('\n📝 Step 1: Testing Grok API (simple prompt)...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
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
          { role: 'system', content: 'You are a helpful assistant. Be very brief.' },
          { role: 'user', content: 'Say "Hello, the API is working!" in exactly those words.' },
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
      return false;
    }
    
    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('  ❌ Unexpected response structure:', JSON.stringify(data, null, 2));
      return false;
    }
    
    console.log('  ✅ Response:', data.choices[0].message.content.substring(0, 100));
    return true;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error('  ❌ Request timed out after 30 seconds');
    } else {
      console.error('  ❌ Error:', error.message);
    }
    return false;
  }
}

async function testGrokLongPrompt() {
  console.log('\n📝 Step 2: Testing Grok API (longer prompt like story generation)...');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000); // 90 second timeout
  
  const systemPrompt = `You are an expert in creative writing. Generate a brief romantic scene description.`;
  const userPrompt = `Write a 100-word romantic scene set in a cozy coffee shop. Be descriptive but brief.`;
  
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
      return false;
    }
    
    const data = await response.json();
    
    if (!data.choices?.[0]?.message?.content) {
      console.error('  ❌ Unexpected response structure:', JSON.stringify(data, null, 2));
      return false;
    }
    
    const content = data.choices[0].message.content;
    console.log('  ✅ Response length:', content.length, 'chars');
    console.log('  Preview:', content.substring(0, 150) + '...');
    return true;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error('  ❌ Request timed out after 90 seconds');
    } else {
      console.error('  ❌ Error:', error.message);
    }
    return false;
  }
}

async function testElevenLabsAPI() {
  if (!ELEVENLABS_API_KEY) {
    console.log('\n🎤 Step 3: Skipping ElevenLabs test (no API key)');
    return true;
  }
  
  console.log('\n🎤 Step 3: Testing ElevenLabs API...');
  
  const voiceId = 'LEnmbrrxYsUYS7vsRRwD'; // Female voice
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
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
          text: 'Hello, this is a test of the audio generation API.',
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
    console.log(`  Response time: ${elapsed}ms`);
    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('  ❌ API Error:', errorText);
      return false;
    }
    
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('audio')) {
      console.error('  ❌ Expected audio but got:', contentType);
      return false;
    }
    
    console.log('  ✅ Audio response received successfully');
    return true;
    
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error('  ❌ Request timed out after 30 seconds');
    } else {
      console.error('  ❌ Error:', error.message);
    }
    return false;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('🧪 API TEST SCRIPT');
  console.log('========================================');
  
  const results = {
    grokSimple: await testGrokAPI(),
    grokLong: await testGrokLongPrompt(),
    elevenLabs: await testElevenLabsAPI(),
  };
  
  console.log('\n========================================');
  console.log('📊 RESULTS SUMMARY');
  console.log('========================================');
  console.log('  Grok (simple):', results.grokSimple ? '✅ PASS' : '❌ FAIL');
  console.log('  Grok (long):', results.grokLong ? '✅ PASS' : '❌ FAIL');
  console.log('  ElevenLabs:', results.elevenLabs ? '✅ PASS' : '❌ FAIL');
  
  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + (allPassed ? '✅ All tests passed!' : '❌ Some tests failed'));
  console.log('========================================\n');
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
