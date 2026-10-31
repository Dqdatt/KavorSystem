import { Pressable, StyleSheet, View } from "react-native";
import { C, F, GL } from "../theme";
import { Gi, Ic } from "../icons";
import { announcementExcerpt, announcementListMarkers, announcementReadMinutes, parseAnnouncement, type AnnouncementBlock, type AnnouncementInline, type MyAnnouncement } from "@kavor/contracts";
import { Balanced, Card, Chip, Chips, Empty, Row, Spinner, T } from "../ui";
import { TabHead, TopBar, type ScreenSpec } from "../screen";
import { CAT, pad, recentNews, relDay, type News, type NewsCat } from "../data";
import { REMOTE } from "../api/http";
import { ACT, S } from "../store";
import { ImpTag } from "./home";

/* Một bài như prototype hiển thị; bản dùng API chuyển từ MyAnnouncement (ngày theo giờ máy, nội dung có định dạng tách bằng parseAnnouncement) */
export type NewsView = Omit<News, "id" | "body"> & { key: string; year: number; rel: string; fileName?: string; body: AnnouncementBlock[]; excerpt: string };
const size = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const dayDiff = (iso: string) => { const d = new Date(iso), n = new Date(); return Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000); };
export function fromApi(a: MyAnnouncement): NewsView {
  const d = new Date(a.publishAt), date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, diff = dayDiff(a.publishAt);
  return { key: a.id, cat: a.category as NewsCat, pin: a.pinned, important: a.important, title: a.title, date, year: d.getFullYear(),
    rel: diff === 0 ? "Hôm nay" : diff === 1 ? "Hôm qua" : date, by: a.authorLabel, read: `${announcementReadMinutes(a.body)} phút`,
    file: a.attachment ? `${a.attachment.name} · ${size(a.attachment.size)}` : undefined, fileName: a.attachment?.name, body: parseAnnouncement(a.body), excerpt: announcementExcerpt(a.body) };
}
/* Dữ liệu mẫu (prototype) lưu đoạn/danh sách dạng mảng: đổi sang chữ có ký hiệu rồi tách như bài thật */
const mockText = (b: News["body"]) => b.map((x) => (Array.isArray(x) ? x.map((l) => `- ${l}`).join("\n") : x)).join("\n\n");
const fromMock = (n: News): NewsView => ({ ...n, key: String(n.id), year: 2026, rel: relDay(n.date), fileName: n.file?.split(" · ")[0],
  body: parseAnnouncement(mockText(n.body)), excerpt: announcementExcerpt(mockText(n.body)) });
/* Bài quá "Hiển thị đến" tự ẩn ngay cả khi danh sách tải từ trước (máy chủ cũng không trả bài hết hạn) */
const live = () => (S.annData?.items ?? []).filter((a) => !a.visibleUntil || Date.parse(a.visibleUntil) > Date.now());
export const newsViews = (): NewsView[] => (REMOTE ? live().map(fromApi) : S.news.map(fromMock));
/* Thẻ "Bản tin mới" trên Trang chủ: bài trong 2 ngày gần nhất */
export const recentNewsViews = (): NewsView[] => (REMOTE ? live().filter((a) => dayDiff(a.publishAt) <= 2).slice(0, 6).map(fromApi) : recentNews(S.news).map(fromMock));

function NewsRow({ n, first }: { n: NewsView; first: boolean }) {
  return (
    <Pressable onPress={() => ACT.openNews(n.key)} style={({ pressed }) => [styles.nw, pressed && { backgroundColor: C.soft }]}>
      {!first ? <View style={styles.nwLine} /> : null}
      <View style={styles.ico}><Gi n={CAT[n.cat][1]} s={22} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {n.important ? <ImpTag shrink={!!n.pin} /> : null}
          {n.pin ? <Ic n="pinned" s={12} w={2} color={C.ink3} /> : null}
          <T style={[styles.meta, { flexShrink: 1 }]}>{n.pin ? " Đã ghim · " : ""}{CAT[n.cat][0]} · {n.date}</T>
        </View>
        <T style={{ fontSize: 15, fontFamily: F.semibold, lineHeight: 20.3 }}>{n.title}</T>
        {n.pin ? <T numberOfLines={2} style={{ color: C.ink2, fontSize: 13 }}>{n.excerpt}</T> : null}
      </View>
    </Pressable>
  );
}

const Loading = ({ k }: { k: string }) => <Card key={k}><Row style={{ justifyContent: "center", paddingVertical: 28 }}><Spinner color={C.emerald} /></Row></Card>;

