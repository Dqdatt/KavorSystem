#!/usr/bin/env python3
"""Tạo file mẫu nhập nhân viên (apps/admin-web/public/mau-nhap-nhan-vien.xlsx) chỉ bằng thư viện chuẩn.
Mẫu chỉ là gợi ý: hộp nhập đọc được file bất kỳ. Tiêu đề lấy theo IMPORT_FIELDS (packages/contracts);
test "file mẫu tải về" trong apps/api/src/admin/import.service.test.ts kiểm mọi cột vẫn được nhận.
Chạy lại sau khi đổi cột: python3 tools/make-import-template.py"""
import pathlib
import zipfile
from xml.sax.saxutils import escape

HEAD = ["Mã nhân viên", "Họ và tên", "Email đăng nhập", "Điện thoại", "Phòng ban", "Chức danh",
        "Quản lý trực tiếp", "Ngày vào làm", "Loại hợp đồng", "Ngày sinh", "Giới tính"]
ROWS = [
    ["NV001", "Nguyễn Văn An", "an.nguyen@congty.vn", "0901234567", "Kinh doanh", "Trưởng nhóm kinh doanh", "", "01/03/2024", "Chính thức", "12/05/1990", "Nam"],
    ["NV002", "Trần Thị Bình", "binh.tran@congty.vn", "0912345678", "Kinh doanh", "Nhân viên kinh doanh", "NV001", "15/06/2025", "Thử việc", "23/09/1998", "Nữ"],
]
WIDTH = [14, 22, 26, 14, 16, 26, 18, 14, 16, 12, 10]
OUT = pathlib.Path(__file__).resolve().parent.parent / "apps/admin-web/public/mau-nhap-nhan-vien.xlsx"


def col(i):
    return chr(65 + i)  # đủ cho ≤ 26 cột


def row(r, cells, style):
    tds = "".join(f'<c r="{col(i)}{r}" t="inlineStr"{style}><is><t>{escape(v)}</t></is></c>' for i, v in enumerate(cells) if v)
    return f'<row r="{r}">{tds}</row>'


sheet = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
         '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
         '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
         '<cols>' + "".join(f'<col min="{i+1}" max="{i+1}" width="{w}" customWidth="1"/>' for i, w in enumerate(WIDTH)) + '</cols>'
         '<sheetData>' + row(1, HEAD, ' s="1"') + "".join(row(i + 2, r, "") for i, r in enumerate(ROWS)) + '</sheetData></worksheet>')

FILES = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nhân viên" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
    '</styleSheet>',
    "xl/worksheets/sheet1.xml": sheet,
}

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for name, text in FILES.items():
        z.writestr(name, text)
print(OUT)
