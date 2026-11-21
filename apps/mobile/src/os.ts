/* Máy iPhone/iPad. Bản web (PWA): Metro thay sẵn Platform.OS = "web" lúc build (shim đặt "ios" lúc chạy không còn tác dụng)
   nên nhận iPhone qua userAgent — để nhãn, chữ hướng dẫn và nền tảng gửi máy chủ đúng là iOS. */
import { Platform } from "react-native";

const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
export const IS_IOS = Platform.OS === "ios" || (Platform.OS === "web" && /iPhone|iPad|iPod/.test(ua));
