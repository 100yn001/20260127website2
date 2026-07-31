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
# dynaudnorm lifts whisper-soft passages (sleepy endings fall below whisper's
# hearing otherwise and the tail's cues collapse onto the last heard word);
# the words on screen always come from the script, so aggressive gain is safe.
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', mp3,
                '-af', 'dynaudnorm=f=150:g=15:p=0.9', '-ar', '16000', '-ac', '1', wav], check=True)

from faster_whisper import WhisperModel
model_name = sys.argv[2] if len(sys.argv) > 2 else 'base.en'  # small.en/medium.en for whispery voices
model = WhisperModel(model_name, device='cpu', compute_type='int8')
segments, _ = model.transcribe(wav, word_timestamps=True, language='en',
                               condition_on_previous_text=False,
                               vad_filter=True,
                               vad_parameters=dict(min_silence_duration_ms=700, speech_pad_ms=250,
                                                   threshold=0.2))

# energy-based end of speech: whisper can miss the sleepiest closing lines even
# after gain; trailing script tokens are spread to here instead of collapsing
# onto the last heard word (which left the ending with no subs at all).
sil = subprocess.run(['ffmpeg', '-i', wav, '-af', 'silencedetect=n=-37dB:d=1.2', '-f', 'null', '-'],
                     capture_output=True, text=True).stderr
starts = re.findall(r'silence_start: ([0-9.]+)', sil)
dur = float(subprocess.run(['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                            '-of', 'csv=p=0', wav], capture_output=True, text=True).stdout)
speech_end = float(starts[-1]) if starts and dur - float(starts[-1]) < 60 else dur - 0.5
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

# gate dubious tail anchors: whisper's isolated single-word hits in the
# near-silent closing minutes have unstable timestamps (they vary run to run).
# Trust only up to the end of the LAST run of >=3 consecutively matched tokens
# (a phrase solidly heard); demote everything after it to interpolation.
j, run = None, 0
for i, t in enumerate(times):
    run = run + 1 if t is not None else 0
    if run >= 3:
        j = i
if j is not None and j < len(times) - 1:
    demoted = sum(1 for i in range(j + 1, len(times)) if times[i] is not None)
    for i in range(j + 1, len(times)):
        times[i] = None
    if demoted:
        print(f'tail: demoted {demoted} isolated late anchors after token {j}')

# trailing tokens (after the last anchor): spread evenly to the energy-based
# end of speech so quiet closing lines keep real, non-degenerate timings
anchored = [i for i, t in enumerate(times) if t]
if anchored and anchored[-1] < len(times) - 1:
    L = anchored[-1]
    n = len(times) - 1 - L
    t0 = times[L][1]
    step = max(0.0, (speech_end - t0)) / n if n else 0.0
    for k in range(1, n + 1):
        times[L + k] = (t0 + (k - 1) * step, t0 + k * step)
    print(f'tail: spread {n} trailing tokens over {t0:.1f}s → {speech_end:.1f}s')

# interpolate interior gaps
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

# drop zero-length/overlap glitches; cap dwell so a cue never squats through
# a long pause (subs should vanish during silence, not linger)
clean = []
for c in cues:
    if clean and c['start'] < clean[-1]['end'] - 0.05:
        c['start'] = clean[-1]['end']
    c['end'] = min(c['end'], round(c['start'] + 8.0, 2))
    if c['end'] - c['start'] > 0.15:
        clean.append(c)

json.dump(clean, open(f'{OUT}/cues.json', 'w'), indent=1)
print(f'✅ {OUT}/cues.json ({len(clean)} cues)')
