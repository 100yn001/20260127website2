#!/usr/bin/env python3
"""Forced-alignment-lite: align a story's winner.txt to its rendered mp3 and
emit cues.json for youtube.mjs --subs.

  python3 align-subs.py <slug>

Whisper supplies word timings; the SCRIPT supplies the words (so a mis-heard
word never reaches the screen). Tokens are matched with difflib; script tokens
missing from whisper inherit interpolated timings. Cues are ≤42-char lowercase
fragments split on sentence/ellipsis boundaries.
"""
import difflib, json, re, sys, os

slug = sys.argv[1]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', slug)
mp3, txt = f'{OUT}/{slug}.mp3', f'{OUT}/winner.txt'

norm = lambda w: re.sub(r"[^a-z0-9']", '', w.lower())

# ── whisper words ───────────────────────────────────────────────────────────
# our mp3s are concatenated TTS chunks — PyAV stops at the first chunk header,
# so decode the full stream to wav with ffmpeg first.
import subprocess, tempfile
wav = tempfile.mktemp(suffix='.wav')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3, '-ar', '16000', '-ac', '1', wav], check=True)

from faster_whisper import WhisperModel
model_name = sys.argv[2] if len(sys.argv) > 2 else 'base.en'  # small.en/medium.en for whispery voices
model = WhisperModel(model_name, device='cpu', compute_type='int8')
segments, _ = model.transcribe(wav, word_timestamps=True, language='en',
                               condition_on_previous_text=False,
                               vad_filter=True,
                               vad_parameters=dict(min_silence_duration_ms=700, speech_pad_ms=250))
wwords = [(norm(w.word), w.start, w.end)
          for seg in segments for w in seg.words if norm(w.word)]
print(f'whisper: {len(wwords)} words, {wwords[-1][2]:.1f}s')

# ── script tokens (skip audio cues like [slowly]) ───────────────────────────
script = open(txt).read()
script = re.sub(r'\[[a-z]+\]', ' ', script)
stokens = [t for t in script.split() if norm(t)]

# ── align ───────────────────────────────────────────────────────────────────
sm = difflib.SequenceMatcher(None, [norm(t) for t in stokens], [w for w, _, _ in wwords], autojunk=False)
times = [None] * len(stokens)
for a, b, size in sm.get_matching_blocks():
    for k in range(size):
        times[a + k] = (wwords[b + k][1], wwords[b + k][2])
matched = sum(t is not None for t in times)
print(f'aligned: {matched}/{len(stokens)} script tokens')

# interpolate gaps
last = (0.0, 0.0)
for i, t in enumerate(times):
    if t is None:
        nxt = next((times[j] for j in range(i + 1, len(times)) if times[j]), (last[1], last[1]))
        times[i] = (last[1], (last[1] + nxt[0]) / 2 if nxt[0] > last[1] else last[1])
    last = times[i]

# ── cues ────────────────────────────────────────────────────────────────────
cues, cur, start = [], [], None
for tok, (s, e) in zip(stokens, times):
    if start is None:
        start = s
    cur.append(tok)
    text = ' '.join(cur)
    if len(text) >= 42 or re.search(r'[.!?…]$', tok):
        cues.append({'text': text.lower(), 'start': round(start, 2), 'end': round(e + 0.15, 2)})
        cur, start = [], None
if cur:
    cues.append({'text': ' '.join(cur).lower(), 'start': round(start, 2), 'end': round(times[-1][1] + 0.15, 2)})

# drop zero-length/overlap glitches
clean = []
for c in cues:
    if clean and c['start'] < clean[-1]['end'] - 0.05:
        c['start'] = clean[-1]['end']
    if c['end'] - c['start'] > 0.15:
        clean.append(c)

json.dump(clean, open(f'{OUT}/cues.json', 'w'), indent=1)
print(f'✅ {OUT}/cues.json ({len(clean)} cues)')
