#!/usr/bin/env node
// Emits tracker.csv — the video catalog sheet (import into Google Sheets).
// Release status + URLs live in tracker-state.json (edited by hand or later
// via `node tracker.mjs --set <slug> released=yes url=...`) and survive re-runs.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SPECS } from './specs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
const STATE = path.join(__dirname, 'tracker-state.json');

// per-video visual + thumbnail decisions (user-picked)
const VISUALS = {
  'not-jealous':        { aura: 'lava',  palette: 'blue',  speed: '0.5', grain: 'dense', thumb: 'iMessage bubbles: "to be clear i\'m not jealous" / "but" / voice-message bubble' },
  'not-going-anywhere': { aura: 'lava',  palette: 'blue',  speed: '1',   grain: 'dense', thumb: 'anime-style shadowed eyes shot + quote' },
  'cant-sleep':         { aura: 'pulse', palette: 'black', speed: '1',   grain: 'dense', thumb: 'all-black minimal, faint breathing core, "can\'t sleep?"' },
  'waited-up':          { aura: 'pulse', palette: 'pink',  speed: '2.5', grain: 'dense', thumb: 'pink/girly: soft pink aura, lamp-glow warmth, "i waited up."' },
};

const args = process.argv.slice(2);
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};

if (args[0] === '--set') {
  const slug = args[1];
  state[slug] = state[slug] || {};
  for (const kv of args.slice(2)) { const [k, v] = kv.split('='); state[slug][k] = v; }
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(`state updated for ${slug}`);
}

function mp3Minutes(slug) {
  const f = path.join(OUT, slug, `${slug}.mp3`);
  if (!fs.existsSync(f)) return '';
  try {
    const s = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
    return (parseFloat(s) / 60).toFixed(1);
  } catch { return ''; }
}

const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const header = ['slug', 'title', 'description', 'lane', 'narrator_gender', 'audience', 'vibe', 'audio_min', 'aura', 'palette', 'speed', 'grain', 'thumbnail_concept', 'released', 'youtube_url', 'notes'];
const rows = SPECS.map((s) => {
  const v = VISUALS[s.slug] || {};
  const st = state[s.slug] || {};
  return [
    s.slug, s.youtube.title, s.youtube.description, s.genre,
    s.genderOther === 'female' ? 'female' : 'male',
    s.genderOther === 'female' ? 'F4M' : 'M4F',
    s.premise.split(/[.!]/)[0] + '.',
    mp3Minutes(s.slug),
    v.aura, v.palette, v.speed, v.grain, v.thumb,
    st.released || 'no', st.url || '', st.notes || '',
  ].map(esc).join(',');
});
const csv = [header.join(','), ...rows].join('\n') + '\n';
const file = path.join(__dirname, 'tracker.csv');
fs.writeFileSync(file, csv);
console.log(`✅ ${path.relative(process.cwd(), file)} (${rows.length} videos)`);

// local Excel workbook from the same data (styled header, frozen row, sized columns)
const xlsx = path.join(__dirname, 'tracker.xlsx');
const py = `
import csv, sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
src, dst = sys.argv[1], sys.argv[2]
wb = Workbook(); ws = wb.active; ws.title = 'videos'
rows = list(csv.reader(open(src)))
widths = [18, 60, 64, 12, 14, 10, 46, 10, 8, 8, 7, 7, 52, 9, 30, 24]
for r in rows: ws.append(r)
hdr_fill = PatternFill('solid', fgColor='10224D')
for c in ws[1]:
    c.font = Font(bold=True, color='FFFFFF'); c.fill = hdr_fill
for i, w in enumerate(widths, 1):
    ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(vertical='top', wrap_text=True)
ws.freeze_panes = 'A2'
wb.save(dst)
`;
execFileSync('python3', ['-c', py, file, xlsx]);
console.log(`✅ ${path.relative(process.cwd(), xlsx)}`);