export function newsSpec(): ScreenSpec {
  const c = S.newsCat, list = newsViews().filter((n) => c === "all" || n.cat === c);
  const waiting = REMOTE && !S.annData;
  return {
    nav: true,
    head: <TabHead title="Bản tin" />,
    body: [
      <Chips key="chips">{([["all", "Tất cả"], ["notice", "Thông báo"], ["policy", "Chính sách"], ["event", "Sự kiện"]] as Array<[string, string]>).map((x) => <Chip key={x[0]} on={c === x[0]} label={x[1]} onPress={() => ACT.newsCat(x[0])} />)}</Chips>,
      waiting && S.annError ? <Card key="err"><Empty icon={<Gi n="news" s={44} />} title="Chưa tải được bản tin" text={S.annError} /></Card>
        : waiting ? <Loading key="l" k="l" />
        : list.length ? <Card key="list">{list.map((n, i) => <NewsRow key={n.key} n={n} first={i === 0} />)}</Card> : <Empty key="e" icon={<Gi n="news" s={44} />} title="Chưa có bài" />,
    ],
  };
}

const HERO_BG: Record<string, string> = {
  notice: "linear-gradient(145deg, #DDF8EC 0%, #F8FCFA 68%, #FFF8E8 100%)",
  policy: "linear-gradient(145deg, #E4F8EE 0%, #F9FCFA 70%, #EDF5FF 100%)",
  event: "linear-gradient(145deg, #FFF3D9 0%, #FFFDF8 68%, #E8F8F1 100%)",
  important: "linear-gradient(145deg, #FFF0EA 0%, #FFF9F5 52%, #E6F8F0 100%)",
};

