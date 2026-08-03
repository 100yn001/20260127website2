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

# second hearing for the tail: re-decode from just before the last solid
# anchor so dynaudnorm's gain state adapts to the quiet ending (that's why
# short probe windows hear words the full pass misses), transcribe the slice
# alone at a permissive threshold, and anchor tail tokens to those timings.
if j is not None and j < len(stokens) - 1:
    t0 = max(0.0, times[j][1] - 2.0)
    twav = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{t0}', '-i', mp3,
                    '-af', 'dynaudnorm=f=150:g=15:p=0.9', '-ar', '16000', '-ac', '1', twav], check=True)
    tsegs, _ = model.transcribe(twav, word_timestamps=True, language='en',
                                condition_on_previous_text=False,
                                vad_filter=True,
                                vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=200,
                                                    threshold=0.15))
    twords = [(norm(w.word), w.start + t0, w.end + t0) for seg in tsegs for w in seg.words if norm(w.word)]
    tail_idx = list(range(j + 1, len(stokens)))
    sm2 = difflib.SequenceMatcher(None, [norm(stokens[i]) for i in tail_idx],
                                  [w for w, _, _ in twords], autojunk=False)
    got = 0
    for a, b, size in sm2.get_matching_blocks():
        for k in range(size):
            times[tail_idx[a + k]] = (twords[b + k][1], twords[b + k][2])
            got += 1
    print(f'tail rescue: heard {len(twords)} words from {t0:.1f}s, anchored {got}/{len(tail_idx)} tail tokens')

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

# interior rescue: every long anchor desert gets its own slice transcription —
# fresh dynaudnorm state makes whisper-soft stretches audible (the same
# mechanism as the tail rescue) — and a local re-match of just that gap.
def rescue_gap(lo, hi, tA, tB):
    gwav = tempfile.mktemp(suffix='.wav')
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{max(0.0, tA - 1.0)}', '-to', f'{tB + 1.0}',
                    '-i', mp3, '-af', 'dynaudnorm=f=150:g=15:p=0.9', '-ar', '16000', '-ac', '1', gwav], check=True)
    gsegs, _ = model.transcribe(gwav, word_timestamps=True, language='en',
                                condition_on_previous_text=False, vad_filter=True,
                                vad_parameters=dict(min_silence_duration_ms=400, speech_pad_ms=200,
                                                    threshold=0.15))
    off = max(0.0, tA - 1.0)
    gwords = [(norm(w.word), w.start + off, w.end + off) for seg in gsegs for w in seg.words if norm(w.word)]
    gm = difflib.SequenceMatcher(None, [norm(stokens[i]) for i in range(lo, hi)],
                                 [w for w, _, _ in gwords], autojunk=False)
    got = 0
    for a, b, size in gm.get_matching_blocks():
        for k in range(size):
            times[lo + a + k] = (gwords[b + k][1], gwords[b + k][2])
            got += 1
    return got

# anchors must tell one consistent story: time strictly advancing, never so
# tight that a token run is crammed into an impossible span — the signature of
# a repeated-phrase mis-match (difflib pinning "that's not"/"when i'm" to the
# wrong occurrence). On conflict, drop whichever anchor strays further from
# the line through its outer neighbors; the freed desert gets rescued below.
def sanitize():
    dropped = 0
    while True:
        idx = [i for i, t in enumerate(times) if t]
        if len(idx) < 3:
            break
        g = max(0.5, min(5.0, (idx[-1] - idx[0]) / max(1.0, times[idx[-1]][0] - times[idx[0]][1])))
        bad = None
        for x in range(1, len(idx)):
            a, b = idx[x - 1], idx[x]
            dt = times[b][0] - times[a][1]
            if dt < -0.05 or ((b - a) >= 8 and dt < (b - a) / g * 0.35):
                bad = (x, a, b)
                break
        if not bad:
            break
        x, a, b = bad
        p = idx[x - 2] if x >= 2 else None
        n = idx[x + 1] if x + 1 < len(idx) else None
        def dev(i, lo, hi):
            if lo is None or hi is None or times[hi][0] <= times[lo][1]:
                return float('inf')
            exp = times[lo][1] + (i - lo) / (hi - lo) * (times[hi][0] - times[lo][1])
            return abs(times[i][0] - exp)
        times[a if dev(a, p, n) > dev(b, p, n) else b] = None
        dropped += 1
    if dropped:
        print(f'sanitize: dropped {dropped} inconsistent anchors')

