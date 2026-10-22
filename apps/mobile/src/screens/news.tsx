import { Pressable, StyleSheet, View } from "react-native";
import { C, F, GL } from "../theme";
import { Gi, Ic } from "../icons";
import { Balanced, Card, Chip, Chips, Empty, T } from "../ui";
import { TabHead, TopBar, type ScreenSpec } from "../screen";
import { CAT, NEWS, type News } from "../data";
import { ACT, S, go } from "../store";
import { ImpTag } from "./home";

function NewsRow({ n, first }: { n: News; first: boolean }) {
  return (
    <Pressable onPress={() => { S.param = String(n.id); go("newsDetail"); }} style={({ pressed }) => [styles.nw, pressed && { backgroundColor: C.soft }]}>
      {!first ? <View style={styles.nwLine} /> : null}
      <View style={styles.ico}><Gi n={CAT[n.cat][1]} s={22} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {n.important ? <ImpTag shrink={!!n.pin} /> : null}
          {n.pin ? <Ic n="pinned" s={12} w={2} color={C.ink3} /> : null}
          <T style={[styles.meta, { flexShrink: 1 }]}>{n.pin ? " Đã ghim · " : ""}{CAT[n.cat][0]} · {n.date}</T>
        </View>
        <T style={{ fontSize: 15, fontFamily: F.semibold, lineHeight: 20.3 }}>{n.title}</T>
        {n.pin ? <T numberOfLines={2} style={{ color: C.ink2, fontSize: 13 }}>{n.body[0] as string}</T> : null}
      </View>
    </Pressable>
  );
}

