"""Ghép ảnh prototype HR (trên) và web HR/Admin (dưới) thành docs/ui-comparison/web/<state>.png (thu nhỏ còn 1/2).

Trạng thái không có trong prototype được ghép với khung "THIẾT KẾ BỔ SUNG" để PO duyệt riêng.
Gọi bởi capture-web.mjs: python3 -I tools/ui-compare/pair-web.py <thư mục ảnh gốc> <state> <thư mục ra>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H, HEAD, GAP = 720, 450, 34, 12


def font(size):
    for path in ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            pass
    return ImageFont.load_default()


def panel(img_path, label, note=None):
    out = Image.new("RGB", (W, H + HEAD), "white")
    d = ImageDraw.Draw(out)
    d.text((10, 9), label, fill="#12231c", font=font(15))
    if img_path.exists():
        out.paste(Image.open(img_path).convert("RGB").resize((W, H), Image.LANCZOS), (0, HEAD))
    else:
        d.rectangle([0, HEAD, W - 1, HEAD + H - 1], fill="#f6f8f6", outline="#d7ddd8")
        d.text((W // 2, HEAD + H // 2), note or "", fill="#6e7a74", font=font(20), anchor="mm")
    return out


def main():
    raw, state, out_dir = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    top = panel(raw / f"{state}.prototype.png", "PROTOTYPE · Kavor HR Admin Prototype.html", "THIẾT KẾ BỔ SUNG — prototype không có màn này")
    bottom = panel(raw / f"{state}.web.png", "WEB · apps/admin-web (dữ liệu thật)")
    canvas = Image.new("RGB", (W, (H + HEAD) * 2 + GAP), "#dfe3e0")
    canvas.paste(top, (0, 0))
    canvas.paste(bottom, (0, H + HEAD + GAP))
    out_dir.mkdir(parents=True, exist_ok=True)
    canvas.save(out_dir / f"{state}.png", optimize=True)


if __name__ == "__main__":
    main()
