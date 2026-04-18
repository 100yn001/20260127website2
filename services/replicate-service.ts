/**
 * Replicate Service
 * Calls our Vercel serverless proxy at /api/replicate (which injects the
 * REPLICATE_API_TOKEN server-side and forwards to Replicate). Direct browser
 * calls to api.replicate.com are blocked by CORS.
 */

const MODEL_VERSION = '6c4ebdf049df552f8c02b3a7bbb3afec3d37b20924282bab8744f1168b6de470';

// Resolve the proxy URL relative to the current origin so it works under
// the /app baseUrl on Vercel as well as during local dev.
function proxyUrl(path: string) {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

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
  const createRes = await fetch(proxyUrl('/api/replicate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  const id: string | undefined = created?.id;
  if (!id) throw new Error('Replicate create response missing id');

  let prediction = created;
  const maxAttempts = 90;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (prediction.status === 'succeeded') break;
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? ''}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(proxyUrl(`/api/replicate?id=${encodeURIComponent(id)}`));
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
