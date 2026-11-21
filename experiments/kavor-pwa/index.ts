/* Điểm vào PWA: chạy nguyên app mobile (apps/mobile/src, chỉ đọc) trên react-native-web.
   Các module native được thay bằng bản web ở ./shims (xem metro.config.js). */
import "./shims/pwa";
import "./shims/geo-perm";
import { registerRootComponent } from "expo";
import { warmImages } from "./shims/imgcache";

/* Nạp ảnh đại diện/ảnh bìa đã lưu trước khi app đọc (giống file ảnh trên máy ở bản native), tối đa 400 ms */
void Promise.race([warmImages(), new Promise((r) => setTimeout(r, 400))]).finally(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  registerRootComponent(require("../../apps/mobile/src/App").default);
});
