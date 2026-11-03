/* Chọn minh chứng cho đơn (giải trình, nghỉ phép): chụp ảnh, thư viện ảnh hoặc tệp PDF. Ảnh chuyển về JPEG (iPhone chụp HEIC — máy chủ
   chỉ nhận PDF/PNG/JPEG/WebP) và nén để vừa 5 MB; máy chủ vẫn kiểm lại loại file theo nội dung. */
import { Alert, Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";

export type PickedFile = { name: string; size: number; base64: string };
export const PICK_MAX_BYTES = 5 * 1024 * 1024;
type Source = "camera" | "library" | "pdf";

/* Hỏi nguồn bằng hộp thoại hệ thống (Android hiện tối đa 3 nút: bỏ "Hủy", chạm ngoài để đóng) */
export function chooseSource(): Promise<Source | null> {
  return new Promise((done) => {
    const opts: Array<{ text: string; style?: "cancel"; onPress: () => void }> = [
      { text: "Chụp ảnh", onPress: () => done("camera") },
      { text: "Chọn ảnh", onPress: () => done("library") },
      { text: "Chọn tệp PDF", onPress: () => done("pdf") },
    ];
    if (Platform.OS === "ios") opts.push({ text: "Hủy", style: "cancel", onPress: () => done(null) });
    Alert.alert("Thêm minh chứng", "Ảnh hoặc PDF, tối đa 5 MB", opts, { cancelable: true, onDismiss: () => done(null) });
  });
}

/* Ảnh đại diện: hỏi nguồn (có ảnh rồi thì thêm "Gỡ ảnh"), cắt vuông bằng khung cắt của hệ điều hành, JPEG ≤ 2 MB */
export type AvatarPick = { base64: string } | "remove" | null;
export async function pickAvatar(hasAvatar: boolean): Promise<AvatarPick> {
  const src = await new Promise<"camera" | "library" | "remove" | null>((done) => {
    const opts: Array<{ text: string; style?: "cancel" | "destructive"; onPress: () => void }> = [
      { text: "Chụp ảnh", onPress: () => done("camera") },
      { text: "Chọn ảnh", onPress: () => done("library") },
    ];
    if (hasAvatar) opts.push({ text: "Gỡ ảnh đại diện", style: "destructive", onPress: () => done("remove") });
    if (Platform.OS === "ios") opts.push({ text: "Hủy", style: "cancel", onPress: () => done(null) });
    Alert.alert("Ảnh đại diện", "Kéo và phóng to để cắt ảnh vuông", opts, { cancelable: true, onDismiss: () => done(null) });
  });
  if (!src || src === "remove") return src;
  if (src === "camera") {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error("Kavor chưa có quyền dùng camera. Bật trong Cài đặt của máy, hoặc chọn ảnh có sẵn.");
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true, exif: false,
    cameraType: ImagePicker.CameraType.front, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
  const r = src === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.canceled ? null : r.assets[0];
  if (!a?.base64) return null;
  if ((a.base64.length * 3) / 4 > 2 * 1024 * 1024) throw new Error("Ảnh lớn hơn 2 MB. Cắt nhỏ hơn hoặc chọn ảnh khác.");
  return { base64: a.base64 };
}

/* null: người dùng hủy. Lỗi (quá dung lượng, không có quyền camera) ném Error có lời nhắn tiếng Việt */
export async function pickFile(source: Source): Promise<PickedFile | null> {
  if (source === "pdf") {
    const r = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true, multiple: false });
    const a = r.canceled ? null : r.assets[0];
    if (!a) return null;
    if (a.size && a.size > PICK_MAX_BYTES) throw new Error("Tệp lớn hơn 5 MB. Chọn tệp nhỏ hơn.");
    const base64 = await readBase64(a.uri);
    return checkSize({ name: a.name || "minh-chung.pdf", size: Math.floor((base64.length * 3) / 4), base64 });
  }
  if (source === "camera") {
    const p = await ImagePicker.requestCameraPermissionsAsync();
    if (!p.granted) throw new Error("Kavor chưa có quyền dùng camera. Bật trong Cài đặt của máy, hoặc chọn ảnh có sẵn.");
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.6, base64: true, exif: false,
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
  const r = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.canceled ? null : r.assets[0];
  if (!a?.base64) return null;
  const name = (a.fileName ?? `anh-${Date.now()}.jpg`).replace(/\.(heic|heif)$/i, ".jpg");
  return checkSize({ name, size: Math.floor((a.base64.length * 3) / 4), base64: a.base64 });
}

function checkSize(f: PickedFile) {
  if (f.size > PICK_MAX_BYTES) throw new Error("Tệp lớn hơn 5 MB. Chọn tệp nhỏ hơn.");
  return f;
}

/* Đọc file cục bộ thành base64 (không cần thêm module file system) */
async function readBase64(uri: string): Promise<string> {
  const blob = await (await fetch(uri)).blob();
  return new Promise((ok, fail) => {
    const fr = new FileReader();
    fr.onerror = () => fail(new Error("Không đọc được tệp."));
    fr.onload = () => ok(String(fr.result).replace(/^data:[^,]*,/, ""));
    fr.readAsDataURL(blob);
  });
}

export const sizeText = (n: number) => n >= 1024 * 1024 ? `${String(Math.round(n / 1024 / 102.4) / 10).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
