#!/usr/bin/env node
// YouTube packager — renders the final upload bundle for a hero-test story:
//   16:9 video (animated grainy aura + 6.5s Helvetica intro card + story audio),
//   thumbnail PNG, upload.md metadata.
//
//   node scripts/marketing/yt-pipeline/youtube.mjs --slug not-jealous --aura lava [--palette blue] [--tail 300]
//
// Requires: ffmpeg/ffprobe on PATH, out/<slug>/<slug>.mp3 already rendered.
// Aura presets mirror scripts/marketing/visuals/options.html (1 breathe · 2 lava · 3 horizon · 4 pulse).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { specBySlug } from './specs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT = '/System/Library/Fonts/Helvetica.ttc';
const FPS = 24, W = 1920, H = 1080;
const INTRO = 11.2; // audio start: slow staggered lines (0-7.4s) → black beat → bloom (8.4-11.1s)

const args = process.argv.slice(2);
const flag = (name, dflt = null) => { const i = args.indexOf(`--${name}`); return i === -1 ? dflt : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const slug = flag('slug');
const aura = flag('aura', 'lava');
const palette = flag('palette', null);
const spec = specBySlug(slug);
if (!spec) { console.error(`unknown --slug ${slug}`); process.exit(1); }

const PALETTES = {
  blue: { a: '0x10224d', b: '0x16367a', c: '0x2a5bd7', d: '0x7db0ff', e: '0x0a1637', f: '0x9cc2ff' },
  pink: { a: '0x3a1030', b: '0x6e1240', c: '0xd72a7c', d: '0xff9ec4', e: '0x2a0c22', f: '0xffb9d6' },
  black: { a: '0x0a0c16', b: '0x121a30', c: '0x1c2a4d', d: '0x2e4270', e: '0x06070d', f: '0x40527f' },
};
const SPD = parseFloat(flag('speed', '1'));
const P = PALETTES[palette || (spec.aura ?? 'blue')];

// aura background chains — rendered tiny (blur hides everything), scaled up, grained.
function auraChain(durS) {
  const base = `gradients=s=480x270:rate=${FPS}:d=${durS}:n=5:c0=${P.e}:c1=${P.b}:c2=${P.c}:c3=${P.d}:c4=${P.f}:seed=7`;
  // dense static riso-style grain (user pick): fixed noise pattern, no temporal flicker
  const finish = `scale=${W}:${H}:flags=bicubic,noise=alls=13:allf=u,vignette=PI/6,format=yuv420p`;
  switch (aura) {
    case 'breathe': // drifting blobs ≈ slow gradient rotation + gentle sine zoom
      return `${base}:speed=${0.006 * SPD},gblur=sigma=45,scale=560:315,zoompan=z='1.12+0.08*sin(2*PI*on/(${FPS}*${26 / SPD}))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=560x315:fps=${FPS},${finish}`;
    case 'lava':    // slow conic-ish wash: rotating gradient, heavy blur
      return `${base}:speed=${0.012 * SPD},gblur=sigma=55,${finish}`;
    case 'horizon': // breathing bands: near-static gradient, slow vertical scroll feel
      return `gradients=s=480x540:rate=${FPS}:d=${durS}:n=4:c0=${P.e}:c1=${P.b}:c2=${P.c}:c3=${P.d}:x0=240:y0=0:x1=240:y1=540:speed=${0.002 * SPD},gblur=sigma=40,crop=480:270:0:'135+100*sin(2*PI*t/${38 / SPD})',${finish}`;
    case 'pulse':   // single breathing core (sleep): dark palette, sine-pulsed zoom
      return `gradients=s=480x270:rate=${FPS}:d=${durS}:n=3:c0=${P.e}:c1=${P.b}:c2=${P.c}:x0=240:y0=135:x1=470:y1=265:speed=${0.003 * SPD},gblur=sigma=60,scale=560:315,zoompan=z='1.25+0.15*sin(2*PI*on/(${FPS}*${11 / SPD}))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=560x315:fps=${FPS},${finish}`;
    case 'radial':  // breathing circle: a literal centered disc (core → dark edge) that
      // expands and contracts on a slow sine — soft edge, but unmistakably a circle
      return `gradients=s=480x270:rate=${FPS}:d=${durS}:type=radial:c0=${P.c}:c1=${P.e}:x0=240:y0=135:x1=350:y1=135,gblur=sigma=25,scale=560:315,zoompan=z='1.3+0.3*sin(2*PI*on/(${FPS}*${10 / SPD}))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=560x315:fps=${FPS},${finish}`;
    default: throw new Error(`unknown aura ${aura}`);
  }
}

// Text card PNGs via Pillow (this ffmpeg build has no drawtext/freetype).
function textPng(lines, outPng, { size = 46, lineGap = 32, anchor = 'center', x = 90, yBottom = 140 } = {}) {
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
lines, out, size, gap, anchor, x, yb = json.loads(sys.argv[1])
W, H = ${W}, ${H}
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
font = ImageFont.truetype('${FONT}', size)
heights = [d.textbbox((0, 0), t, font=font)[3] for t in lines]
total = sum(heights) + gap * (len(lines) - 1)
if anchor == 'center':
    y = (H - total) // 2
    for t, h in zip(lines, heights):
        w = d.textlength(t, font=font)
        d.text(((W - w) / 2, y), t, font=font, fill=(255, 255, 255, 242))
        y += h + gap
else:  # bottom-left
    y = H - yb - total
    for t, h in zip(lines, heights):
        d.text((x, y), t, font=font, fill=(255, 255, 255, 242))
        y += h + gap
img.save(out)
`;
  execFileSync('python3', ['-c', py, JSON.stringify([lines, outPng, size, lineGap, anchor, x, yBottom])]);
}

// bulk-render yellow subtitle cards (one 1920x200 PNG per cue)
function renderSubPngs(cues, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const py = `
import json, re, sys
from PIL import Image, ImageDraw, ImageFont
cues, outdir = json.load(open(sys.argv[1])), sys.argv[2]
font = ImageFont.truetype('${FONT}', 58)
for n, c in enumerate(cues):
    img = Image.new('RGBA', (1920, 200), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    t = c['text'].lower().strip()
    t = re.sub(r'\\s*\u2014\\s*', ' \u2014 ', t).strip()  # 'xyz\u2014abc' -> 'xyz \u2014 abc'
    w = d.textlength(t, font=font)
    x, y = (1920 - w) / 2, 60
    d.text((x + 3, y + 3), t, font=font, fill=(0, 0, 20, 110))
    d.text((x, y), t, font=font, fill=(255, 214, 10, 245))
    img.save(f'{outdir}/cue-{n:03d}.png')
print(f'{len(cues)} sub cards')
`;
  const tmp = path.join(outDir, '_cues.json');
  fs.writeFileSync(tmp, JSON.stringify(cues));
  execFileSync('python3', ['-c', py, tmp, outDir]);
}

function run(bin, a) { execFileSync(bin, a, { stdio: ['ignore', 'pipe', 'inherit'] }); }
function probe(file) {
  return parseFloat(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
}

const dir = path.join(__dirname, 'out', spec.slug);
const mp3 = path.join(dir, `${spec.slug}.mp3`);
if (!fs.existsSync(mp3)) { console.error(`missing ${mp3} — run generate.mjs --phase tts first`); process.exit(1); }

const pron = spec.genderOther === 'male' ? 'him' : spec.genderOther === 'female' ? 'her' : 'them';
const voiceDur = probe(mp3);
const tail = parseInt(flag('tail', spec.genre === 'sleep' ? '900' : '8'), 10);
const total = Math.ceil(INTRO + voiceDur + tail);
const isSleep = spec.genre === 'sleep';

console.log(`🎬 ${spec.slug} — aura=${aura} palette=${palette || spec.aura} · voice ${(voiceDur / 60).toFixed(1)}min · total ${(total / 60).toFixed(1)}min`);

// ── video ───────────────────────────────────────────────────────────────────
const video = path.join(dir, `${spec.slug}-${aura}.mp4`);
// ambient beds are the exception, not the norm. Sleep stories get synthesized
// rain-on-glass under the voice and through the tail; a spec can opt into
// `ambient: 'street'` — muffled night-street rumble for parked-car scenes
// (chain matches the approved out/not-jealous-v2/ambient-previews mix).
const rain = `anoisesrc=colour=pink:sample_rate=44100:amplitude=0.55,lowpass=f=1400,highpass=f=300,` +
  `tremolo=f=0.15:d=0.35,volume=0.10`;
const street = `anoisesrc=colour=brown:sample_rate=44100:amplitude=0.55,lowpass=f=300,tremolo=f=0.1:d=0.5`;
const voiceIn = `[1:a]adelay=${Math.round(INTRO * 1000)}|${Math.round(INTRO * 1000)},apad=whole_dur=${total}`;
const audioGraph = isSleep
  ? `${voiceIn}[v];` +
    `${rain},atrim=0:${total},afade=t=in:d=6,afade=t=out:st=${total - 12}:d=12[r];` +
    `[v][r]amix=inputs=2:duration=first:normalize=0[aout]`
  : spec.ambient === 'street'
    ? `${voiceIn},afade=t=out:st=${(INTRO + voiceDur + 0.3).toFixed(2)}:d=1.2[v];` +
      `${street},atrim=0:${total},afade=t=in:d=4,afade=t=out:st=${total - 4}:d=4[r];` +
      `[v][r]amix=inputs=2:duration=first:normalize=0[aout]`
    : `${voiceIn},afade=t=out:st=${(INTRO + voiceDur + 0.3).toFixed(2)}:d=1.2[aout]`;

// Intro sequence: black screen; yellow italic lines appear ONE BY ONE (block
// sits below center) → all fade out → beat of pure black → gradient blooms in
// → audio starts (at INTRO seconds).
const CARD_OUT = 7.4;   // text fully gone
const BLOOM_AT = 8.4;   // gradient starts appearing after a black beat
const BLOOM_D = 2.7;    // slow bloom
const INTRO_LINES = ['create any audio', 'or personalize this one', 'at yourname.media'];
const LINE_IN = (i) => 0.6 + i * 1.4;       // slow staggered fade-ins
const GFONT = path.join(__dirname, 'fonts', 'EBGaramond.ttf');
const linePngs = INTRO_LINES.map((_, i) => path.join(dir, `intro-line-${i}.png`));
const outroPng = path.join(dir, 'outro-line.png');
const layoutJson = path.join(dir, 'intro-layout.json');
// EB Garamond, white; per-line strips with measured, exact y-centering — the
// intro block (first N lines) centers as a group, the outro line centers alone.
{
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
lines, files, outjson = json.loads(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3]
font = ImageFont.truetype('${GFONT}', 46)
asc, desc = font.getmetrics()
lineH, gap, H = asc + desc, 4, 1080
n = len(lines) - 1  # last entry is the outro line
block = n * lineH + (n - 1) * gap
top = (H - block) // 2
ys = []
for i, (t, f) in enumerate(zip(lines, files)):
    img = Image.new('RGBA', (1920, lineH + 8), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.text((960, 0), t, font=font, fill=(255, 255, 255, 245), anchor='ma')
    img.save(f)
    ys.append(top + i * (lineH + gap) if i < n else (H - lineH) // 2)
json.dump(ys, open(outjson, 'w'))
`;
  execFileSync('python3', ['-c', py,
    JSON.stringify([...INTRO_LINES, 'more at yourname.media']),
    JSON.stringify([...linePngs, outroPng]), layoutJson]);
}
const lineYs = JSON.parse(fs.readFileSync(layoutJson, 'utf8'));

// intro line inputs occupy indexes 2..(1+N); subs follow after
const lineInputs = [];
for (const f of linePngs) lineInputs.push('-loop', '1', '-t', String(CARD_OUT + 0.2), '-i', f);
let introChain = `[0:v]fade=t=in:st=${BLOOM_AT}:d=${BLOOM_D},fade=t=out:st=${(total - 6.5).toFixed(2)}:d=1.5[bg];`;
let vLabel = '[bg]';
INTRO_LINES.forEach((_, i) => {
  const idx = 2 + i;
  introChain += `[${idx}:v]format=rgba,fade=t=in:st=${LINE_IN(i)}:d=1.3:alpha=1,fade=t=out:st=${CARD_OUT - 0.9}:d=0.8:alpha=1[l${i}];`;
  const out = `[iv${i}]`;
  introChain += `${vLabel}[l${i}]overlay=0:${lineYs[i]}:enable='lt(t,${CARD_OUT})'${out};`;
  vLabel = out;
});

// --subs: burn aligned yellow subtitle cards (cues.json from align-subs.py)
const subInputs = [];
let subChain = '';
const subBase = 2 + INTRO_LINES.length;
if (flag('subs')) {
  const cuesFile = path.join(dir, 'cues.json');
  if (!fs.existsSync(cuesFile)) { console.error(`--subs: missing ${cuesFile} — run align-subs.py ${spec.slug}`); process.exit(1); }
  const cues = JSON.parse(fs.readFileSync(cuesFile, 'utf8'));
  const subsDir = path.join(dir, 'subs');
  renderSubPngs(cues, subsDir);
  cues.forEach((c, n) => {
    subInputs.push('-i', path.join(subsDir, `cue-${String(n).padStart(3, '0')}.png`));
    const out = `[s${n}]`;
    subChain += `${vLabel}[${subBase + n}:v]overlay=0:H-260:enable='between(t,${(c.start + INTRO).toFixed(2)},${(c.end + INTRO).toFixed(2)})'${out};`;
    vLabel = out;
  });
  console.log(`   subs: ${cues.length} cues burned`);
}

// outro: over the black, one centered line in intro style
const oIdx = subBase + subInputs.length / 2;
const outroChain =
  `[${oIdx}:v]format=rgba,fade=t=in:st=${(total - 4.7).toFixed(2)}:d=0.6:alpha=1,fade=t=out:st=${(total - 1.7).toFixed(2)}:d=0.8:alpha=1[oc];` +
  `${vLabel}[oc]overlay=0:${lineYs[INTRO_LINES.length]}:enable='gte(t,${(total - 5).toFixed(2)})'[vfinal];`;
vLabel = '[vfinal]';

run('ffmpeg', ['-y',
  '-f', 'lavfi', '-i', auraChain(total),
  '-i', mp3,
  ...lineInputs,
  ...subInputs,
  '-loop', '1', '-t', String(total), '-i', outroPng,
  '-filter_complex',
  introChain + subChain + outroChain + audioGraph,
  '-map', vLabel, '-map', '[aout]',
  '-t', String(total),
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart',
  video,
]);
console.log(`   ✅ video → ${path.relative(process.cwd(), video)}`);

// ── thumbnail ───────────────────────────────────────────────────────────────
const thumb = path.join(dir, `${spec.slug}-thumb.png`);
const thumbTextPng = path.join(dir, 'thumb-text.png');
textPng(spec.youtube.thumbnailText.split('\n'), thumbTextPng, { size: 120, lineGap: 22, anchor: 'bl', x: 100, yBottom: 120 });
run('ffmpeg', ['-y', '-f', 'lavfi', '-i', auraChain(4), '-i', thumbTextPng,
  '-ss', '3', '-frames:v', '1',
  '-filter_complex', '[0:v][1:v]overlay=0:0,scale=1280:720[t]', '-map', '[t]', thumb]);
console.log(`   ✅ thumbnail → ${path.relative(process.cwd(), thumb)}`);

// ── metadata bundle ─────────────────────────────────────────────────────────
const y = spec.youtube;
const md = `# upload bundle — ${spec.slug}

**video:** ${path.basename(video)} · **thumbnail:** ${path.basename(thumb)}

## title
${y.title}

## description
${y.description}

${y.hashtags.join(' ')}

## tags (comma-separated field)
${y.tags.join(', ')}

## after publishing
- pin this comment: "${y.pinnedComment}"
- add to playlist, set NOT made for kids, schedule at 8-10pm ET
`;
fs.writeFileSync(path.join(dir, 'upload.md'), md);
console.log(`   ✅ metadata → ${path.relative(process.cwd(), path.join(dir, 'upload.md'))}\n`);
