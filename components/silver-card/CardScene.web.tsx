import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment, type OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { bakeSilverCanvases } from './bake-textures';

interface CardTextures {
  bumpTex: THREE.CanvasTexture;
  colorTex: THREE.CanvasTexture;
}

/** Persisted texture URLs for a previously baked silver skin. */
export interface CardTextureUrls {
  colorUrl: string;
  bumpUrl: string;
}

async function createCardTextures(
  svgString: string,
  texW: number,
  texH: number,
): Promise<CardTextures> {
  const { bumpCanvas, colorCanvas } = await bakeSilverCanvases(svgString, texW, texH);
  const bumpTex = new THREE.CanvasTexture(bumpCanvas);
  bumpTex.needsUpdate = true;
  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.needsUpdate = true;
  return { bumpTex, colorTex };
}

function loadImageTexture(url: string, srgb = true): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    // Stored silver-card images live on Firebase Storage which serves CORS
    // headers, so anonymous access works for use as a WebGL texture.
    loader.setCrossOrigin('anonymous');
    loader.load(
      url,
      (tex) => {
        // Bump maps stay linear; only color maps are sRGB.
        if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
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
  textures,
  aspectRatio,
  onReady,
}: {
  svgString?: string;
  imageUrl?: string;
  textures?: CardTextureUrls;
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

  const bakedBumpUrl = textures?.bumpUrl;
  const bakedColorUrl = textures?.colorUrl;

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
    } else if (bakedBumpUrl && bakedColorUrl) {
      // Previously baked silver skin: two small PNGs applied directly — the
      // instant path used by the profile viewer.
      Promise.all([
        loadImageTexture(bakedBumpUrl, false),
        loadImageTexture(bakedColorUrl, true),
      ])
        .then(([bumpTex, colorTex]) => apply(bumpTex, colorTex))
        .catch((err) => console.error('Baked texture load failed:', err));
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
  }, [svgString, imageUrl, bakedBumpUrl, bakedColorUrl, aspectRatio, invalidate, onReady]);

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

/**
 * Procedural studio lighting for the metallic card material. Replaces drei's
 * <Environment preset="studio">, which downloads an HDR from a third-party
 * CDN at runtime — a hard failure (crashing the whole card view) whenever
 * that fetch is blocked or flaky. RoomEnvironment builds a comparable studio
 * env map entirely on-device.
 */
function StudioEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(RoomEnvironment(), 0.04);
    scene.environment = rt.texture;
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
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
  textures,
  aspectRatio,
  onReady,
  onCanvasReady,
}: {
  svgString?: string;
  imageUrl?: string;
  textures?: CardTextureUrls;
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
        textures={textures}
        aspectRatio={aspectRatio}
        onReady={onReady}
      />

      <ContactShadows position={[0, -1.5, 0]} opacity={0.25} blur={2.5} far={4} />

      <CardControls />

      <StudioEnvironment />
    </Canvas>
  );
}
