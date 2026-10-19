"""Prepare generated stand-ins as transparent charcoal shadows (requires Pillow).

python tools/shade-fallback-figures.py INPUT_DIRECTORY OUTPUT_DIRECTORY
Input names: man.png, woman.png, boy.png, girl.png, neutral.png, child.png.
This is an offline asset preparation tool; the extension uses the finished PNGs.
"""

import argparse
from pathlib import Path

from PIL import Image


def shade(source: Path, target: Path) -> None:
    image = Image.open(source).convert("RGBA")
    # Remove faint matte residue while retaining smooth, antialiased cutout edges.
    alpha = image.getchannel("A").point(
        [round(max(0, min(1, (value - 8) / 245)) * 255) for value in range(256)]
    )
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"Empty figure: {source}")
    # Bake the shadow treatment once. Preserve a narrow tonal range for self-shading.
    gray = image.convert("L").point(
        [round(8 + (value / 255) ** 1.05 * 62) for value in range(256)]
    )
    cutout = Image.merge("RGBA", (gray, gray, gray, alpha)).crop(bounds)
    factor = min(720 / cutout.width, 1488 / cutout.height)
    cutout = cutout.resize((round(cutout.width * factor), round(cutout.height * factor)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (768, 1536))
    canvas.paste(cutout, ((768 - cutout.width) // 2, 1512 - cutout.height))
    target.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(target, optimize=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    for kind in ("man", "woman", "boy", "girl", "neutral", "child"):
        shade(args.input / f"{kind}.png", args.output / f"{kind}.png")
        print(f"Prepared {kind}.png")
