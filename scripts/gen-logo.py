"""Generate images/logo.png — Repo Insights icon."""
from PIL import Image, ImageDraw
import os

SIZE = 256
SCALE = 4          # render at 4× then downsample for anti-aliasing
S = SIZE * SCALE   # 1024

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# ── Background: deep navy rounded square ──────────────────────────────────────
BG_COLOR = "#003F7F"
CORNER_R = int(0.16 * S)
draw.rounded_rectangle([(0, 0), (S - 1, S - 1)], radius=CORNER_R, fill=BG_COLOR)

# ── Bar chart layout ──────────────────────────────────────────────────────────
BAR_COUNT  = 4
LEFT_PAD   = int(0.14 * S)
RIGHT_PAD  = int(0.14 * S)
BOTTOM_PAD = int(0.17 * S)
TOP_PAD    = int(0.16 * S)
BAR_GAP    = int(0.045 * S)

chart_w = S - LEFT_PAD - RIGHT_PAD
chart_h = S - TOP_PAD - BOTTOM_PAD
bar_w   = (chart_w - (BAR_COUNT - 1) * BAR_GAP) // BAR_COUNT

# Ascending bar heights (fraction of chart_h)
heights  = [0.32, 0.50, 0.68, 0.88]
BAR_COLOR = "#FFFFFF"
BAR_ALPHA  = 220

# Semi-transparent white bars with slightly rounded tops
for i, h in enumerate(heights):
    bar_h = int(h * chart_h)
    x0 = LEFT_PAD + i * (bar_w + BAR_GAP)
    y0 = S - BOTTOM_PAD - bar_h
    x1 = x0 + bar_w
    y1 = S - BOTTOM_PAD
    r  = int(0.025 * S)
    draw.rounded_rectangle([(x0, y0), (x1, y1)], radius=r,
                           fill=(255, 255, 255, BAR_ALPHA))

# ── Trend line connecting bar-top centres ─────────────────────────────────────
LINE_COLOR = (71, 176, 255, 255)   # sky blue #47B0FF
LINE_W     = int(0.028 * S)

tops = []
for i, h in enumerate(heights):
    cx = LEFT_PAD + i * (bar_w + BAR_GAP) + bar_w // 2
    cy = S - BOTTOM_PAD - int(h * chart_h)
    tops.append((cx, cy))

draw.line(tops, fill=LINE_COLOR, width=LINE_W)

# Dot at each data point
DOT_R      = int(0.038 * S)
DOT_BORDER = int(0.014 * S)
for pt in tops:
    draw.ellipse(
        [(pt[0] - DOT_R, pt[1] - DOT_R), (pt[0] + DOT_R, pt[1] + DOT_R)],
        fill=(255, 255, 255, 255),
        outline=LINE_COLOR,
        width=DOT_BORDER,
    )

# ── Downsample to 256×256 ─────────────────────────────────────────────────────
out_path = os.path.join(os.path.dirname(__file__), "..", "images", "logo.png")
out_path = os.path.normpath(out_path)
img.resize((SIZE, SIZE), Image.LANCZOS).save(out_path)
print(f"Saved: {out_path}")
