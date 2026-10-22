import { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { EASE } from "./theme";
import { useReducedMotion } from "./motion";

/* Minh họa hai tông lấy nguyên từ ILLUS{} của prototype. Phần `draw` hiện dần, phần `fly` trượt vào sau 0,3 s */
const SOFT = "#E9F8F0";
const spark = (x: number, y: number, r = 6) => `<path class="draw d3" d="M${x} ${y - r}l${r * 0.4} ${r * 0.6} ${r * 0.6} ${r * 0.4}-${r * 0.6} ${r * 0.4}-${r * 0.4} ${r * 0.6}-${r * 0.4}-${r * 0.6}-${r * 0.6}-${r * 0.4} ${r * 0.6}-${r * 0.4}z" stroke="#9EDBBF" stroke-width="2" stroke-linejoin="round"/>`;
const speed = '<g stroke="#CBE9DA" stroke-width="3" stroke-linecap="round" class="fly"><path d="M14 64h20M8 76h22M18 88h16"/></g>';
const badge = (cx: number, cy: number) => `<g class="fly"><circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="m${cx - 8} ${cy} 5 5 10-10" stroke="url(#gL)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const lockB = (cx: number, cy: number) => `<g class="fly"><circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="url(#gL)" stroke-width="4"/><rect x="${cx - 8}" y="${cy - 3}" width="16" height="12" rx="3" stroke="url(#gL)" stroke-width="3.2"/><path d="M${cx - 5} ${cy - 3}v-3a5 5 0 0 1 10 0v3" stroke="url(#gL)" stroke-width="3.2"/></g>`;
const alertB = (cx: number, cy: number) => `<g class="fly"><circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="#D9474F" stroke-width="4"/><path d="M${cx} ${cy - 8}v9M${cx} ${cy + 7}v.5" stroke="#D9474F" stroke-width="4" stroke-linecap="round"/></g>`;
const clockB = (cx: number, cy: number) => `<g class="fly"><circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="M${cx} ${cy - 9}v9l6 4" stroke="url(#gL)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const upB = (cx: number, cy: number) => `<g class="fly"><circle cx="${cx}" cy="${cy}" r="18" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="M${cx} ${cy + 8}v-15M${cx - 6} ${cy - 2}l6-6 6 6" stroke="url(#gL)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
const phoneShape = `<rect class="draw" x="56" y="20" width="58" height="108" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M78 114h14" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>`;

export const ILLUS = {
  explain: `${speed}<circle class="draw" cx="82" cy="72" r="40" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M82 50v24l14 9" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><g class="fly"><rect x="104" y="58" width="62" height="44" rx="7" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="m106 62 29 22 29-22" stroke="url(#gL)" stroke-width="4" stroke-linejoin="round"/></g>`,
  leave: `<rect class="draw" x="40" y="38" width="82" height="78" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M40 60h82M62 28v18M100 28v18" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/><path class="draw d2" d="m64 88 10 10 22-22" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M118 74q14-4 22-20" stroke="#CBE9DA" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 7" class="fly"/><g class="fly"><path d="M134 46 176 26l-14 44-12-16z" fill="#fff" stroke="url(#gL)" stroke-width="4" stroke-linejoin="round"/><path d="M150 54 176 26" stroke="url(#gL)" stroke-width="4" stroke-linecap="round"/></g>`,
  ot: `<path class="draw" d="M96 28a46 46 0 1 0 50 62 38 38 0 0 1-50-62z" stroke="url(#gL)" stroke-width="5" stroke-linejoin="round" fill="${SOFT}"/><g class="fly"><circle cx="136" cy="100" r="24" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="M136 88v12l9 6" stroke="url(#gL)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>${spark(150, 40)}${spark(52, 36, 5)}`,
  punchIn: `<circle class="draw" cx="92" cy="74" r="46" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M98 52h14a6 6 0 0 1 6 6v32a6 6 0 0 1-6 6H98" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path class="draw d2" d="M64 74h40M92 62l12 12-12 12" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${badge(140, 108)}${spark(150, 36)}`,
  punchOut: `<circle class="draw" cx="92" cy="74" r="46" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M86 52H72a6 6 0 0 0-6 6v32a6 6 0 0 0 6 6h14" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path class="draw d2" d="M84 74h40M112 62l12 12-12 12" stroke="url(#gL)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${badge(140, 108)}${spark(36, 40, 5)}`,
  device: `<rect class="draw" x="56" y="20" width="58" height="108" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M78 114h14" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/><g class="fly"><path d="m134 64 26 9v19c0 17-12 27-26 32-14-5-26-15-26-32V73z" fill="#fff" stroke="url(#gL)" stroke-width="4" stroke-linejoin="round"/><path d="m124 93 7 7 14-14" stroke="url(#gL)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>${spark(150, 38)}`,
  approved: `<rect class="draw" x="50" y="30" width="78" height="96" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><rect class="draw d2" x="72" y="22" width="34" height="16" rx="6" stroke="url(#gL)" stroke-width="5" fill="#fff"/><path class="draw d2" d="M68 66h36M68 84h42M68 102h22" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>${badge(130, 110)}${spark(152, 42)}`,
  offline: `<path class="draw" d="M60 108h72a26 26 0 0 0 3-52 34 34 0 0 0-65-6 29 29 0 0 0-10 58z" stroke="url(#gL)" stroke-width="5" stroke-linejoin="round" fill="${SOFT}"/><path d="M58 26 138 122" stroke="#fff" stroke-width="13" stroke-linecap="round"/><path class="draw d2" d="M58 26 138 122" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>${spark(156, 38, 5)}`,
  server: `<rect class="draw" x="50" y="28" width="86" height="38" rx="9" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><rect class="draw" x="50" y="74" width="86" height="38" rx="9" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M66 47h.01M80 47h22M66 93h.01M80 93h22" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>${alertB(138, 112)}`,
  maintenance: `<circle class="draw" cx="84" cy="74" r="32" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><circle class="draw d2" cx="84" cy="74" r="11" stroke="url(#gL)" stroke-width="5"/><path class="draw d2" d="M84 30v10M84 108v10M40 74h10M118 74h10M53 43l7 7M108 98l7 7M53 105l7-7M108 50l7-7" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/><g class="fly"><g transform="rotate(40 142 98)"><rect x="136" y="74" width="13" height="50" rx="6.5" fill="#fff" stroke="url(#gL)" stroke-width="4"/><path d="M131 76a11 11 0 0 1 23 0" stroke="url(#gL)" stroke-width="4" stroke-linecap="round"/></g></g>`,
  session: `<rect class="draw" x="56" y="62" width="70" height="56" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="M72 62V48a19 19 0 0 1 38 0v14" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/><path class="draw d2" d="M91 84v12" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>${clockB(138, 110)}`,
  disabled: `<rect class="draw" x="38" y="38" width="106" height="72" rx="12" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><circle class="draw d2" cx="68" cy="66" r="11" stroke="url(#gL)" stroke-width="5"/><path class="draw d2" d="M52 94c3-8 9-11 16-11s13 3 16 11M98 62h30M98 78h20" stroke="url(#gL)" stroke-width="5" stroke-linecap="round"/>${lockB(144, 112)}`,
  deviceLock: `${phoneShape}${lockB(132, 100)}${spark(152, 36)}`,
  devicePending: `${phoneShape}${clockB(132, 100)}`,
  locPerm: `<path class="draw" d="M90 128s-38-34-38-64a38 38 0 0 1 76 0c0 30-38 64-38 64z" stroke="url(#gL)" stroke-width="5" stroke-linejoin="round" fill="${SOFT}"/><circle class="draw d2" cx="90" cy="64" r="13" stroke="url(#gL)" stroke-width="5"/>${lockB(136, 108)}`,
  gpsOff: `<path class="fly" d="M42 98a58 58 0 0 1 0-48M138 50a58 58 0 0 1 0 48" stroke="#CBE9DA" stroke-width="4" stroke-linecap="round" stroke-dasharray="4 8"/><path class="draw" d="M90 128s-34-30-34-58a34 34 0 0 1 68 0c0 28-34 58-34 58z" stroke="url(#gL)" stroke-width="5" stroke-linejoin="round" fill="${SOFT}"/><circle class="draw d2" cx="90" cy="70" r="12" stroke="url(#gL)" stroke-width="5"/>${alertB(134, 110)}`,
  update: `${phoneShape}${upB(132, 100)}${spark(152, 36)}`,
  ok: `<circle class="draw" cx="95" cy="75" r="44" stroke="url(#gL)" stroke-width="5" fill="${SOFT}"/><path class="draw d2" d="m75 76 14 14 27-29" stroke="url(#gL)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>${spark(150, 36)}`,
} as const;

export type IllusKind = keyof typeof ILLUS;

const DEFS = '<defs><linearGradient id="gL" gradientUnits="userSpaceOnUse" x1="20" y1="130" x2="170" y2="20"><stop offset="0" stop-color="#2BB389"/><stop offset="1" stop-color="#065F46"/></linearGradient></defs>';

/* Tách các phần tử class="fly" (kể cả <g> lồng nhau) để animate riêng */
function split(art: string) {
  let fly = "";
  let rest = "";
  let i = 0;
  while (i < art.length) {
    const m = /<(g|path|rect|circle)\b[^>]*class="fly"[^>]*>/.exec(art.slice(i));
    if (!m) { rest += art.slice(i); break; }
    const start = i + m.index;
    rest += art.slice(i, start);
    if (m[0].endsWith("/>")) { fly += m[0]; i = start + m[0].length; continue; }
    let depth = 0;
    let j = start;
    const re = /<\/?g\b[^>]*>/g;
    re.lastIndex = start;
    let t: RegExpExecArray | null;
    while ((t = re.exec(art))) {
      if (t[0].startsWith("</")) depth--; else if (!t[0].endsWith("/>")) depth++;
      if (depth === 0) { j = t.index + t[0].length; break; }
    }
    fly += art.slice(start, j);
    i = j;
  }
  return { rest, fly };
}

const svg = (body: string, w: number, h: number) => `<svg width="${w}" height="${h}" viewBox="0 0 190 150" fill="none">${DEFS}${body}</svg>`;

export function Illus({ kind, width = 190, height = 150, animate = true }: { kind: IllusKind; width?: number; height?: number; animate?: boolean }) {
  const reduced = useReducedMotion();
  const parts = useMemo(() => split(ILLUS[kind] ?? ILLUS.ok), [kind]);
  const draw = useRef(new Animated.Value(animate && !reduced ? 0 : 1)).current;
  const fly = useRef(new Animated.Value(animate && !reduced ? 0 : 1)).current;
  useEffect(() => {
    if (!animate || reduced) return;
    draw.setValue(0); fly.setValue(0);
    Animated.parallel([
      Animated.timing(draw, { toValue: 1, duration: 1000, easing: EASE, useNativeDriver: true }),
      Animated.timing(fly, { toValue: 1, duration: 800, delay: 300, easing: EASE, useNativeDriver: true }),
    ]).start();
  }, [kind, animate, reduced, draw, fly]);
  return (
    <View style={{ width, height }} pointerEvents="none">
      <Animated.View style={{ position: "absolute", inset: 0, opacity: draw, transform: [{ scale: draw.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
        <SvgXml xml={svg(parts.rest, width, height)} width={width} height={height} />
      </Animated.View>
      {parts.fly ? <Animated.View style={{ position: "absolute", inset: 0, opacity: fly, transform: [{ translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }}>
        <SvgXml xml={svg(parts.fly, width, height)} width={width} height={height} />
      </Animated.View> : null}
    </View>
  );
}
