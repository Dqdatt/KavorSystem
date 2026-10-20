#!/usr/bin/env python3
"""Build outlined typographic Kavor concepts from local open fonts."""

from pathlib import Path
import argparse
import math
import re
import xml.etree.ElementTree as ET

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen


def glyph_paths(font_path: str, text: str, cap_height: float, x0: float, baseline: float, tracking: float):
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units = font["head"].unitsPerEm
    scale = cap_height / units
    x = x0
    paths = []
    for char in text:
        glyph_name = cmap[ord(char)]
        glyph = glyph_set[glyph_name]
        pen = SVGPathPen(glyph_set)
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x, baseline))
        glyph.draw(tpen)
        paths.append(pen.getCommands())
        x += glyph.width * scale + tracking
    return paths, x


def inner_svg(path: Path):
    root = ET.parse(path).getroot()
    return "".join(ET.tostring(child, encoding="unicode") for child in list(root))


def clean_path(data: str):
    def repl(match):
        value = round(float(match.group(0)), 2)
        return str(int(value)) if value.is_integer() else f"{value:.2f}".rstrip("0").rstrip(".")
    return re.sub(r"-?\d+\.\d+", repl, data)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", required=True)
    parser.add_argument("--text", default="kavor")
    parser.add_argument("--symbol")
    parser.add_argument("--output", required=True)
    parser.add_argument("--title", required=True)
    parser.add_argument("--tracking", type=float, default=-2)
    parser.add_argument("--wordmark-only", action="store_true")
    args = parser.parse_args()

    if args.wordmark_only:
        x0, cap_height, baseline = 44, 120, 170
        paths, x1 = glyph_paths(args.font, args.text, cap_height, x0, baseline, args.tracking)
        width = math.ceil(max(256, x1 + 44))
        symbol_markup = ""
    else:
        x0, cap_height, baseline = 252, 106, 166
        paths, x1 = glyph_paths(args.font, args.text, cap_height, x0, baseline, args.tracking)
        width = math.ceil(x1 + 44)
        symbol_markup = f'<g id="symbol" transform="translate(40 40) scale(.6875)">{inner_svg(Path(args.symbol))}</g>'

    wordmark = "".join(f'<path d="{clean_path(d)}"/>' for d in paths)
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 256" width="{width}" height="256" '
        f'role="img" aria-labelledby="title"><title id="title">{args.title}</title>'
        f'{symbol_markup}<g id="wordmark" fill="#111827">{wordmark}</g></svg>'
    )
    Path(args.output).write_text(svg, encoding="utf-8")


if __name__ == "__main__":
    main()
