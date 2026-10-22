import { memo, useMemo } from "react";
import { Platform, View, type ViewStyle } from "react-native";
import { SymbolView } from "expo-symbols";
import { SvgXml } from "react-native-svg";

/* Line icons lấy nguyên từ prototype (P{}); g=true dùng nét gradient mint→emerald (#gI) */
export const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  cal: '<rect x="3" y="4.5" width="18" height="17" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  news: '<path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v10a2 2 0 0 1-2 2"/><path d="M8 9h5M8 13h5M8 17h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  tap: '<path d="M7.6 2.9a4.4 4.4 0 0 1 6.2 0"/><path d="M9 14V6.6a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.2 10.6V9.4a1.6 1.6 0 0 1 3.2 0V11"/><path d="M15.4 10.8a1.6 1.6 0 0 1 3.2 0v1"/><path d="M18.6 11.8a1.6 1.6 0 0 1 2.4 1.4V15a7 7 0 0 1-7 7h-1.4a6 6 0 0 1-4.7-2.3l-3.1-3.9a1.6 1.6 0 0 1 2.4-2.1L9 16"/>',
  tIn: '<path d="M12 3a9 9 0 1 1-8.5 6"/><path d="M3 4v5h5"/><path d="M12 7.5V12l3 2"/>',
  tOut: '<path d="M12 21a9 9 0 1 1 8.5-6"/><path d="M21 20v-5h-5"/><path d="m9.5 14.5 5-5M10.5 9.5h4v4"/>',
  tDone: '<path d="M21 12a9 9 0 1 1-4.3-7.7"/><path d="m8 12 3 3 9-9"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  arIn: '<path d="M17 7 7 17M15 17H7V9"/>',
  arOut: '<path d="M7 17 17 7M9 7h8v8"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  checks: '<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
  receipt: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  face: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  pinned: '<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
  clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10.2 17.2a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  hour: '<path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>',
  gear: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  megaphone: '<path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5V4.5M8 7h8M8 11h6"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.8a15 15 0 0 1 4.2-2.6"/><path d="M10.7 5.1A15 15 0 0 1 22 8.8"/><path d="M5 12.6a10 10 0 0 1 5.2-2.7"/><path d="M14.4 10.2A10 10 0 0 1 19 12.6"/><path d="M12 20h.01"/>',
  signal: '<path d="M3 20h.01M8 20v-4M13 20v-8"/><path d="M18 20V4" opacity=".3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v3"/><path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><path d="M21 12h-4a2 2 0 0 0 0 4h4z"/>',
} as const;

export type IconName = keyof typeof P;

const GI = '<defs><linearGradient id="gI" gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2"><stop offset="0" stop-color="#2BB389"/><stop offset="1" stop-color="#065F46"/></linearGradient></defs>';

type IcProps = { n: IconName; s?: number; w?: number; g?: boolean; color?: string; style?: ViewStyle };

/* Mỗi path tự mang stroke để react-native-svg không phụ thuộc vào kế thừa thuộc tính từ <svg> */
function IcBase({ n, s = 22, w = 1.7, g = false, color = "#13241E", style }: IcProps) {
  const xml = useMemo(() => {
    const stroke = g ? "url(#gI)" : color;
    const body = P[n].replace(/<(path|rect|circle)\b/g, `<$1 fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`);
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24">${g ? GI : ""}${body}</svg>`;
  }, [n, s, w, g, color]);
  return <View style={[{ width: s, height: s }, style]} pointerEvents="none"><SvgXml xml={xml} width={s} height={s} /></View>;
}
export const Ic = memo(IcBase);
export const Gi = ({ n, s = 26, w = 1.7, style }: { n: IconName; s?: number; w?: number; style?: ViewStyle }) => <Ic n={n} s={s} w={w} g style={style} />;

const LOGO = (size: number) => `<svg width="${size}" height="${size}" viewBox="0 0 470 470"><defs><linearGradient id="kavorGreen" x1="35" y1="412" x2="436" y2="57" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#10A37F"/><stop offset="1" stop-color="#065F46"/></linearGradient></defs><path d="M35 211 L35 411 L141 212 L245 412 L436 57" fill="none" stroke="url(#kavorGreen)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/><circle cx="364" cy="396" r="32" fill="#A7F3D0"/></svg>`;

/* .kavor-mark: ô vuông bo 28%, nền #EAF7F1, logo object-fit: contain */
export function Logo({ size = 44, plain = false }: { size?: number; plain?: boolean }) {
  const xml = useMemo(() => LOGO(size), [size]);
  return <View style={{ width: size, height: size, borderRadius: plain ? 0 : size * 0.28, backgroundColor: plain ? "transparent" : "#EAF7F1", overflow: "hidden" }}><SvgXml xml={xml} width={size} height={size} /></View>;
}

/* Biểu tượng Face ID hệ thống trên iOS; nền tảng khác dùng icon `face` của prototype */
export function FaceId({ size = 26, color = "#065F46", gradient = true }: { size?: number; color?: string; gradient?: boolean }) {
  if (Platform.OS === "ios") return <SymbolView name="faceid" size={size} tintColor={color} weight="regular" style={{ width: size, height: size }} />;
  return <Ic n="face" s={size} w={1.8} g={gradient} color={color} />;
}
