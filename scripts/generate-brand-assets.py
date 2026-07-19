#!/usr/bin/env python3

"""Build the responsive Haoduobao logo files used by the static mirror."""

from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_DIR = Path(__file__).resolve().parent.parent
MASTER_LOGO = PROJECT_DIR / "brand" / "haoduobao-logo.png"
OVERRIDE_DIR = PROJECT_DIR / "brand" / "overrides"

SOURCE_4 = Path("assets/source/31624010.s21i.faiusr.com/4")
SOURCE_5 = Path("assets/source/31624010.s21i.faiusr.com/5")

DESKTOP_STEM = "ABUIABAEGAAgkJygqAYozI2QhAUw7Aw4hww"
CN_MOBILE = "ABUIABAEGAAg2rSJqQYoyP2_MTD4EDjwBQ.png"
EN_MOBILE = "ABUIABAEGAAgo5HDqQYoqoiXogEwpwU4aw.png"
FAVICON = "ABUIABAEGAAgy__5qAYo3OqrHzDwDDiQDg.ico"

DESKTOP_WIDTHS = (200, 400, 600, 800, 1000, 1500, 1644)
MOBILE_WIDTHS = (200, 400, 600, 776)


def output_path(relative_path: Path) -> Path:
    path = OVERRIDE_DIR / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def resize_exact(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.Resampling.LANCZOS)


def desktop_lockup(master: Image.Image, width: int) -> Image.Image:
    height = round(width * master.height / master.width)
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    radius = max(2, round(height * 0.08))
    draw.rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill="white")
    canvas.alpha_composite(resize_exact(master, (width, height)))
    return canvas


def favicon_art(master: Image.Image, size: int = 1024) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    inset = round(size * 0.035)
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=round(size * 0.14),
        fill="white",
    )

    max_width = round(size * 0.88)
    logo_height = round(max_width * master.height / master.width)
    logo = resize_exact(master, (max_width, logo_height))
    canvas.alpha_composite(logo, ((size - max_width) // 2, (size - logo_height) // 2))
    return canvas


def save_webp(image: Image.Image, path: Path) -> None:
    image.save(path, format="WEBP", lossless=True, method=6)


def main() -> None:
    master = Image.open(MASTER_LOGO).convert("RGBA")
    if master.size != (776, 341):
        raise SystemExit(f"Unexpected master logo dimensions: {master.size}; expected 776x341")

    desktop_images: dict[int, Image.Image] = {
        width: desktop_lockup(master, width) for width in DESKTOP_WIDTHS
    }

    desktop_png = output_path(SOURCE_4 / f"{DESKTOP_STEM}.png")
    desktop_images[1644].save(desktop_png, format="PNG", optimize=True)
    save_webp(
        desktop_images[1644],
        output_path(SOURCE_4 / f"{DESKTOP_STEM}.png.webp"),
    )
    for width in DESKTOP_WIDTHS[:-1]:
        save_webp(
            desktop_images[width],
            output_path(SOURCE_4 / f"{DESKTOP_STEM}!{width}x{width}.png.webp"),
        )

    for mobile_filename in (CN_MOBILE, EN_MOBILE):
        master.save(output_path(SOURCE_4 / mobile_filename), format="PNG", optimize=True)
        mobile_stem = mobile_filename[:-4]
        for width in MOBILE_WIDTHS:
            suffix = ".png.webp" if width == master.width else f"!{width}x{width}.png.webp"
            save_webp(
                resize_exact(master, (width, round(width * master.height / master.width))),
                output_path(SOURCE_4 / f"{mobile_stem}{suffix}"),
            )

    favicon = favicon_art(master)
    favicon_preview = PROJECT_DIR / "brand" / "haoduobao-favicon.png"
    resize_exact(favicon, (512, 512)).save(favicon_preview, format="PNG", optimize=True)
    favicon.save(
        output_path(SOURCE_5 / FAVICON),
        format="ICO",
        sizes=((16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)),
    )

    generated = sorted(path for path in OVERRIDE_DIR.rglob("*") if path.is_file())
    print(f"Generated {len(generated)} responsive brand overrides from {MASTER_LOGO.name}.")


if __name__ == "__main__":
    main()
