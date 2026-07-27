/**
 * Silver-card texture baking (web-only, DOM canvas).
 *
 * The 3D card's expensive part is its "skin": the color map and emboss bump
 * map derived from the vectorized artwork. Everything else (geometry, lights,
 * controls) rebuilds in milliseconds. This module bakes that skin once so it
 * can be persisted as two PNGs and reloaded instantly by CardScene.
 *
 * No top-level DOM access — safe to include in a shared bundle; callers gate
 * on web before invoking.
 */

export interface SilverCanvases {
  /** Blurred inverted-luminance canvas driving the emboss bump map. */
  bumpCanvas: HTMLCanvasElement;
  /** Silver-toned color canvas the card face is painted with. */
  colorCanvas: HTMLCanvasElement;
}

export function bakeSilverCanvases(
  svgString: string,
  texW: number,
  texH: number,
): Promise<SilverCanvases> {
  return new Promise((resolve, reject) => {
    let svg = svgString
      .replace(/width="[^"]*"/, `width="${texW}"`)
      .replace(/height="[^"]*"/, `height="${texH}"`);
    if (!svg.includes('xmlns="')) {
      svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }

    const img = new Image();
    img.onload = () => {
      const raw = document.createElement('canvas');
      raw.width = texW;
      raw.height = texH;
      const rCtx = raw.getContext('2d')!;
      rCtx.fillStyle = '#000000';
      rCtx.fillRect(0, 0, texW, texH);
      rCtx.drawImage(img, 0, 0, texW, texH);

      const id = rCtx.getImageData(0, 0, texW, texH);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const inv = 255 - g;
        d[i] = d[i + 1] = d[i + 2] = inv;
      }
      rCtx.putImageData(id, 0, 0);

      let src: HTMLCanvasElement = raw;
      for (let pass = 0; pass < 3; pass++) {
        const blurred = document.createElement('canvas');
        blurred.width = texW;
        blurred.height = texH;
        const bCtx = blurred.getContext('2d')!;
        bCtx.filter = 'blur(6px)';
        bCtx.drawImage(src, 0, 0);
        bCtx.filter = 'none';
        src = blurred;
      }

      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = texW;
      colorCanvas.height = texH;
      const cCtx = colorCanvas.getContext('2d')!;
      cCtx.drawImage(src, 0, 0);
      const colorData = cCtx.getImageData(0, 0, texW, texH);
      const cd = colorData.data;
      for (let i = 0; i < cd.length; i += 4) {
        const t = cd[i] / 255;
        const val = 130 + t * 80;
        cd[i] = cd[i + 1] = cd[i + 2] = val;
      }
      cCtx.putImageData(colorData, 0, 0);

      resolve({ bumpCanvas: src, colorCanvas });
    };
    img.onerror = () => reject(new Error('SVG rasterize failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas toBlob failed'))),
      'image/png',
    );
  });
}

/** Bake the silver skin and return it as two PNG blobs ready for upload. */
export async function bakeSilverTextureBlobs(
  svgString: string,
  texW: number,
  texH: number,
): Promise<{ colorBlob: Blob; bumpBlob: Blob }> {
  const { bumpCanvas, colorCanvas } = await bakeSilverCanvases(svgString, texW, texH);
  const [colorBlob, bumpBlob] = await Promise.all([
    canvasToPngBlob(colorCanvas),
    canvasToPngBlob(bumpCanvas),
  ]);
  return { colorBlob, bumpBlob };
}
