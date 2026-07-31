# Future features — parking lot

Ideas we've decided are worth building *later*. Nothing here is scheduled; each
entry should capture enough context that future-us can pick it up cold. When one
graduates, move it out into a real spec/plan.

---

## Spotify-style subtitles with per-line feedback

**Added 2026-07-31.**

Lyrics-style synced transcript in the app player: the current line glows/scrolls
as the narration plays (like Spotify lyrics), instead of the static transcript
sheet. Users can react to *specific lines* (like / dislike), and those reactions
feed regeneration.

Notes for when we build it:

- **Timing tech already exists.** `scripts/marketing/yt-pipeline/align-subs.py`
  does forced-alignment-lite (whisper timings + script words, gain-lifted for
  whisper-soft audio, tail rescue, clean-dialogue cue text). The app version is
  the same cues shape shipped on the story doc (e.g. `cues: [{text, start, end}]`
  on `publicStories` / `stories`), generated at publish/generation time.
- **Player UI:** replace (or augment) the transcript modal with a synced view;
  tap a line to seek there; long-press → like/dislike.
- **Feedback data:** per user+story+line reactions (e.g.
  `users/{uid}/lineFeedback/{storyId}` with `{lineIndex, cueText, vote}` rows, or
  a subcollection). Aggregate per public story for editorial signal.
- **Feed into regeneration:** the app already has a regenerate flow
  (`app/regenerate.tsx`). Disliked lines become explicit "rewrite these beats"
  instructions in the regen prompt; liked lines are pinned verbatim ("keep these
  lines exactly"). For public stories, aggregated dislikes tell us which beats to
  fix in the next batch rev.
- **Why it fits the product:** the whole pipeline is already line/beat-oriented
  (pause-density, murmur beats) — line-level feedback is the natural resolution
  for "make it more like this."
