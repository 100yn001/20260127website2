#!/usr/bin/env node
// Pushes the master audio database to Airtable (upsert keyed by slug).
//
//   node scripts/audio-db/push-airtable.mjs [--dry-run]
//
// Env (root .env):
//   AIRTABLE_TOKEN    personal access token with data.records:read+write and
//                     schema.bases:read+write on the base
//   AIRTABLE_BASE_ID  the base id (appXXXXXXXXXXXXXX — from the base URL)
//   AIRTABLE_TABLE    optional table name (default "audios"); created with the
//                     right fields if it doesn't exist
//
// Rows mirror check.mjs's verified view: live in-app status (from Firestore),
// YouTube status (from yt-pipeline artifacts + tracker-state.json), and the
// registry fields. Re-running updates in place — Airtable stays the shared,
// always-current sheet.

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

const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE = process.env.AIRTABLE_TABLE || 'audios';
const YT_OUT = path.join(__dirname, '../marketing/yt-pipeline/out');
const YT_STATE = path.join(__dirname, '../marketing/yt-pipeline/tracker-state.json');
const IMPORT_STATE = path.join(__dirname, 'state.json');
const BATCH_MANIFEST = path.join(__dirname, '../public-stories/out/manifest.json');
const dryRun = process.argv.includes('--dry-run');

