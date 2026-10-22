import { Easing } from "react-native";

/* Bảng màu và token lấy nguyên từ :root của Kavor HRM Prototype.html */
export const C = {
  page: "#EDF1EF",
  bg: "#FFFFFF",
  soft: "#F5F7F6",
  soft2: "#ECF8F2",
  ink: "#13241E",
  ink2: "#5D6B65",
  ink3: "#97A39D",
  line: "#EEF0EF",
  line2: "#DFE3E1",
  emerald: "#065F46",
  mint: "#A7F3D0",
  cream: "#FFF8E7",
  violet: "#10A37F",
  ok: "#15803D",
  bad: "#D9474F",
  warn: "#C27712",
  okSoft: "#E6F6EC",
  badSoft: "#FCECEC",
  warnSoft: "#FFF4DC",
  infoSoft: "#E9F8F0",
  hero: "#1D3B32",
} as const;

export const F = {
  light: "Montserrat_300Light",
  regular: "Montserrat_400Regular",
  medium: "Montserrat_500Medium",
  semibold: "Montserrat_600SemiBold",
  bold: "Montserrat_700Bold",
  extrabold: "Montserrat_800ExtraBold",
} as const;

/* Liquid glass layer (prototype: --gl-*) */
export const GL = {
  fill: "linear-gradient(155deg, rgba(255,255,255,0.74) 0%, rgba(255,255,255,0.40) 48%, rgba(255,255,255,0.58) 100%)",
  edge: "rgba(255,255,255,0.82)",
  sh: "inset 0px 1px 0px rgba(255,255,255,0.95), inset 1px 0px 0px rgba(255,255,255,0.45), inset 0px -1px 1px rgba(255,255,255,0.35), 0px 12px 32px -16px rgba(6,70,50,0.30)",
  tint: "linear-gradient(155deg, rgba(18,150,112,0.94) 0%, rgba(6,95,70,0.92) 60%, rgba(4,78,57,0.94) 100%)",
  tintSh: "inset 0px 1px 0px rgba(255,255,255,0.5), inset 0px -3px 8px rgba(0,40,28,0.35), inset 0px 0px 0px 1px rgba(255,255,255,0.16), 0px 12px 24px -12px rgba(6,95,70,0.6)",
  shSm: "0px 6px 16px -8px rgba(6,70,50,0.22)",
  sh0: "0px 18px 40px -22px rgba(6,70,50,0.30)",
  gIn: "linear-gradient(225deg, #0E7A5B 0%, #065F46 60%, #05523D 100%)",
  gOut: "linear-gradient(225deg, #C6F7E1 0%, #A7F3D0 60%, #8EE8C0 100%)",
} as const;

/* Glass surface style dùng cho .card, .notice, .chip, .tb-btn, .month, .inp... */
export const glass = {
  experimental_backgroundImage: GL.fill,
  borderWidth: 1,
  borderColor: GL.edge,
  boxShadow: GL.sh,
} as const;

export const tint = {
  experimental_backgroundImage: GL.tint,
  boxShadow: GL.tintSh,
  borderColor: "rgba(255,255,255,0.25)",
} as const;

export const EASE = Easing.bezier(0.22, 0.8, 0.24, 1);
export const SPRING = Easing.bezier(0.2, 0.9, 0.25, 1.08);

export const lh = (size: number, k = 1.45) => Math.round(size * k * 10) / 10;
