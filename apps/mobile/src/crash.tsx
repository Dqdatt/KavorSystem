/* Báo lỗi trong giai đoạn dev: bắt lỗi render và lỗi JS chưa xử lý, lưu bản gần nhất trong máy
   để lần mở sau báo cho người test. Khi có tài khoản Sentry, gửi `report()` lên Sentry tại đây. */
import { Component, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as SecureStore from "expo-secure-store";

type CrashRecord = { message: string; stack?: string; at: string; fatal: boolean; where: "render" | "global" };
const KEY = "kavor.lastCrash";

async function report(error: unknown, where: CrashRecord["where"], fatal: boolean) {
  const e = error instanceof Error ? error : new Error(String(error));
  const rec: CrashRecord = { message: e.message.slice(0, 300), stack: e.stack?.split("\n").slice(0, 8).join("\n"), at: new Date().toISOString(), fatal, where };
  console.error("[Kavor crash]", rec.message, rec.stack);
  await SecureStore.setItemAsync(KEY, JSON.stringify(rec)).catch(() => {});
}

/* Lấy và xóa lỗi của lần chạy trước */
export async function takeLastCrash(): Promise<CrashRecord | null> {
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!raw) return null;
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
  try { return JSON.parse(raw) as CrashRecord; } catch { return null; }
}

type ErrorUtilsShape = { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void };
let installed = false;
export function installCrashHandler() {
  if (installed) return;
  installed = true;
  const eu = (globalThis as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!eu) return;
  const prev = eu.getGlobalHandler();
  eu.setGlobalHandler((e, fatal) => {
    void report(e, "global", !!fatal);
    prev(e, fatal);
  });
}

export class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { void report(error, "render", true); }
  render() {
    if (!this.state.error) return this.props.children;
    /* Không dùng font/thành phần của app vì chính chúng có thể là nguyên nhân lỗi */
    return (
      <View style={styles.root}>
        <Text style={styles.code}>E04 · lỗi ứng dụng</Text>
        <Text style={styles.title}>Kavor gặp sự cố</Text>
        <Text style={styles.text}>Dữ liệu đã nhập chưa gửi có thể bị mất. Chụp màn hình này gửi cho đội phát triển rồi bấm khởi động lại.</Text>
        <ScrollView style={styles.box}><Text style={styles.stack}>{this.state.error.message}{"\n\n"}{this.state.error.stack?.split("\n").slice(0, 8).join("\n")}</Text></ScrollView>
        <Pressable style={styles.btn} onPress={() => this.setState({ error: null })}><Text style={styles.btnText}>Khởi động lại</Text></Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 24, paddingTop: 96, gap: 12 },
  code: { fontSize: 12, color: "#97A39D", fontFamily: "Menlo" },
  title: { fontSize: 22, fontWeight: "700", color: "#13241E" },
  text: { fontSize: 14, color: "#5D6B65", lineHeight: 20 },
  box: { maxHeight: 260, borderRadius: 16, backgroundColor: "#F5F7F6", padding: 14 },
  stack: { fontSize: 11, color: "#5D6B65", fontFamily: "Menlo" },
  btn: { height: 54, borderRadius: 27, backgroundColor: "#065F46", alignItems: "center", justifyContent: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
