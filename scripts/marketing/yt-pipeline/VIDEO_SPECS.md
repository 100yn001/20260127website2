# Video specs — the not-jealous archetype

Canonical reference: `out/not-jealous-v2/not-jealous-v2-lava.mp4`. Every YouTube video follows
this template; only palette, thumbnail concept, and the sleep-lane extras vary per video.
Renderer: `youtube.mjs` (ffmpeg + Pillow) — one command per video once its mp3 exists.

## The archetype, component by component

| component | spec |
|---|---|
| canvas | 1920×1080 · 24 fps · `yuv420p` |
| structure | **11.2s intro → voice → outro overlay (last 5s) → fade** (+ optional `--tail` for sleep loops) |
| intro card | black screen, slow-staggered Helvetica lines 0–7.4s → beat of black → aura blooms in 8.4–11.1s. Lines (PNGs via Pillow, this ffmpeg has no drawtext): `create any audio` / `or personalize this one` / `at yourname.media` |
| aura | **lava preset**: rotating gradient wash rendered tiny (480×270), heavy `gblur`, upscaled bicubic — motion stays sub-perceptual, "breathing" not "animated" |
| finish | riso-style **static** grain (`noise=alls=13:allf=u` — fixed pattern, no temporal flicker; user-picked), `vignette=PI/6` |
| audio bed | voice delayed to start at 11.2s; **sleep lane:** pink-noise rain (lowpass 1400 / highpass 300, amplitude 0.55) under the voice, `apad` + long tail for loopability. **Per-spec exception:** `ambient: 'street'` (not-jealous-v2, parked-car scene) mixes a muffled night-street rumble (brown noise, lowpass 300, slow swells) from second zero — beds start under the title card so the video is never silent |
| outro | `more at yourname.media` overlay over the aura, final 5s, audio fades 1.2s |
| subs (optional) | `align-subs.py <slug>` → `cues.json` → yellow subtitle cards burned at `H-260` via `--subs` |
| thumbnail | `<slug>-thumb.png` — quote-first text card in the video's palette (concepts below) |
| upload bundle | `upload.md` per video: exact title/description/tags/hashtags, pinned comment, "NOT made for kids", schedule 8–10pm ET |

## Voice rule (locked 2026-07-28)

All YouTube audio uses **roster voices with house delivery** (`[whispers][slowly]` chunk prefix —
airy, close-mic, never declarative):
- male videos → **dusk** (`xWPP…`) — the YouTube "boyfriend", same voice as the app's bodyguard
- girlfriend videos → **veil** (`On3m…`) — same voice as app narrator **julia** (cross-platform continuity)

Old GNLS/mgpc renders are kept as `*-backup.mp3` for reference; never publish them.

## Per-video plan

| video | audio voice | aura | palette | bed | subs | thumbnail concept | video status |
|---|---|---|---|---|---|---|---|
| not-jealous (v2) | dusk ✓ | lava | blue | **street** (baked ✓) | yes (cues exist) | iMessage bubbles: "to be clear i'm not jealous" / "but" / voice-note bubble | **done — archetype canon** |
| not-going-anywhere | dusk (re-voiced) | lava | blue | — | yes | shadowed-eyes anime still + quote | re-render after audio vetted |
| cant-sleep | dusk (re-voiced) | lava | **black** (black-screen-friendly) | **rain** + `--tail 300` | no (sleep = frictionless) | all-black minimal, faint core, "can't sleep?" | re-render after audio vetted |
| waited-up | veil (re-voiced) | lava | pink | — | yes | soft pink lamp-glow, "i waited up." | re-render after audio vetted |
| the-bodyguard | dusk (new) | lava | blue | — | yes | quote card: "six years. / i'm done pretending." | render after audio vetted |

Notes:
- cant-sleep and waited-up previously used the `pulse` aura — superseded: the archetype is lava
  everywhere; the sleep lane keeps its identity via the black palette + rain bed instead.
- Audio re-renders make the existing mp4s stale (they embed the old voice); the table's status
  column is the truth until re-rendered.
- The current not-jealous-v2 mp4 is an audio-only remux of the approved render (street bed mixed
  under the existing track, video stream copied bit-exact, peak-limited). The dry original lives at
  `out/not-jealous-v2/ambient-previews/not-jealous-v2-lava-dry-backup.mp4`; any future re-render
  bakes the bed automatically via the spec's `ambient: 'street'`.
- Video beds are baked and rare (see table). In-app ambience is separate: the app player has a
  universal none/rain/street/waves/forest toggle (`constants/ambient-beds.ts`) and app audio
  files always stay dry.

## Render commands (after audio vetting)

```bash
# per video (mp3 must exist in out/<slug>/)
node scripts/marketing/yt-pipeline/youtube.mjs --slug not-going-anywhere --aura lava --palette blue
node scripts/marketing/yt-pipeline/youtube.mjs --slug cant-sleep --aura lava --palette black --tail 300
node scripts/marketing/yt-pipeline/youtube.mjs --slug waited-up --aura lava --palette pink
node scripts/marketing/yt-pipeline/youtube.mjs --slug the-bodyguard --aura lava --palette blue

# subs (optional, per video): python3 scripts/marketing/yt-pipeline/align-subs.py <slug> then add --subs
# refresh the sheet + airtable after: node scripts/marketing/yt-pipeline/tracker.mjs && node scripts/audio-db/push-airtable.mjs
```
