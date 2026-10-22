"""Ghép ảnh prototype (trái) và native (phải) thành docs/ui-comparison/paired/<state>.png.

Trạng thái chưa có ảnh native được ghép với khung placeholder "CHƯA TRIỂN KHAI".
Chạy: python3 -I tools/ui-compare/pair.py [state ...]
"""
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2] / "docs" / "ui-comparison"
W, H, GAP, HEAD = 390, 844, 16, 40


def font(size):
    for path in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def placeholder():
    img = Image.new("RGB", (W, H), "#E5E7E6")
    d = ImageDraw.Draw(img)
    d.rectangle([8, 8, W - 9, H - 9], outline="#B4BCB7", width=3)
    d.text((W // 2, H // 2), "CHƯA TRIỂN KHAI", fill="#65736D", font=font(26), anchor="mm")
    return img


def load(path):
    """Đọc ảnh; nếu chưa ở 390×844 thì lưu bản gốc sang $UI_RAW (nếu có) rồi chuẩn hóa tại chỗ."""
    if not path.exists():
        return None
    img = Image.open(path).convert("RGB")
    if img.size != (W, H):
        raw = os.environ.get("UI_RAW")
        if raw:
            dst = Path(raw) / path.parent.name / path.name
            dst.parent.mkdir(parents=True, exist_ok=True)
            img.save(dst)
        img = img.resize((W, H), Image.LANCZOS)
        img.save(path, optimize=True)
    return img


def pair(state):
    proto = load(ROOT / "prototype" / f"{state}.png")
    native = load(ROOT / "native" / f"{state}.png")
    out = Image.new("RGB", (W * 2 + GAP * 3, H + HEAD + GAP), "#FFFFFF")
    d = ImageDraw.Draw(out)
    d.text((GAP, 10), f"PROTOTYPE · {state}", fill="#13241E", font=font(18))
    d.text((W + GAP * 2, 10), "NATIVE · iPhone 11" if native else "NATIVE · thiếu", fill="#13241E" if native else "#D9474F", font=font(18))
    out.paste(proto or placeholder(), (GAP, HEAD))
    out.paste(native or placeholder(), (W + GAP * 2, HEAD))
    (ROOT / "paired").mkdir(exist_ok=True)
    out.save(ROOT / "paired" / f"{state}.png", optimize=True)
    return native is not None


if __name__ == "__main__":
    states = sys.argv[1:] or sorted(p.stem for p in (ROOT / "prototype").glob("*.png"))
    have = sum(pair(s) for s in states)
    print(f"paired {len(states)} states · native {have} · missing {len(states) - have}")
