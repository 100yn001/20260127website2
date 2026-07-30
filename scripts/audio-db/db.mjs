// Master database of every public-facing audio — the single registry across
// the app library (publicStories) and the YouTube channel (yt-pipeline).
//
// Sources of truth it composes (no duplication):
//   - scripts/public-stories/specs.mjs  → the 24-story app batch
//   - explicit records below            → 5 legacy app stories + yt-pipeline audios
//
// Rules encoded here:
//   - every audio marked onYoutube.expected MUST also be inApp.expected
//     (YouTube ⊆ app), enforced by check.mjs
//   - kind is 'narrator' (persistent character) or 'one-shot'
//   - `videoBed` marks an ambience bed BAKED into the YouTube video (rare).
//     In-app ambience is never per-story data: the player has a universal
//     none/rain/street/waves/forest toggle (constants/ambient-beds.ts),
//     default none, and app audio files are always dry.
//
// check.mjs verifies expectations against live Firestore + yt-pipeline
// artifacts and emits AUDIO_DATABASE.md + audio-database.csv next to it.

import { SPECS as APP_SPECS } from '../public-stories/specs.mjs';

// App-batch audios bound for YouTube (slug → youtube plan).
const APP_YT_BOUND = {
  'the-bodyguard': {
    videoSlug: 'the-bodyguard',
    note: 'YouTube cut is a separate YouTube-safe render (audio done, dusk voice); app version is explicit; judge fixes pending review',
    visualizer: { planned: true, aura: 'lava', done: false },
  },
};

const povOf = (spec) => spec.tags[spec.tags.length - 1];

const appBatch = APP_SPECS.map((s) => ({
  slug: s.slug,
  title: s.title,
  origin: 'app-batch',
  kind: s.narratorKey ? 'narrator' : 'one-shot',
  narrator: s.narratorKey || null,
  pov: povOf(s),
  shelf: s.collection,
  tone: s.isNighttime ? 'nsfw' : 'sfw',
  inApp: { expected: true },
  onYoutube: APP_YT_BOUND[s.slug]
    ? { expected: true, status: 'planned', videoSlug: APP_YT_BOUND[s.slug].videoSlug }
    : { expected: false },
  visualizer: APP_YT_BOUND[s.slug]?.visualizer || { planned: false, done: false },
  notes: APP_YT_BOUND[s.slug]?.note || '',
}));

// Pre-batch stories that live in publicStories (hand-promoted era). docIds
// pinned so title drift can't break matching. Data-quality notes preserved.
const legacy = [
  {
    slug: 'goldilocks',
    title: 'goldilocks',
    origin: 'app-legacy',
    kind: 'narrator',
    narrator: 'lucy',
    pov: 'f4f',
    shelf: 'bedtime',
    tone: 'sfw',
    inApp: { expected: true, docId: '1Sh8QGnwZgnIsH3PDBYi' },
    onYoutube: { expected: false },
    visualizer: { planned: false, done: false },
    notes: 'shelf consolidated from legacy "bedtime stories" (consolidate-shelves.mjs); narrator lucy has no publicNarrators doc',
  },
  {
    slug: 'beauty-and-the-beast',
    title: 'the beauty and the beast',
    origin: 'app-legacy',
    kind: 'one-shot',
    narrator: null,
    pov: 'm4f',
    shelf: 'bedtime',
    tone: 'sfw',
    inApp: { expected: true, docId: 'KxhqlJfGXU1CsGhWxC4l' },
    onYoutube: { expected: false },
    visualizer: { planned: false, done: false },
    notes: 'shelf consolidated from legacy "bedtime stories" (consolidate-shelves.mjs); title stored with curly quotes',
  },
  {
    slug: 'belts-and-ties',
    title: 'belts & ties',
    origin: 'app-legacy',
    kind: 'narrator',
    narrator: 'roman',
    pov: 'm4f',
    shelf: null,
    tone: 'nsfw',
    inApp: { expected: true, docId: 'LndPvIOxQ6rIFYipSZGN' },
    onYoutube: { expected: false },
    visualizer: { planned: false, done: false },
    notes: 'no collection — lands on the "explore" shelf',
  },
  {
    slug: 'home-after-a-long-day',
    title: 'home after a long day',
    origin: 'app-legacy',
    kind: 'narrator',
    narrator: 'julia',
    pov: 'f4m',
    shelf: null,
    tone: 'sfw',
    inApp: { expected: true, docId: 'RteBpEwZyfLrUjZk1Wh6' },
    onYoutube: { expected: false },
    visualizer: { planned: false, done: false },
    notes: 'no collection — lands on the "explore" shelf',
  },
  {
    slug: 'after-dinner',
    title: 'after dinner',
    origin: 'app-legacy',
    kind: 'narrator',
    narrator: 'adam',
    pov: 'm4f',
    shelf: null,
    tone: 'nsfw',
    inApp: { expected: true, docId: 'dOPx3zYtDjUSp7jqNf4E' },
    onYoutube: { expected: false },
    visualizer: { planned: false, done: false },
    notes: 'narrator adam has no publicNarrators doc; no collection',
  },
];