const FIELDS = [
  { name: 'slug', type: 'singleLineText' },
  { name: 'title', type: 'singleLineText' },
  { name: 'origin', type: 'singleLineText' },
  { name: 'kind', type: 'singleLineText' },
  { name: 'narrator', type: 'singleLineText' },
  { name: 'pov', type: 'singleLineText' },
  { name: 'shelf', type: 'singleLineText' },
  { name: 'tone', type: 'singleLineText' },
  { name: 'in_app', type: 'singleLineText' },
  { name: 'app_doc_id', type: 'singleLineText' },
  { name: 'on_youtube', type: 'singleLineText' },
  { name: 'youtube_url', type: 'url' },
  { name: 'video_slug', type: 'singleLineText' },
  { name: 'visualizer', type: 'singleLineText' },
  // ambience bed baked into the YouTube video, if any. In-app ambience is the
  // player's universal toggle (default none) — never per-audio, so no app column.
  { name: 'video_bed', type: 'singleLineText' },
  // generation truth: audio_status from the batch manifest / yt artifacts,
  // video_status from rendered mp4s (+ stale flags after re-voicing)
  { name: 'audio_status', type: 'singleLineText' },
  { name: 'video_status', type: 'singleLineText' },
  { name: 'notes', type: 'multilineText' },
];

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function airtable(pathname, init = {}) {
  const res = await fetch(`https://api.airtable.com/v0/${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Airtable ${res.status} on ${pathname}: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

async function ensureTable() {
  const meta = await airtable(`meta/bases/${BASE_ID}/tables`);
  const existing = meta.tables.find((t) => t.name.toLowerCase() === TABLE.toLowerCase());
  if (!existing) {
    console.log(`table "${TABLE}" not found — creating it`);
    await airtable(`meta/bases/${BASE_ID}/tables`, {
      method: 'POST',
      body: JSON.stringify({ name: TABLE, fields: FIELDS }),
    });
    return TABLE;
  }
  // self-heal: create any registry fields the existing table is missing
  const have = new Set(existing.fields.map((f) => f.name.toLowerCase()));
  for (const f of FIELDS) {
    if (have.has(f.name.toLowerCase())) continue;
    console.log(`adding missing field "${f.name}"`);
    await airtable(`meta/bases/${BASE_ID}/tables/${existing.id}/fields`, {
      method: 'POST',
      body: JSON.stringify(f),
    });
  }
  return existing.name;
}

async function main() {
  validateDb();
  if (!dryRun && (!TOKEN || !BASE_ID)) {
    console.error('missing AIRTABLE_TOKEN and/or AIRTABLE_BASE_ID in .env');
    console.error('→ token: https://airtable.com/create/tokens (scopes: data.records:read/write, schema.bases:read/write, on your base)');
    console.error('→ base id: the appXXXXXXXXXXXXXX segment of the base URL');
    process.exit(1);
  }

  // Live views (same logic as check.mjs)
  const app = initializeApp({
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  });
  const fdb = getFirestore(app);
  const snap = await getDocs(collection(fdb, 'publicStories'));
  const live = snap.docs.map((d) => ({ docId: d.id, ...(d.data() || {}) }));
  const liveByDocId = new Map(live.map((d) => [d.docId, d]));
  const liveByTitle = new Map(live.map((d) => [norm(d.title), d]));
  const importState = fs.existsSync(IMPORT_STATE) ? JSON.parse(fs.readFileSync(IMPORT_STATE, 'utf8')) : {};
  const trackerState = fs.existsSync(YT_STATE) ? JSON.parse(fs.readFileSync(YT_STATE, 'utf8')) : {};
  const batchManifest = fs.existsSync(BATCH_MANIFEST)
    ? JSON.parse(fs.readFileSync(BATCH_MANIFEST, 'utf8')).stories || {}
    : {};

  // Pipeline-stage language for the app batch: the manifest status is relative
  // to the CURRENT transcript+voice (a live story rolls back to text/tts when
  // its transcript is regenerated or its narrator is re-voiced).
  const audioStatusFor = (r) => {
    if (r.origin === 'yt-pipeline') {
      return fs.existsSync(path.join(YT_OUT, r.audioFile || '')) ? '✓ rendered — awaiting vet' : '✗ not rendered';
    }
    if (r.origin === 'app-legacy') return '✓ published (legacy)';
    const m = batchManifest[r.slug] || {};
    const live = !!m.docId;
    if (m.status === 'published') return '✓ published — rerender queued';
    if (m.status === 'tts') return live ? '⏳ re-TTS done — republish queued' : '⏳ audio rendered — publish queued';
    if (m.status === 'text') return live ? '⏳ new transcript — TTS queued' : '⏳ text ready — publish queued';
    return '✗ not generated';
  };
  const videoStatusFor = (r) => {
    if (!r.onYoutube.expected) return '—';
    const dir = path.join(YT_OUT, r.onYoutube.videoSlug || '');
    const hasVideo = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.mp4'));
    if (!hasVideo) return 'planned';
    return r.videoStale ? '⚠️ rendered — stale (re-render queued)' : '✓ rendered';
  };

  const rows = RECORDS.map((r) => {
    const pinnedId = r.inApp.docId || importState[r.slug];
    const liveDoc = (pinnedId && liveByDocId.get(pinnedId)) || liveByTitle.get(norm(r.title)) || null;
    let ytStatus = '—';
    let ytUrl = '';
    if (r.onYoutube.expected) {
      const st = trackerState[r.onYoutube.videoSlug] || {};
      const dir = path.join(YT_OUT, r.onYoutube.videoSlug || '');
      if (String(st.released).toLowerCase() === 'yes' && st.url) { ytStatus = 'released'; ytUrl = st.url; }
      else if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.mp4'))) ytStatus = 'rendered';
      else ytStatus = 'planned';
    }
    return {
      fields: {
        slug: r.slug,
        title: r.title,
        origin: r.origin,
        kind: r.kind,
        narrator: r.narrator || '',
        pov: r.pov || '',
        shelf: r.shelf || 'explore',
        tone: r.tone,
        in_app: liveDoc ? '✓' : r.inApp.expected ? '✗ missing' : '—',
        app_doc_id: liveDoc?.docId || '',
        on_youtube: ytStatus,
        ...(ytUrl ? { youtube_url: ytUrl } : {}),
        video_slug: r.onYoutube.videoSlug || '',
        visualizer: r.visualizer?.done ? `done: ${r.visualizer.aura}` : r.visualizer?.planned ? 'planned' : '—',
        video_bed: r.videoBed || '',
        audio_status: audioStatusFor(r),
        video_status: videoStatusFor(r),
        notes: r.notes || '',
      },
    };
  });

  if (dryRun) {
    console.log(JSON.stringify(rows.slice(0, 3), null, 2));
    console.log(`dry run — ${rows.length} rows prepared for base ${BASE_ID}, table "${TABLE}".`);
    return;
  }

  const tableName = await ensureTable();
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    await airtable(`${BASE_ID}/${encodeURIComponent(tableName)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: ['slug'] },
        records: batch,
      }),
    });
    console.log(`upserted ${Math.min(i + 10, rows.length)}/${rows.length}`);
  }
  console.log(`✅ ${rows.length} audios upserted to Airtable table "${tableName}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
