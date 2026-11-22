-- Đoạn trích bản tin trong thông báo/push gọn hơn trên màn hình khóa (người dùng chốt bố cục "Gọn + icon" 22/11/2026):
-- chữ thuần (bỏ ký hiệu định dạng), không tiền tố tên người đăng, cắt ~90 ký tự ở ranh giới từ.

/* Chữ thuần của nội dung bản tin, cùng quy tắc với parseAnnouncement/announcementPlainText (packages/contracts/src/index.ts):
   bỏ "## ", "- "/"1. ", "> ", dòng "---"; trong dòng bỏ cặp **, ++, *; "\" giữ nguyên ký tự sau.
   Các dòng nối thành một dòng: dòng tiếp của cùng đoạn văn nối bằng dấu cách, sang mục/đoạn mới thêm ". " nếu chưa có dấu câu. */
create or replace function public.announcement_plain_text(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text;
  line text;
  piece text;
  sym text;
  m text[];
  txt text[];
  mk text[];
  k integer;
  n integer;
  out text := '';
  gap boolean := false;
  prev_p boolean := false;
  soft boolean;
begin
  foreach raw in array string_to_array(replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n') loop
    line := regexp_replace(raw, '\s+$', '');
    if line !~ '\S' or line ~ '^\s*(-{3,}|_{3,})$' then gap := true; continue; end if;
    m := regexp_match(line, '^\s*#{1,6}\s+(.*)$');
    if m is null then m := regexp_match(line, '^\s*(?:[-•*+]|\d{1,3}[.)])\s+(.*)$'); end if;
    soft := m is null and prev_p and not gap;
    prev_p := m is null;
    gap := false;
    if m is null then m := regexp_match(line, '^\s*>{1,3}\s?(.*)$'); end if;
    line := coalesce(m[1], line);

    txt := '{}'; mk := '{}'; k := 1; n := length(line);
    while k <= n loop
      if substr(line, k, 1) = '\' and k < n then sym := null; txt := txt || substr(line, k + 1, 1); k := k + 2;
      elsif substr(line, k, 2) in ('**', '++') then sym := substr(line, k, 2); txt := txt || sym; k := k + 2;
      elsif substr(line, k, 1) = '*' then sym := '*'; txt := txt || sym; k := k + 1;
      else sym := null; txt := txt || substr(line, k, 1); k := k + 1;
      end if;
      mk := array_append(mk, sym);
    end loop;
    /* Ký hiệu không có cặp: cái lẻ cuối cùng là chữ thường */
    foreach sym in array array['**', '++', '*'] loop
      if (select count(*) from unnest(mk) x where x = sym) % 2 = 1 then
        mk[(select max(i) from generate_subscripts(mk, 1) i where mk[i] = sym)] := null;
      end if;
    end loop;
    piece := regexp_replace(coalesce((select string_agg(txt[i], '' order by i) from generate_subscripts(txt, 1) i where mk[i] is null), ''), '^\s+|\s+$', '', 'g');
    continue when piece = '';
    out := case when out = '' then piece when soft or out ~ '[.!?:;,…]$' then out || ' ' || piece else out || '. ' || piece end;
  end loop;
  return regexp_replace(out, '\s+', ' ', 'g');
end;
$$;

create or replace function public.announcement_teaser(p_announcement uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when clean = '' then a.author_label || ' đăng ' ||
      case a.category when 'notice' then 'thông báo' when 'policy' then 'chính sách' else 'sự kiện' end || ' mới'
    when length(clean) <= 90 then clean
    /* Lấy 91 ký tự rồi bỏ từ dở ở cuối; cả đoạn là một từ dài thì cắt cứng 90 */
    else coalesce(nullif(rtrim(regexp_replace(left(clean, 91), '\S*$', ''), ' ,;:.-–'), ''), left(clean, 90)) || '…'
  end
  from (
    select author_label, category, public.announcement_plain_text(body) as clean
    from public.announcements
    where id = p_announcement
  ) a;
$$;

revoke all on function public.announcement_plain_text(text) from public, anon, authenticated;
grant execute on function public.announcement_plain_text(text) to service_role;
