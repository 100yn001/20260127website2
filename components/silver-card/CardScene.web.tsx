import { ContactShadows, Environment, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

interface CardTextures {
  bumpTex: THREE.CanvasTexture;
  colorTex: THREE.CanvasTexture;
}

function createCardTextures(
  svgString: string,
  texW: number,
  texH: number,
): Promise<CardTextures> {
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

      const bumpTex = new THREE.CanvasTexture(src);
      bumpTex.needsUpdate = true;

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
      const colorTex = new THREE.CanvasTexture(colorCanvas);
      colorTex.colorSpace = THREE.SRGBColorSpace;
      colorTex.needsUpdate = true;

      resolve({ bumpTex, colorTex });
    };
    img.onerror = () => reject(new Error('SVG rasterize failed'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    // Stored silver-card images live on Firebase Storage which serves CORS
    // headers, so anonymous access works for use as a WebGL texture.
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      (err) => reject(err),
    );
  });
}

function SilverCard({
  svgString,
  imageUrl,
  aspectRatio,
  onReady,
}: {
  svgString?: string;
  imageUrl?: string;
  aspectRatio: number;
  onReady?: () => void;
}) {
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const [texturesReady, setTexturesReady] = useState(false);
  const { invalidate } = useThree();

  const maxExtent = 1.8;
  const cardWidth = aspectRatio >= 1 ? maxExtent : maxExtent * aspectRatio;
  const cardHeight = aspectRatio >= 1 ? maxExtent / aspectRatio : maxExtent;

  const cardGeo = useMemo(() => {
    const w = cardWidth / 2;
    const h = cardHeight / 2;
    const r = 0.03;
    const depth = 0.01;

    const shape = new THREE.Shape();
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);

    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);

    const pos = geo.attributes.position;
    const uvs = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + w) / (2 * w);
      const v = (pos.getY(i) + h) / (2 * h);
      uvs.setXY(i, u, v);
    }
    uvs.needsUpdate = true;

    return geo;
  }, [cardWidth, cardHeight]);

  useEffect(() => {
    const texW = 1024;
    const texH = Math.round(1024 / aspectRatio);
    let cancelled = false;

    const apply = (bumpTex: THREE.Texture | null, colorTex: THREE.Texture) => {
      if (cancelled || !matRef.current) return;
      if (bumpTex) {
        matRef.current.bumpMap = bumpTex;
        matRef.current.bumpScale = 0.06;
      } else {
        matRef.current.bumpMap = null;
        matRef.current.bumpScale = 0;
      }
      matRef.current.map = colorTex;
      matRef.current.needsUpdate = true;
      setTexturesReady(true);
      invalidate();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) onReady?.();
        });
      });
    };

    if (svgString) {
      createCardTextures(svgString, texW, texH)
        .then(({ bumpTex, colorTex }) => apply(bumpTex, colorTex))
        .catch((err) => console.error('Texture creation failed:', err));
    } else if (imageUrl) {
      // Fallback: re-render an existing silver-card PNG (e.g. from the user's
      // saved card on profile) as a texture. We lose the SVG-derived bump
      // map, so the surface is flatter, but spin/zoom still work.
      loadImageTexture(imageUrl)
        .then((tex) => apply(null, tex))
        .catch((err) => console.error('Image texture load failed:', err));
    }

    return () => {
      cancelled = true;
    };
  }, [svgString, imageUrl, aspectRatio, invalidate, onReady]);

  return (
    <mesh ref={meshRef} geometry={cardGeo} visible={texturesReady}>
      <meshPhysicalMaterial
        ref={matRef}
        color="#b8b8b8"
        metalness={1}
        roughness={0.32}
        clearcoat={0.2}
        clearcoatRoughness={0.25}
        envMapIntensity={1.0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function CardControls() {
  const controlsRef = useRef<OrbitControlsImpl>(null);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      enableDamping
      minDistance={2}
      maxDistance={10}
      autoRotate
      autoRotateSpeed={1}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      }}
      touches={{
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      }}
      onStart={() => {
        if (controlsRef.current) controlsRef.current.autoRotate = false;
      }}
    />
  );
}

export default function CardScene({
  svgString,
  imageUrl,
  aspectRatio,
  onReady,
  onCanvasReady,
}: {
  svgString?: string;
  imageUrl?: string;
  aspectRatio: number;
  onReady?: () => void;
  /** Called once the WebGL canvas DOM element exists, so callers can grab a PNG snapshot. */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.41], fov: 35 }}
      gl={{
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        alpha: true,
        premultipliedAlpha: false,
        // Required so toDataURL/toBlob captures the rendered frame instead of
        // returning a blank PNG (browsers normally clear the framebuffer
        // immediately after a draw).
        preserveDrawingBuffer: true,
      }}
      frameloop="always"
      style={{ background: '#000' }}
      onCreated={({ gl }) => {
        onCanvasReady?.(gl.domElement);
      }}
    >
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 4, 6]} intensity={1.5} castShadow />
      <directionalLight position={[-3, 2, 4]} intensity={0.4} />
      <directionalLight position={[0, -3, 3]} intensity={0.2} />

      <SilverCard
        svgString={svgString}
        imageUrl={imageUrl}
        aspectRatio={aspectRatio}
        onReady={onReady}
      />

      <ContactShadows position={[0, -1.5, 0]} opacity={0.25} blur={2.5} far={4} />

      <CardControls />

      <Environment preset="studio" />
    </Canvas>
  );
}
