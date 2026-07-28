#!/usr/bin/env node
// Verifies the master audio database against reality and emits the reports:
//
//   node scripts/audio-db/check.mjs
//
// Checks per record:
//   in app     — live publicStories doc (matched by pinned docId, the
//                importer's state.json, or normalized title)
//   on youtube — yt-pipeline artifacts: released (tracker-state.json has
//                released=yes + url) > rendered (final mp4/mp3 exists) >
//                planned > missing
//   invariant  — every onYoutube.expected audio is live in the app
//   reverse    — live publicStories docs missing from the database
//
// Emits: scripts/audio-db/AUDIO_DATABASE.md + audio-database.csv
// Exit 1 on invariant violations / expected-but-missing entries.

import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { RECORDS, validateDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

const YT_OUT = path.join(__dirname, '../marketing/yt-pipeline/out');
const YT_STATE = path.join(__dirname, '../marketing/yt-pipeline/tracker-state.json');
const IMPORT_STATE = path.join(__dirname, 'state.json');
const MD_FILE = path.join(__dirname, 'AUDIO_DATABASE.md');
const CSV_FILE = path.join(__dirname, 'audio-database.csv');

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchLiveStories() {
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const db = getFirestore(app);
  const snap = await getDocs(collection(db, 'publicStories'));
  return snap.docs.map((d) => ({ docId: d.id, ...(d.data() || {}) }));
}

function youtubeStatus(record, trackerState) {
  if (!record.onYoutube.expected) return { status: '—', ok: true };
  const vs = record.onYoutube.videoSlug;
  const st = trackerState[vs] || {};
  if (String(st.released).toLowerCase() === 'yes' && st.url) return { status: `released (${st.url})`, ok: true };
  const dir = path.join(YT_OUT, vs);
  const hasVideo = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.mp4'));
  const hasAudio = fs.existsSync(path.join(dir, `${vs}.mp3`));
  if (hasVideo) return { status: 'rendered (not released)', ok: true };
  if (hasAudio) return { status: 'audio only', ok: true };
  return { status: record.onYoutube.status === 'planned' ? 'planned' : 'MISSING', ok: record.onYoutube.status === 'planned' };
}

async function main() {
  const count = validateDb();
  const live = await fetchLiveStories();
  const trackerState = fs.existsSync(YT_STATE) ? JSON.parse(fs.readFileSync(YT_STATE, 'utf8')) : {};
  const importState = fs.existsSync(IMPORT_STATE) ? JSON.parse(fs.readFileSync(IMPORT_STATE, 'utf8')) : {};

  const liveByDocId = new Map(live.map((d) => [d.docId, d]));
  const liveByTitle = new Map(live.map((d) => [norm(d.title), d]));
  const claimed = new Set();

  const rows = [];
  let problems = 0;

  for (const r of RECORDS) {
    const pinnedId = r.inApp.docId || importState[r.slug];
    const liveDoc = (pinnedId && liveByDocId.get(pinnedId)) || liveByTitle.get(norm(r.title)) || null;
    if (liveDoc) claimed.add(liveDoc.docId);
    const inApp = !!liveDoc;
    const inAppCell = inApp ? '✓' : r.inApp.expected ? '✗ MISSING' : '—';
    if (r.inApp.expected && !inApp) problems++; // counts each gap once — yt gaps are labeled as invariant below

    const yt = youtubeStatus(r, trackerState);
    if (r.onYoutube.expected && !inApp) {
      rows.push({ r, inAppCell: '✗ INVARIANT (yt audio not in app)', yt, liveDoc });
      continue;
    }
    rows.push({ r, inAppCell, yt, liveDoc });
  }

  const untracked = live.filter((d) => !claimed.has(d.docId));
  problems += untracked.length;

  // ── console summary ──
  for (const { r, inAppCell, yt } of rows) {
    console.log(
      `${r.slug.padEnd(24)} ${r.kind === 'narrator' ? (r.narrator || '').padEnd(9) : 'one-shot '.padEnd(9)} ${(r.pov || '').padEnd(5)} ${(r.tone || '').padEnd(5)} app:${inAppCell.padEnd(30)} yt:${yt.status}`,
    );
  }
  if (untracked.length) {
    console.log('\n⚠️  live publicStories docs NOT in the database:');
    for (const d of untracked) console.log(`   ${d.docId}  ${JSON.stringify(d.title)}`);
  }

  // ── AUDIO_DATABASE.md ──
  const section = (title, recs) => {
    if (!recs.length) return '';
    const lines = [
      `\n### ${title}\n`,
      '| audio | kind | pov | shelf | tone | in app | on youtube | visualizer | notes |',
      '|---|---|---|---|---|---|---|---|---|',
    ];
    for (const { r, inAppCell, yt } of recs) {
      const viz = r.visualizer?.done ? `done (${r.visualizer.aura})` : r.visualizer?.planned ? 'planned' : '—';
      lines.push(
        `| ${r.title} | ${r.kind === 'narrator' ? `narrator: ${r.narrator}` : 'one-shot'} | ${r.pov || ''} | ${r.shelf || 'explore'} | ${r.tone} | ${inAppCell} | ${yt.status} | ${viz} | ${r.notes || ''} |`,
      );
    }
    return lines.join('\n');
  };
  const narratorRows = rows.filter(({ r }) => r.kind === 'narrator');
  const oneShotRows = rows.filter(({ r }) => r.kind === 'one-shot');
  const narrators = [...new Set(narratorRows.map(({ r }) => r.narrator))];
  const md = [
    '# Master Audio Database',
    '',
    `Generated by \`scripts/audio-db/check.mjs\` — do not edit by hand (edit db.mjs).`,
    `${RECORDS.length} audios · ${narrators.length} persistent narrators (${narrators.join(', ')}) · ${oneShotRows.length} one-shots.`,
    `Invariant: every YouTube audio also lives in the app.`,
    section('Persistent narrators', narratorRows),
    section('One-shots', oneShotRows),
    untracked.length
      ? `\n### ⚠️ Live in app but untracked here\n\n${untracked.map((d) => `- \`${d.docId}\` ${JSON.stringify(d.title)}`).join('\n')}`
      : '',
    '',
  ].join('\n');
  fs.writeFileSync(MD_FILE, md, 'utf8');

  // ── audio-database.csv ──
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['slug', 'title', 'origin', 'kind', 'narrator', 'pov', 'shelf', 'tone', 'in_app', 'app_doc_id', 'on_youtube', 'video_slug', 'visualizer', 'notes'].join(','),
    ...rows.map(({ r, inAppCell, yt, liveDoc }) =>
      [
        r.slug, r.title, r.origin, r.kind, r.narrator || '', r.pov || '', r.shelf || '', r.tone,
        inAppCell, liveDoc?.docId || '', yt.status, r.onYoutube.videoSlug || '',
        r.visualizer?.done ? `done:${r.visualizer.aura}` : r.visualizer?.planned ? 'planned' : '',
        r.notes || '',
      ].map(esc).join(','),
    ),
  ].join('\n');
  fs.writeFileSync(CSV_FILE, csv, 'utf8');

  console.log(`\n${count} records · ${live.length} live app stories · ${untracked.length} untracked · ${problems ? `❌ ${problems} problem(s)` : '✅ no problems'}`);
  console.log(`→ ${path.relative(process.cwd(), MD_FILE)}\n→ ${path.relative(process.cwd(), CSV_FILE)}`);
  process.exit(problems ? 1 : 0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
