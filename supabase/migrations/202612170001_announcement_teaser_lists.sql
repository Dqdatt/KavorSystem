-- Push bản tin có danh sách: mỗi mục một dòng, giữ số/chấm như trong app (người dùng chọn 22/11/2026 sau khi thử trên iPhone).
-- Bài không có danh sách vẫn gộp một dòng như 202612160001.

/* Chữ thuần của nội dung bản tin, cùng quy tắc với parseAnnouncement (packages/contracts/src/index.ts): bỏ "## ", "> ", dòng "---";
   trong dòng bỏ cặp **, ++, *; "\" giữ nguyên ký tự sau. Mục danh sách giữ số ("1.") hoặc thành "•", mỗi mục một dòng —
   kể cả dòng gõ tay "1. …" (trình soạn lưu thành "\1. …", app vẫn hiện từng dòng). Các dòng khác: cùng đoạn nối bằng dấu cách,
   sang đoạn mới thêm ". " nếu chưa có dấu câu. */
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
  mark text;
  sym text;
  m text[];
  txt text[];
  mk text[];
  k integer;
  n integer;
  out text := '';
  gap boolean := false;
  prev_p boolean := false;
  prev_item boolean := false;
  block boolean;
  soft boolean;
  item boolean;
begin
  foreach raw in array string_to_array(replace(replace(coalesce(p_body, ''), E'\r\n', E'\n'), E'\r', E'\n'), E'\n') loop
    line := regexp_replace(raw, '\s+$', '');
    if line !~ '\S' or line ~ '^\s*(-{3,}|_{3,})$' then gap := true; continue; end if;
    mark := null;
    m := regexp_match(line, '^\s*#{1,6}\s+(.*)$');
    if m is not null then line := m[1];
    else
      m := regexp_match(line, '^\s*(?:([-•*+])|(\d{1,3}[.)]))\s+(.*)$');
      if m is not null then mark := coalesce(m[2], '•'); line := m[3]; end if;
    end if;
    block := m is not null;
    soft := not block and prev_p and not gap;
    prev_p := not block;
    gap := false;
    if not block then line := coalesce((regexp_match(line, '^\s*>{1,3}\s?(.*)$'))[1], line); end if;

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
    piece := btrim(regexp_replace(coalesce((select string_agg(txt[i], '' order by i) from generate_subscripts(txt, 1) i where mk[i] is null), ''), '\s+', ' ', 'g'));
    continue when piece = '';
    if mark is not null then piece := mark || ' ' || piece; end if;
    item := piece ~ '^(\d{1,3}[.)]|[-•*+]) ';
    out := case when out = '' then piece
      when item or prev_item then out || E'\n' || piece
      when soft or out ~ '[.!?:;,…]$' then out || ' ' || piece
      else out || '. ' || piece end;
    prev_item := item;
  end loop;
  return out;
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
    /* Lấy 91 ký tự, bỏ từ dở ở cuối rồi bỏ số/chấm mục bị cắt trơ trọi; cả đoạn là một từ dài thì cắt cứng 90 */
    else coalesce(nullif(rtrim(regexp_replace(regexp_replace(left(clean, 91), '\S*$', ''), '(^|\n)(\d{1,3}[.)]|•)\s*$', ''), E' ,;:.-–\n'), ''),
      left(clean, 90)) || '…'
  end
  from (
    select author_label, category, public.announcement_plain_text(body) as clean
    from public.announcements
    where id = p_announcement
  ) a;
$$;