export function newsSpec(): ScreenSpec {
  const c = S.newsCat, list = NEWS.filter((n) => c === "all" || n.cat === c);
  return {
    nav: true,
    head: <TabHead title="Bản tin" />,
    body: [
      <Chips key="chips">{([["all", "Tất cả"], ["notice", "Thông báo"], ["policy", "Chính sách"], ["event", "Sự kiện"]] as Array<[string, string]>).map((x) => <Chip key={x[0]} on={c === x[0]} label={x[1]} onPress={() => ACT.newsCat(x[0])} />)}</Chips>,
      list.length ? <Card key="list">{list.map((n, i) => <NewsRow key={n.id} n={n} first={i === 0} />)}</Card> : <Empty key="e" icon={<Gi n="news" s={44} />} title="Chưa có bài" />,
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
  const n = NEWS.find((x) => x.id === +(S.param ?? 0)) || NEWS[0]!;
  const by = n.by.split(" "), ini = ((by[0] ?? "")[0]! + (by[by.length - 1] ?? "")[0]!).toUpperCase();
  const callout = n.id === 6 ? "Hệ thống tạm dừng trong 90 phút, từ 22:00 đến 23:30 tối nay." : n.id === 1 ? "Quy định chấm công mới bắt đầu áp dụng từ ngày 01/11/2026." : "Đây là thông tin quan trọng, bạn nên đọc kỹ trước khi tiếp tục.";
  const file = n.file ? n.file.split(" · ") : null;
  return {
    head: <TopBar title="Bản tin" right={null} />,
    bodyGap: 14,
    body: [
      /* Prototype: section mang cả class "notice" nên tin loại Thông báo bị căn giữa và có gap 14 */
      <View key="hero" style={[styles.hero, { experimental_backgroundImage: HERO_BG[n.important ? "important" : n.cat] }, n.important && { borderColor: "rgba(217,71,79,0.13)" }, n.cat === "notice" && { alignItems: "center", gap: 14 }]}>
        <View pointerEvents="none" style={{ position: "absolute", width: 154, height: 154, borderRadius: 77, right: -60, top: -62, backgroundColor: "rgba(52,199,154,0.15)" }} />
        <View pointerEvents="none" style={{ position: "absolute", width: 96, height: 96, borderRadius: 48, left: -42, bottom: -52, backgroundColor: "rgba(255,222,161,0.23)" }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <View style={styles.cat}><Gi n={CAT[n.cat][1]} s={16} w={1.8} /><T style={{ color: C.emerald, fontSize: 11.5, fontFamily: F.bold }}>{CAT[n.cat][0]}</T></View>
          {n.important ? <ImpTag /> : null}
        </View>
        <View style={[styles.heroIcon, n.important && { backgroundColor: "rgba(255,255,255,0.76)" }]}><Gi n={CAT[n.cat][1]} s={27} w={1.55} /></View>
        <Balanced style={[styles.h1, { alignSelf: "flex-start" }]}>{n.title}</Balanced>
        <View style={{ marginTop: "auto", flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={styles.byAva}><T style={{ color: "#fff", fontSize: 10, fontFamily: F.bold, letterSpacing: 0.4 }}>{ini}</T></View>
          <View style={{ gap: 1, minWidth: 0 }}>
            <T style={{ fontSize: 12.5, fontFamily: F.bold }}>{n.by}</T>
            <T style={{ fontSize: 11.5, color: C.ink2 }}>{n.date}/2026 · {n.read} đọc</T>
          </View>
        </View>
      </View>,
      n.important ? (
        <View key="call" style={styles.callout}>
          <View style={styles.calloutI}><Ic n="alert" s={21} w={2} color={C.bad} /></View>
          <View style={{ flex: 1 }}>
            <T style={{ fontSize: 14, fontFamily: F.bold, marginBottom: 4 }}>Bạn cần biết</T>
            <T style={{ fontSize: 13, lineHeight: 20.2, color: C.ink2 }}>{callout}</T>
          </View>
        </View>
      ) : null,
      <View key="body" style={styles.bodyCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Ic n="book" s={17} w={1.8} color={C.emerald} />
          <T style={{ fontSize: 12, fontFamily: F.extrabold, letterSpacing: 0.96, textTransform: "uppercase", color: C.emerald }}>Nội dung</T>
        </View>
        <View>
          {n.body.map((b, i) => Array.isArray(b) ? (
            <View key={i} style={{ gap: 10, marginTop: 2, marginBottom: i === n.body.length - 1 ? 0 : 14 }}>
              {b.map((x) => (
                <View key={x} style={{ paddingLeft: 28 }}>
                  <View style={styles.tick}><T style={{ fontSize: 11, lineHeight: 13, fontFamily: F.extrabold, color: C.emerald }}>✓</T></View>
                  <T style={{ fontSize: 13.5, lineHeight: 20.9, color: "#30423B" }}>{x}</T>
                </View>
              ))}
            </View>
          ) : <T key={i} style={{ fontSize: 14, lineHeight: 24.1, color: "#30423B", marginBottom: i === n.body.length - 1 ? 0 : 14 }}>{b}</T>)}
        </View>
        {file ? (
          <Pressable onPress={() => ACT.toast(`Mở ${file[0]} trong trình xem PDF`)} style={({ pressed }) => [styles.file, pressed && { transform: [{ scale: 0.985 }], backgroundColor: "#fff" }]}>
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

const styles = StyleSheet.create({
  nw: { flexDirection: "row", gap: 14, paddingVertical: 16, paddingHorizontal: 18, width: "100%" },
  nwLine: { position: "absolute", top: 0, left: 18, right: 18, height: 1, backgroundColor: C.line },
  ico: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.soft2, alignItems: "center", justifyContent: "center" },
  meta: { fontSize: 12, color: C.ink3, fontFamily: F.medium },
  hero: { marginHorizontal: -2, overflow: "hidden", borderRadius: 24, padding: 16, minHeight: 224, borderWidth: 1, borderColor: "rgba(6,95,70,0.09)", boxShadow: "0px 16px 34px -28px rgba(6,70,50,0.44)" },
  cat: { height: 29, paddingHorizontal: 10, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.72)", boxShadow: "inset 0px 0px 0px 1px rgba(6,95,70,0.09)" },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", alignSelf: "flex-end", marginTop: 6, marginHorizontal: 2, marginBottom: -16, backgroundColor: "rgba(255,255,255,0.68)", boxShadow: "0px 10px 24px -20px rgba(6,70,50,0.65)", transform: [{ rotate: "4deg" }] },
  h1: { fontSize: 22.5, lineHeight: 26.1, letterSpacing: -0.675, fontFamily: F.bold, marginTop: 12, marginBottom: 14 },
  byAva: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", experimental_backgroundImage: GL.gIn, boxShadow: "0px 8px 18px -12px rgba(6,95,70,0.7)" },
  callout: { marginHorizontal: -2, flexDirection: "row", gap: 12, padding: 16, borderRadius: 22, experimental_backgroundImage: "linear-gradient(135deg, #FFF1F1, #FFF9F5)", borderWidth: 1, borderColor: "rgba(217,71,79,0.14)" },
  calloutI: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", boxShadow: "0px 8px 18px -14px rgba(217,71,79,0.8)" },
  bodyCard: { marginHorizontal: -2, padding: 20, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.82)", borderWidth: 1, borderColor: "rgba(6,95,70,0.08)", boxShadow: GL.sh0 },
  tick: { position: "absolute", left: 0, top: 1, width: 19, height: 19, borderRadius: 10, backgroundColor: "#E2F6EC", alignItems: "center", justifyContent: "center" },
  file: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: "#F8FAF9", borderWidth: 1, borderColor: C.line2 },
  fileI: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E7F7EF" },
  action: { flex: 1, height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.78)", borderWidth: 1, borderColor: C.line2 },
  actionT: { fontSize: 12.5, fontFamily: F.semibold },
});
