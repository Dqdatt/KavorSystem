/* Tên máy gửi khi đăng ký thiết bị chấm công: thêm "(PWA)" để HR phân biệt với app native khi duyệt máy mới
   (Platform.OS của PWA là "ios" nên trang Thiết bị của HR không tự phân biệt được). */
import { modelName as real } from "expo-device";

export * from "expo-device";
export const modelName = `${real ?? "Trình duyệt"} (PWA)`;
