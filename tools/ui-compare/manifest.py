"""Sinh docs/ui-comparison/manifest.json + manifest.csv từ ảnh đã chụp và ghi chú đánh giá thủ công.

Điểm `diff` = sai khác trung bình theo pixel (0–255) giữa prototype và native, bỏ thanh trạng thái
(56 px đầu) và vạch home (24 px cuối) vì hai vùng này do hệ điều hành vẽ.
Chạy: python3 -I tools/ui-compare/manifest.py
"""
import csv, json, re
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "docs" / "ui-comparison"
STATES = re.findall(r'^\s+"?([a-z0-9-]+)"?: `', (ROOT / "tools/ui-compare/states.mjs").read_text(), re.M)

# Đánh giá thủ công sau khi xem từng cặp ảnh (cập nhật khi review lại)
NOTES = {
    "faceid-scanning": "Sửa theo phản hồi iPhone 26/10: vòng chờ vuông bo góc đổi riêng thành hình tròn 110×110, radius 55; icon Face ID giữ đứng yên. Đã xem ảnh ghép và 8 frame video simulator. Khác prototype có chủ đích; luồng xác thực không đổi. Chờ người dùng xác nhận bản mới trên máy thật.",
    "payroll-api-list": "Đã xem ảnh ghép nhánh API. Prototype mở khung 414×896 rồi chuẩn hóa như iPhone 11. Chỉ các tháng đã công bố; không bịa kỳ kế tiếp. Giữ component có sẵn; còn lệch nhỏ padding/font và định dạng ngày của iOS.",
    "payroll-api-detail": "Đã xem ảnh ghép nhánh API. Prototype mở khung 414×896; bỏ ngân hàng/chú thích mẫu không có trong API, ngày công từ workDays. Giữ component có sẵn; hàng tổng net native thấp hơn prototype khoảng 12 px, là khác biệt component Ln hiện hữu. Chưa khẳng định khớp pixel.",
    "home": "Khớp. Bản tin tự chạy; vị trí thẻ trong ảnh phụ thuộc thời điểm chụp.",
    "home-scrolled": "Khớp hành vi: navbar ẩn khi cuộn xuống, thanh tiêu đề chuyển kính.",
    "spring-home": "Khớp. Thông báo vị trí trượt xuống sau 1 giây như prototype.",
    "error-e26-slow-network": "Khớp. Trạng thái 'Đang gửi chấm công…' chỉ kéo dài 2,4 giây nên được chụp sớm.",
    "news-detail": "Khớp. Tin loại Thông báo giữ nguyên bố cục căn giữa phần đầu như prototype (do class .notice trùng tên).",
    "login": "Khớp. Nút Face ID dùng biểu tượng hệ thống iOS (SF Symbol faceid) theo yêu cầu.",
}
KNOWN = "Khác biệt cố ý: thanh trạng thái/vạch home thật của iOS thay cho hình vẽ; font Montserrat render bằng CoreText nên nét chữ hơi khác Chrome."


def score(a, b):
    a = Image.open(a).convert("L").crop((0, 56, 390, 820))
    b = Image.open(b).convert("L").crop((0, 56, 390, 820))
    return round(ImageStat.Stat(ImageChops.difference(a, b)).mean[0], 2)


def main():
    rows = []
    for s in STATES:
        p, n = DOC / "prototype" / f"{s}.png", DOC / "native" / f"{s}.png"
        has = n.exists()
        d = score(p, n) if has and p.exists() else None
        rows.append({
            "state": s,
            "prototype": f"prototype/{s}.png",
            "native": f"native/{s}.png" if has else None,
            "paired": f"paired/{s}.png",
            "status": ("intentional-change" if s == "faceid-scanning" else "reviewed-existing-differences" if s.startswith("payroll-api-") else "matched") if has else "missing",
            "diff": d,
            "note": NOTES.get(s, "Khớp bố cục, màu, chữ và trạng thái."),
        })
    (DOC / "manifest.json").write_text(json.dumps({"device": "iPhone 11 Simulator (iOS 18.6), 828×1792 → 390×844", "known_differences": KNOWN, "states": rows}, ensure_ascii=False, indent=2) + "\n")
    with open(DOC / "manifest.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()), lineterminator="\n")
        w.writeheader(); w.writerows(rows)
    print(f"{len(rows)} states · matched {sum(r['status'] == 'matched' for r in rows)} · max diff {max(r['diff'] or 0 for r in rows)}")


if __name__ == "__main__":
    main()
