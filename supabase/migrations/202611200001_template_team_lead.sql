-- Mẫu chức danh cho công ty mới thêm "Trưởng nhóm" (cấp quản lý 2). Công ty đã có tự thêm/sửa chức danh ở Cơ cấu tổ chức → Chức danh;
-- không tự chèn vào công ty đang dùng (mỗi công ty tự cấu hình danh mục chức danh riêng).
update public.tenant_policy_templates
set content = jsonb_set(content, '{organization,positions}', '[
  {"code": "BGD", "name": "Ban Giám đốc", "tier": 4},
  {"code": "QTV", "name": "Quản trị viên"},
  {"code": "QL", "name": "Quản lý", "tier": 3},
  {"code": "TN", "name": "Trưởng nhóm", "tier": 2},
  {"code": "NV", "name": "Nhân viên", "tier": 1}
]'::jsonb)
where code = 'vn-default' and content ? 'organization';
