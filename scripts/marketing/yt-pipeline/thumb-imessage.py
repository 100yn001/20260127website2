#!/usr/bin/env python3
"""iMessage-style YouTube thumbnail (1280x720): a stack of incoming dark-mode
bubbles, optionally ending in the typing indicator. No phone chrome — just the
messages on black, per the channel's minimal text-first thumb language.

  python3 thumb-imessage.py --out out/not-jealous-v2/thumb.png \
      -m "to be clear" -m "i'm not jealous" -m "but" --typing
"""

import argparse
from PIL import Image, ImageDraw, ImageFont

W, H = 1280, 720
BG = (0, 0, 0)
BUBBLE = (38, 37, 42)        # iOS dark-mode received gray
TEXT = (255, 255, 255)
DOTS = (142, 142, 147)       # typing-indicator dots
FONT_PATH = '/System/Library/Fonts/Helvetica.ttc'

FONT_SIZE = 76
PAD_X, PAD_Y = 40, 26
GAP = 14                     # tight grouping between consecutive bubbles
LEFT = 110
RADIUS = 46


def bubble_size(draw, font, text):
    box = draw.textbbox((0, 0), text, font=font)
    tw, th = box[2] - box[0], box[3] - box[1]
    return tw + 2 * PAD_X, th + 2 * PAD_Y, box


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('-m', '--message', action='append', required=True)
    ap.add_argument('--typing', action='store_true', help='end with the typing indicator')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    img = Image.new('RGB', (W, H), BG)
    draw = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE, index=0)

    # measure the stack
    sizes = [bubble_size(draw, font, m) for m in args.message]
    typing_h = 120
    total = sum(s[1] for s in sizes) + GAP * (len(sizes) - 1)
    if args.typing:
        total += GAP + typing_h + 26  # + room for the tail dots
    y = (H - total) // 2

    for m, (bw, bh, box) in zip(args.message, sizes):
        draw.rounded_rectangle([LEFT, y, LEFT + bw, y + bh], radius=min(RADIUS, bh // 2), fill=BUBBLE)
        draw.text((LEFT + PAD_X - box[0], y + PAD_Y - box[1]), m, font=font, fill=TEXT)
        y += bh + GAP

    if args.typing:
        # typing bubble: three dots + the two-circle thought tail, bottom-left
        tw = 230
        draw.rounded_rectangle([LEFT, y, LEFT + tw, y + typing_h], radius=typing_h // 2, fill=BUBBLE)
        r = 17
        cy = y + typing_h // 2
        for i in range(3):
            cx = LEFT + 62 + i * 53
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=DOTS)
        draw.ellipse([LEFT + 10, y + typing_h - 14, LEFT + 10 + 30, y + typing_h + 16], fill=BUBBLE)
        draw.ellipse([LEFT - 6, y + typing_h + 14, LEFT - 6 + 16, y + typing_h + 30], fill=BUBBLE)

    img.save(args.out, 'PNG')
    print(f'✅ {args.out}')


if __name__ == '__main__':
    main()
