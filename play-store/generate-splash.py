"""Generate Android splash assets from assets/icon.png.

Produces one PNG per density bucket × orientation × {day, night}, written
directly into the android res drawables. Each PNG contains:
  - flat brand-colored background (white for light, near-black for dark)
  - the source icon centered, scaled to fit a comfortable share of the screen
  - the "DayFlow" wordmark in DM Sans (or Segoe UI fallback) below the icon

Run after editing assets/icon.png or any of the constants below:
    python play-store/generate-splash.py

Re-run also after pulling commits that touched this script.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC_ICON = ROOT / "assets" / "icon.png"
RES_DIR  = ROOT / "android" / "app" / "src" / "main" / "res"

WORDMARK = "DayFlow"

# Logical splash dimensions in dp (we treat dp ≈ px at mdpi and scale up).
LOGICAL_W_DP   = 360
LOGICAL_H_DP   = 640
ICON_DP        = 144     # rendered icon edge length at mdpi
ICON_TO_TEXT   = 32      # vertical gap between icon bottom and wordmark
TEXT_DP        = 40      # wordmark pixel height at mdpi (roughly font cap height)

# Density multipliers (mdpi = 1×). Splash PNGs typically only need these.
DENSITIES = {
    "ldpi":    0.75,
    "mdpi":    1.0,
    "hdpi":    1.5,
    "xhdpi":   2.0,
    "xxhdpi":  3.0,
    "xxxhdpi": 4.0,
}

THEMES = {
    "day": {
        "bg":   (255, 255, 255),
        "text": (26, 26, 26),     # near-black
    },
    "night": {
        "bg":   (18, 22, 38),     # deep navy
        "text": (245, 245, 245),
    },
}

ORIENTATIONS = ("port", "land")

# Font candidates in priority order. First one that exists wins.
FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuib.ttf",  # bold Segoe (matches generate.py)
    "C:/Windows/Fonts/seguisb.ttf",   # semibold
    "C:/Windows/Fonts/segoeui.ttf",   # regular
    "/usr/share/fonts/truetype/dejavu/DejaVu-Sans-Bold.ttf",  # Linux fallback
]


def find_font(px_size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, px_size)
    # Last-resort built-in font — looks bad but at least doesn't crash.
    return ImageFont.load_default()


def render_splash(width_px: int, height_px: int, icon: Image.Image,
                  theme: dict, scale: float) -> Image.Image:
    """Compose a single splash bitmap at the given pixel size."""
    bg = Image.new("RGB", (width_px, height_px), theme["bg"])

    icon_edge = int(round(ICON_DP * scale))
    icon_resized = icon.copy()
    icon_resized.thumbnail((icon_edge, icon_edge), Image.LANCZOS)

    text_px = int(round(TEXT_DP * scale))
    font    = find_font(text_px)
    gap_px  = int(round(ICON_TO_TEXT * scale))

    # Measure text so we can vertically center the icon + gap + text as a group.
    tmp_draw = ImageDraw.Draw(bg)
    text_bbox = tmp_draw.textbbox((0, 0), WORDMARK, font=font)
    text_w = text_bbox[2] - text_bbox[0]
    text_h = text_bbox[3] - text_bbox[1]

    block_h = icon_resized.height + gap_px + text_h
    top_y   = (height_px - block_h) // 2

    icon_x = (width_px - icon_resized.width) // 2
    bg.paste(icon_resized, (icon_x, top_y),
             icon_resized if icon_resized.mode == "RGBA" else None)

    text_x = (width_px - text_w) // 2 - text_bbox[0]
    text_y = top_y + icon_resized.height + gap_px - text_bbox[1]
    tmp_draw.text((text_x, text_y), WORDMARK, font=font, fill=theme["text"])

    return bg


def density_pixel_size(scale: float, orientation: str) -> tuple[int, int]:
    w = int(round(LOGICAL_W_DP * scale))
    h = int(round(LOGICAL_H_DP * scale))
    return (w, h) if orientation == "port" else (h, w)


def main() -> None:
    if not SRC_ICON.exists():
        raise SystemExit(f"Missing source icon: {SRC_ICON}")
    icon = Image.open(SRC_ICON).convert("RGBA")

    written = 0
    for theme_key, theme in THEMES.items():
        for orient in ORIENTATIONS:
            for density, scale in DENSITIES.items():
                w_px, h_px = density_pixel_size(scale, orient)
                splash = render_splash(w_px, h_px, icon, theme, scale)

                folder_parts = ["drawable", orient]
                if theme_key == "night":
                    folder_parts.append("night")
                folder_parts.append(density)
                folder_name = "-".join(folder_parts)

                out_dir = RES_DIR / folder_name
                out_dir.mkdir(parents=True, exist_ok=True)
                out_path = out_dir / "splash.png"
                splash.save(out_path, "PNG", optimize=True)
                written += 1
                print(f"  [ok] {out_path.relative_to(ROOT)} ({w_px}x{h_px})")

    # Also emit a single drawable/splash_branding.png used as the Android 12+
    # windowSplashScreenBrandingImage. 192dp wide × 80dp tall, transparent
    # background, dark text — the system handles the actual placement.
    branding_w = int(round(192 * 4))   # render at xxxhdpi
    branding_h = int(round(80 * 4))
    branding = Image.new("RGBA", (branding_w, branding_h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(branding)
    bd_font = find_font(int(round(48 * 4)))
    bb = bd.textbbox((0, 0), WORDMARK, font=bd_font)
    bd.text(
        ((branding_w - (bb[2] - bb[0])) // 2 - bb[0],
         (branding_h - (bb[3] - bb[1])) // 2 - bb[1]),
        WORDMARK, font=bd_font, fill=(26, 26, 26, 255),
    )
    (RES_DIR / "drawable-xxxhdpi").mkdir(parents=True, exist_ok=True)
    branding.save(RES_DIR / "drawable-xxxhdpi" / "splash_branding.png", "PNG", optimize=True)
    print(f"  [ok] drawable-xxxhdpi/splash_branding.png ({branding_w}x{branding_h})")
    written += 1

    print(f"\nWrote {written} splash assets.")


if __name__ == "__main__":
    main()
