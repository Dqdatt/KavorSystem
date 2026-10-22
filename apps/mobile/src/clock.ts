import { useEffect, useState } from "react";
import { simNow } from "./store";

/* tick(): cập nhật [data-clock] mỗi giây mà không vẽ lại cả màn hình */
const subs = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export function useClock() {
  const [now, setNow] = useState(simNow());
  useEffect(() => {
    subs.add(setNow);
    if (!timer) timer = setInterval(() => { const n = simNow(); subs.forEach((s) => s(n)); }, 1000);
    return () => { subs.delete(setNow); if (!subs.size && timer) { clearInterval(timer); timer = null; } };
  }, []);
  return now;
}
