/**
 * Replicate Service
 * Generates a tarot-style card image from a landscape prompt. Calls Replicate's
 * REST API directly (no Node SDK) so it runs from the browser / Expo client,
 * then polls until the prediction succeeds and returns a base64 data URL.
 */

import Constants from 'expo-constants';

const REPLICATE_API_TOKEN = Constants.expoConfig?.extra?.REPLICATE_API_TOKEN || '';

const MODEL_VERSION = '6c4ebdf049df552f8c02b3a7bbb3afec3d37b20924282bab8744f1168b6de470';

function wrapPrompt(landscape: string) {
  return `${landscape.trim()}, no text, in the style of TOK a trtcrd, tarot style`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function generateTarotCard(
  landscapePrompt: string,
): Promise<{ dataUrl: string; remoteUrl: string }> {
  if (!REPLICATE_API_TOKEN || !REPLICATE_API_TOKEN.startsWith('r8_')) {
    throw new Error(
      'REPLICATE_API_TOKEN is missing or looks invalid. Check app.config.js extras and .env.',
    );
  }

  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        prompt: wrapPrompt(landscapePrompt),
        aspect_ratio: '2:3',
        guidance_scale: 3.5,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate create failed (${createRes.status}): ${errText}`);
  }

  const created = await createRes.json();
  const getUrl: string | undefined = created?.urls?.get;
  if (!getUrl) throw new Error('Replicate create response missing urls.get');

  let prediction = created;
  const maxAttempts = 90;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (prediction.status === 'succeeded') break;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? ''}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(getUrl, {
      headers: { Authorization: `Token ${REPLICATE_API_TOKEN}` },
    });
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      throw new Error(`Replicate poll failed (${pollRes.status}): ${errText}`);
    }
    prediction = await pollRes.json();
  }

  if (prediction.status !== 'succeeded') {
    throw new Error('Replicate prediction timed out');
  }

  const output = prediction.output;
  const remoteUrl: string | undefined = Array.isArray(output) ? output[0] : output;
  if (!remoteUrl) throw new Error('Replicate returned no output');

  const imageRes = await fetch(remoteUrl);
  if (!imageRes.ok) throw new Error(`Failed to fetch generated image (${imageRes.status})`);
  const blob = await imageRes.blob();
  const dataUrl = await blobToDataUrl(blob);

  return { dataUrl, remoteUrl };
}
