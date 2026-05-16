"""Generate Google Play Console assets from the refreshed DayFlow icon.

Outputs:
  play-store/icon-512.png         (512x512 RGB PNG, opaque)
  play-store/feature-graphic.png  (1024x500 RGB PNG)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC_ICON = ROOT / "assets" / "icon.png"
OUT_DIR = ROOT / "play-store"
OUT_DIR.mkdir(exist_ok=True)

SEGOE = "C:/Windows/Fonts/segoeui.ttf"
SEGOE_BOLD = "C:/Windows/Fonts/segoeuib.ttf"
SEGOE_SEMI = "C:/Windows/Fonts/segoeuisl.ttf"


def load_font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


# ---------------------------------------------------------------- icon 512
def build_icon_512() -> Path:
    src = Image.open(SRC_ICON).convert("RGB")
    out = src.resize((512, 512), Image.LANCZOS)
    path = OUT_DIR / "icon-512.png"
    out.save(path, "PNG", optimize=True)
    return path


# ---------------------------------------------------------------- helpers
def vgradient(size, top_left, bottom_right):
    """Diagonal-ish gradient from top-left colour to bottom-right colour."""
    w, h = size
    img = Image.new("RGB", size, top_left)
    base = Image.new("RGB", (w, 1), top_left)
    px = base.load()
    r1, g1, b1 = top_left
    r2, g2, b2 = bottom_right
    for x in range(w):
        t = x / (w - 1)
        px[x, 0] = (
            int(r1 + (r2 - r1) * t),
            int(g1 + (g2 - g1) * t),
            int(b1 + (b2 - b1) * t),
        )
    return base.resize((w, h))


def add_orb(img: Image.Image, cx, cy, radius, color, opacity):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        fill=color + (opacity,),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius=18))
    img.alpha_composite(layer)


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0], size[1]], radius, fill=255)
    return mask


def _draw_glyph(pd, key, cx, cy, size, color):
    """Tiny vector glyph drawn into the pill (no emoji font needed)."""
    r = size // 2
    s = size
    if key == "calendar":
        pd.rounded_rectangle(
            [cx - r, cy - r + 1, cx + r, cy + r], radius=2, outline=color, width=2
        )
        pd.line([cx - r, cy - r + 4, cx + r, cy - r + 4], fill=color, width=2)
        pd.rectangle([cx - r + 3, cy - r - 1, cx - r + 4, cy - r + 3], fill=color)
        pd.rectangle([cx + r - 4, cy - r - 1, cx + r - 3, cy - r + 3], fill=color)
    elif key == "target":
        pd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=color, width=2)
        pd.ellipse(
            [cx - r + 4, cy - r + 4, cx + r - 4, cy + r - 4], outline=color, width=2
        )
        pd.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=color)
    elif key == "chart":
        bars = [
            (cx - r, cy + r - 5, 4),
            (cx - r + 6, cy + r - 9, 7),
            (cx - r + 12, cy + r - 13, 11),
        ]
        for bx, by, bh in bars:
            pd.rectangle([bx, by - bh + 5, bx + 4, cy + r], fill=color)
    elif key == "share":
        # three connected dots
        pts = [(cx - r + 1, cy - r + 2), (cx + r - 1, cy), (cx - r + 1, cy + r - 2)]
        for px_, py_ in pts:
            pd.ellipse([px_ - 3, py_ - 3, px_ + 3, py_ + 3], fill=color)
        pd.line([pts[0], pts[1]], fill=color, width=2)
        pd.line([pts[1], pts[2]], fill=color, width=2)


def draw_pill(img, xy, glyph_key, label, font, pad_x=18, pad_y=10, gap=10):
    x, y = xy
    bbox = font.getbbox(label)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    glyph = 20
    w = tw + pad_x * 2 + glyph + gap
    h = th + pad_y * 2 + 6
    pill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    pd = ImageDraw.Draw(pill)
    pd.rounded_rectangle(
        [0, 0, w, h],
        radius=h // 2,
        fill=(255, 255, 255, 38),
        outline=(255, 255, 255, 110),
        width=1,
    )
    _draw_glyph(pd, glyph_key, pad_x + glyph // 2, h // 2, glyph, (255, 255, 255, 245))
    pd.text(
        (pad_x + glyph + gap, pad_y - bbox[1]),
        label,
        font=font,
        fill=(255, 255, 255, 245),
    )
    img.alpha_composite(pill, (x, y))
    return w


# ---------------------------------------------------------------- feature
def build_feature() -> Path:
    W, H = 1024, 500

    bg = vgradient((W, H), (60, 41, 161), (124, 77, 255)).convert("RGBA")

    # Decorative soft orbs (match the existing feature graphic aesthetic).
    add_orb(bg, 130, 470, 170, (255, 255, 255), 22)
    add_orb(bg, 470, 540, 220, (180, 140, 255), 30)
    add_orb(bg, 880, 60, 150, (200, 170, 255), 28)
    add_orb(bg, 1000, 360, 200, (255, 255, 255), 18)
    add_orb(bg, 620, -40, 130, (255, 255, 255), 24)

    # ---- icon card (left) ----
    icon = Image.open(SRC_ICON).convert("RGBA")
    ICON_SIZE = 232
    icon = icon.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    # Round its corners so the white interior reads as a card, not a square.
    mask = rounded_mask((ICON_SIZE, ICON_SIZE), int(ICON_SIZE * 0.22))
    icon.putalpha(mask)

    # Soft drop shadow behind the icon.
    shadow = Image.new("RGBA", (ICON_SIZE + 60, ICON_SIZE + 60), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [30, 38, 30 + ICON_SIZE, 38 + ICON_SIZE],
        radius=int(ICON_SIZE * 0.22),
        fill=(0, 0, 0, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=14))

    icon_x, icon_y = 64, 90
    bg.alpha_composite(shadow, (icon_x - 30, icon_y - 30))
    bg.alpha_composite(icon, (icon_x, icon_y))

    # ---- text block (right of icon) ----
    draw = ImageDraw.Draw(bg)
    title_font = load_font(SEGOE_BOLD, 96)
    tagline_font = load_font(SEGOE, 24)
    pill_font = load_font(SEGOE_SEMI, 20)

    text_x = icon_x + ICON_SIZE + 44
    title_y = icon_y + 6
    draw.text((text_x, title_y), "DayFlow", font=title_font, fill=(255, 255, 255, 255))

    tagline_line1 = "Planifica tu día, alcanza tus metas"
    tagline_line2 = "y colabora con facilidad."
    tagline_y = title_y + 120
    draw.text(
        (text_x, tagline_y),
        tagline_line1,
        font=tagline_font,
        fill=(235, 228, 255, 255),
    )
    draw.text(
        (text_x, tagline_y + 32),
        tagline_line2,
        font=tagline_font,
        fill=(235, 228, 255, 255),
    )

    # ---- pills row ----
    pills = [
        ("calendar", "Calendario"),
        ("target", "Metas"),
        ("chart", "Estadísticas"),
        ("share", "Compartido"),
    ]
    px = text_x
    py = tagline_y + 92
    gap = 14
    for glyph_key, label in pills:
        w = draw_pill(bg, (px, py), glyph_key, label, pill_font)
        px += w + gap

    out = bg.convert("RGB")
    path = OUT_DIR / "feature-graphic.png"
    out.save(path, "PNG", optimize=True)
    return path


def main() -> None:
    icon_path = build_icon_512()
    feat_path = build_feature()
    for p in (icon_path, feat_path):
        size_kb = p.stat().st_size / 1024
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