export function newsDetailSpec(): ScreenSpec {
  /* Bản dùng API: chỉ hiện bài máy chủ vừa trả (đã ghi đọc, chưa bị gỡ); đang tải/lỗi thì không hiện bài khác */
  if (REMOTE && S.annDetail?.id !== S.param) {
    return { head: <TopBar title="Bản tin" right={null} />, body: [S.annDetailError
      ? <Card key="err"><Empty icon={<Gi n="news" s={44} />} title="Không mở được bài viết" text={S.annDetailError} /></Card> : <Loading key="l" k="l" />] };
  }
  const n = REMOTE ? fromApi(S.annDetail!) : (() => { const views = newsViews(); return views.find((x) => x.key === (S.param ?? "")) || views[0]!; })();
  const by = n.by.split(" "), ini = ((by[0] ?? "")[0]! + (by[by.length - 1] ?? "")[0]!).toUpperCase();
  const file = n.file ? n.file.split(" · ") : null;
  /* Khung tiêu đề gọn (phản hồi người dùng 30/10): bỏ biểu tượng lớn và hộp "Bạn cần biết" của prototype để nội dung bắt đầu
     ngay dưới tiêu đề, mắt không phải kéo xuống nửa dưới màn hình; tag "Quan trọng" vẫn ở cạnh danh mục. */
  return {
    head: <TopBar title="Bản tin" right={null} />,
    bodyGap: 12,
    body: [
      <View key="hero" style={[styles.hero, { experimental_backgroundImage: HERO_BG[n.important ? "important" : n.cat] }, n.important && { borderColor: "rgba(217,71,79,0.13)" }]}>
        <View pointerEvents="none" style={{ position: "absolute", width: 120, height: 120, borderRadius: 60, right: -50, top: -56, backgroundColor: "rgba(52,199,154,0.13)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={styles.cat}><Gi n={CAT[n.cat][1]} s={15} w={1.8} /><T style={{ color: C.emerald, fontSize: 11.5, fontFamily: F.bold }}>{CAT[n.cat][0]}</T></View>
          {n.important ? <ImpTag /> : null}
        </View>
        <Balanced style={styles.h1}>{n.title}</Balanced>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={styles.byAva}><T style={{ color: "#fff", fontSize: 10, fontFamily: F.bold, letterSpacing: 0.4 }}>{ini}</T></View>
          <View style={{ gap: 1, minWidth: 0 }}>
            <T style={{ fontSize: 12.5, fontFamily: F.bold }}>{n.by}</T>
            <T style={{ fontSize: 11.5, color: C.ink2 }}>{n.date}/{n.year} · {n.read} đọc</T>
          </View>
        </View>
      </View>,
      <View key="body" style={styles.bodyCard}>
        <Blocks blocks={n.body} />
        {file ? (
          <Pressable onPress={() => ACT.openNewsFile(n.key, n.fileName ?? file[0]!)} style={({ pressed }) => [styles.file, pressed && { transform: [{ scale: 0.985 }], backgroundColor: "#fff" }]}>
            <View style={styles.fileI}><Gi n="doc" s={21} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T numberOfLines={1} style={{ fontSize: 12.5, fontFamily: F.bold }}>{file[0]}</T>
              <T style={{ fontSize: 11.5, color: C.ink3 }}>{file[1] || "Tệp đính kèm"}</T>
            </View>
            <View style={{ width: 32, alignItems: "center" }}><Ic n="download" s={18} color={C.ink3} /></View>
          </Pressable>
        ) : null}
      </View>,
      <View key="act" style={{ flexDirection: "row", gap: 10 }}>
        <Pressable style={styles.action} onPress={() => ACT.toast("Đã lưu bài viết")}><Ic n="pinned" s={17} w={1.8} /><T style={styles.actionT}>Lưu tin</T></Pressable>
        <Pressable style={styles.action} onPress={() => ACT.toast("Đã sao chép liên kết bài viết")}><Ic n="msg" s={17} w={1.8} /><T style={styles.actionT}>Chia sẻ</T></Pressable>
      </View>,
    ],
  };
}

/* ---------- Nội dung có định dạng (đậm, nghiêng, gạch chân, tiêu đề mục, danh sách, thụt lề, đường kẻ) ---------- */
const BODY = { fontSize: 14, lineHeight: 24.1, color: "#30423B" } as const;
function Inl({ c }: { c: AnnouncementInline[] }) {
  return <>{c.map((x, i) => (x.b || x.i || x.u
    ? <T key={i} style={{ fontFamily: x.b ? (x.i ? F.boldItalic : F.bold) : x.i ? F.italic : F.regular, color: x.b ? C.ink : undefined, textDecorationLine: x.u ? "underline" : "none" }}>{x.text}</T>
    : x.text))}</>;
}
function Blocks({ blocks }: { blocks: AnnouncementBlock[] }) {
  if (!blocks.length) return <T style={[BODY, { color: C.ink3 }]}>Bài viết chưa có nội dung.</T>;
  return (
    <View style={{ gap: 12 }}>
      {blocks.map((b, i) => {
        if (b.kind === "hr") return <View key={i} style={{ height: 1, backgroundColor: C.line, marginVertical: 4 }} />;
        if (b.kind === "h") return <T key={i} style={{ fontSize: 16, lineHeight: 22, fontFamily: F.bold, marginTop: i ? 4 : 0 }}><Inl c={b.content} /></T>;
        if (b.kind === "p") return <T key={i} style={[BODY, b.indent ? { marginLeft: 22 * b.indent } : null]}>{b.lines.map((l, j) => <T key={j}>{j ? "\n" : ""}<Inl c={l} /></T>)}</T>;
        const marks = announcementListMarkers(b.items);
        return (
          <View key={i} style={{ gap: 9 }}>
            {b.items.map((it, j) => (
              <View key={j} style={{ paddingLeft: 28 + it.level * 22 }}>
                {it.level === 0
                  ? <View style={[styles.tick, it.ordered && { width: 21, height: 21 }]}><T style={{ fontSize: it.ordered ? 10.5 : 11, lineHeight: 13, fontFamily: F.extrabold, color: C.emerald }}>{it.ordered ? marks[j]!.replace(".", "") : "✓"}</T></View>
                  : <T style={{ position: "absolute", left: 6 + it.level * 22, top: 0, width: 18, fontSize: 13.5, lineHeight: 20.9, color: C.emerald, fontFamily: F.bold }}>{marks[j]}</T>}
                <T style={{ fontSize: 13.5, lineHeight: 20.9, color: "#30423B" }}><Inl c={it.content} /></T>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nw: { flexDirection: "row", gap: 14, paddingVertical: 16, paddingHorizontal: 18, width: "100%" },
  nwLine: { position: "absolute", top: 0, left: 18, right: 18, height: 1, backgroundColor: C.line },
  ico: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.soft2, alignItems: "center", justifyContent: "center" },
  meta: { fontSize: 12, color: C.ink3, fontFamily: F.medium },
  hero: { marginHorizontal: -2, overflow: "hidden", borderRadius: 24, padding: 16, borderWidth: 1, borderColor: "rgba(6,95,70,0.09)", boxShadow: "0px 16px 34px -28px rgba(6,70,50,0.44)" },
  cat: { height: 29, paddingHorizontal: 10, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.72)", boxShadow: "inset 0px 0px 0px 1px rgba(6,95,70,0.09)" },
  h1: { fontSize: 21, lineHeight: 25.5, letterSpacing: -0.6, fontFamily: F.bold, marginTop: 12, marginBottom: 12, alignSelf: "flex-start" },
  byAva: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", experimental_backgroundImage: GL.gIn, boxShadow: "0px 8px 18px -12px rgba(6,95,70,0.7)" },
  bodyCard: { marginHorizontal: -2, paddingHorizontal: 18, paddingVertical: 18, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(6,95,70,0.08)", boxShadow: GL.sh0 },
  tick: { position: "absolute", left: 0, top: 1, width: 19, height: 19, borderRadius: 10, backgroundColor: "#E2F6EC", alignItems: "center", justifyContent: "center" },
  file: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: "#F8FAF9", borderWidth: 1, borderColor: C.line2 },
  fileI: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F7EF" },
  action: { flex: 1, height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: C.line2 },
  actionT: { fontSize: 12.5, fontFamily: F.semibold },
});
