/* Tính vị trí khớp gần nhất cho ScrollView trên web (react-native-web bỏ qua snapToInterval/snapToOffsets). */
export function snapTarget(pos: number, interval?: number, offsets?: number[]): number | null {
  if (offsets && offsets.length > 0) {
    let best = offsets[0]!;
    let bestDist = Math.abs(pos - best);
    for (let i = 1; i < offsets.length; i++) {
      const candidate = offsets[i]!;
      const dist = Math.abs(pos - candidate);
      if (dist < bestDist) {
        best = candidate;
        bestDist = dist;
      }
    }
    return Math.max(0, best);
  }
  if (typeof interval === "number" && interval > 0) {
    return Math.max(0, Math.round(pos / interval) * interval);
  }
  return null;
}
