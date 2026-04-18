/**
 * Vectorize a raster image (data URL) into an SVG string using imagetracerjs.
 * Web-only — relies on the DOM canvas + HTMLImageElement. Throws on native.
 */

export async function vectorizeImage(
  dataUrl: string,
): Promise<{ svg: string; width: number; height: number }> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('vectorizeImage is web-only');
  }

  const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Could not load image for vectorization.'));
    img.src = dataUrl;
  });

  const ImageTracer = (await import('imagetracerjs')).default;

  const MAX_DIM = 800;
  const scale = Math.min(1, MAX_DIM / Math.max(dims.width, dims.height));
  const w = Math.round(dims.width * scale);
  const h = Math.round(dims.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2d canvas context');

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0, w, h);
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });

  const imageData = ctx.getImageData(0, 0, w, h);
  let svg = ImageTracer.imagedataToSVG(imageData, {
    numberofcolors: 8,
    pathomit: 4,
    ltres: 0.5,
    qtres: 0.5,
    scale: 1,
    strokewidth: 0,
  });

  if (!svg.includes('viewBox')) {
    svg = svg.replace('<svg ', `<svg viewBox="0 0 ${w} ${h}" `);
  }
  svg = svg.replace(/width="[^"]*px"/, 'width="100%"');
  svg = svg.replace(/height="[^"]*px"/, 'height="100%"');

  return { svg, width: w, height: h };
}