for rnd in range(2):
    sanitize()
    anchors = [i for i, t in enumerate(times) if t]
    rescued = 0
    for a, b in zip(anchors, anchors[1:]):
        if b - a > 4 and times[b][0] - times[a][1] > 15:
            got = rescue_gap(a + 1, b, times[a][1], times[b][0])
            print(f'gap rescue r{rnd + 1} {times[a][1]:.0f}s→{times[b][0]:.0f}s: anchored {got}/{b - a - 1}')
            rescued += got
    if not rescued:
        break
sanitize()

# interpolate remaining gaps EVENLY between surviving anchors (the old
# cascading-midpoint fill bunched tokens toward the earlier anchor, which made
# subs run ahead of the voice across long quiet stretches)
i = 0
while i < len(times):
    if times[i] is None:
        j0 = i
        while i < len(times) and times[i] is None:
            i += 1
        tA = times[j0 - 1][1] if j0 else 0.0
        tB = times[i][0] if i < len(times) else max(tA, speech_end)
        n = i - j0
        step = max(0.0, tB - tA) / n
        for k in range(n):
            times[j0 + k] = (round(tA + k * step, 3), round(tA + (k + 1) * step, 3))
    else:
        i += 1

# ── cues ────────────────────────────────────────────────────────────────────
# On-screen text is CLEAN dialogue: pause marks (…) and vocalization beats
# (hmmmmm / ahhhhh / shh) drive the audio, not the subtitles. 'mm-mm' stays —
# it means no. Cue timing still comes from ALL tokens; text from kept ones.
VOCAL = re.compile(r'^(m+|h+m+|a+h+|s+h+)$')
def cue_from(parts):
    kept = [(t, s, e) for t, s, e in parts
            if t.lower().strip('.,!?…—') == 'mm-mm' or (norm(t) and not VOCAL.match(norm(t)))]
    if not kept:
        return None
    text = ' '.join(t for t, _, _ in kept).replace('…', ' ')
    text = re.sub(r'\s+([,.!?])', r'\1', re.sub(r'\s+', ' ', text)).strip()
    if not re.search(r'[a-z0-9]', text.lower()):
        return None
    return {'text': text.lower(), 'start': round(kept[0][1], 2), 'end': round(kept[-1][2] + 0.15, 2)}

cues, cur = [], []
for tok, (s, e) in zip(stokens, times):
    cur.append((tok, s, e))
    text = ' '.join(t for t, _, _ in cur)
    if len(text) >= 42 or re.search(r'[.!?…]$', tok):
        c = cue_from(cur)
        if c:
            cues.append(c)
        cur = []
if cur:
    c = cue_from(cur)
    if c:
        cues.append(c)

# drop zero-length/overlap glitches; cap dwell so a cue never squats through
# a long pause (subs should vanish during silence, not linger)
clean = []
for c in cues:
    if clean and c['start'] < clean[-1]['end'] - 0.05:
        c['start'] = clean[-1]['end']
    c['end'] = min(c['end'], round(c['start'] + 8.0, 2))
    if c['end'] - c['start'] > 0.15:
        clean.append(c)

# readability: a blink-length cue (<0.7s) extends into any gap before the next
# cue; the final cue holds toward the end of audio so closing words don't flash.
for i, c in enumerate(clean):
    nxt = clean[i + 1]['start'] if i + 1 < len(clean) else dur
    if c['end'] - c['start'] < 0.7:
        c['end'] = round(max(c['end'], min(c['start'] + 1.2, nxt)), 2)
if clean:
    clean[-1]['end'] = round(min(dur - 0.2, max(clean[-1]['end'], clean[-1]['start'] + 2.0)), 2)

json.dump(clean, open(f'{OUT}/cues.json', 'w'), indent=1)
print(f'✅ {OUT}/cues.json ({len(clean)} cues)')