// yt-pipeline audios. Invariant: all are inApp.expected — import-yt.mjs
// uploads their mp3 + winner transcript into publicStories. `audioFile` is
// the canonical audio (not-jealous uses the v2 dusk-voice A/B winner).
const youtube = [
  {
    slug: 'not-jealous',
    title: 'not jealous',
    origin: 'yt-pipeline',
    kind: 'one-shot',
    narrator: null,
    pov: 'm4f',
    shelf: 'after dark',
    tone: 'sfw',
    inApp: { expected: true },
    onYoutube: { expected: true, status: 'rendered', videoSlug: 'not-jealous' },
    visualizer: { planned: true, aura: 'lava', done: true },
    videoBed: 'street',
    audioFile: 'not-jealous-v2/not-jealous-v2.mp3',
    tags: ['spicy', 'boyfriend', 'm4f'],
    notes: 'shared yt boyfriend continuity voice; app audio = v2 (dusk voice), dry — night-street bed baked into the VIDEO only (parked-car scene); dry video backup in ambient-previews/',
  },
  {
    slug: 'not-going-anywhere',
    title: 'not going anywhere',
    origin: 'yt-pipeline',
    kind: 'one-shot',
    narrator: null,
    pov: 'm4f',
    shelf: 'dark romance',
    tone: 'sfw',
    inApp: { expected: true },
    onYoutube: { expected: true, status: 'rendered', videoSlug: 'not-going-anywhere' },
    visualizer: { planned: true, aura: 'lava', done: false },
    audioFile: 'not-going-anywhere/not-going-anywhere.mp3',
    tags: ['dark', 'possessive', 'm4f'],
    notes: 'soft-yandere SFW; re-voiced to dusk 2026-07-28 — video stale, re-render per VIDEO_SPECS',
  },
  {
    slug: 'cant-sleep',
    title: "can't sleep",
    origin: 'yt-pipeline',
    kind: 'one-shot',
    narrator: null,
    pov: 'm4f',
    shelf: 'bedtime',
    tone: 'sfw',
    inApp: { expected: true },
    onYoutube: { expected: true, status: 'rendered', videoSlug: 'cant-sleep' },
    visualizer: { planned: true, aura: 'lava', done: false },
    videoBed: 'rain',
    audioFile: 'cant-sleep/cant-sleep.mp3',
    tags: ['sleep', 'boyfriend', 'm4f'],
    notes: 'black-screen sleep lane; re-voiced to dusk 2026-07-28 — video stale, re-render per VIDEO_SPECS',
  },
  {
    slug: 'waited-up',
    title: 'waited up',
    origin: 'yt-pipeline',
    kind: 'one-shot',
    narrator: null,
    pov: 'f4m',
    shelf: 'bedtime',
    tone: 'sfw',
    inApp: { expected: true },
    onYoutube: { expected: true, status: 'rendered', videoSlug: 'waited-up' },
    visualizer: { planned: true, aura: 'lava', done: false },
    audioFile: 'waited-up/waited-up.mp3',
    tags: ['praise', 'girlfriend', 'f4m'],
    notes: 'gf comfort lane; re-voiced to veil (= julia) 2026-07-28 — video stale, re-render per VIDEO_SPECS',
  },
];

export const RECORDS = [...appBatch, ...legacy, ...youtube];

export function validateDb() {
  const errors = [];
  const seen = new Set();
  for (const r of RECORDS) {
    if (seen.has(r.slug)) errors.push(`duplicate slug ${r.slug}`);
    seen.add(r.slug);
    if (r.onYoutube.expected && !r.inApp.expected) {
      errors.push(`${r.slug}: onYoutube requires inApp (YouTube ⊆ app)`);
    }
    if (r.kind === 'narrator' && !r.narrator) errors.push(`${r.slug}: kind narrator needs narrator`);
  }
  if (errors.length) throw new Error(`audio-db invalid:\n  ${errors.join('\n  ')}`);
  return RECORDS.length;
}
