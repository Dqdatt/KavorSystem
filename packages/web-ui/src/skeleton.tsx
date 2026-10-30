/* Khung chờ (skeleton) khi dữ liệu đang tải — thay cho bảng trống/"Đang tải…" ở web HR và Kavor Console */
import type { CSSProperties } from "react";

export function Skeleton({ w, h, round, style }: { w?: number | string; h?: number; round?: boolean; style?: CSSProperties }) {
  return <span className={`skeleton${round ? " round" : ""}`} aria-hidden="true" style={{ width: w, height: h, ...style }} />;
}

/* Độ dài ô thay đổi theo dòng để khung trông như dữ liệu thật */
const WIDTHS = ["72%", "54%", "64%", "46%", "58%"];

/* Các dòng chờ đặt trong <tbody>; cột đầu có avatar khi bảng bắt đầu bằng người/doanh nghiệp */
export function SkeletonRows({ cols, rows = 6, person }: { cols: number; rows?: number; person?: boolean }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}>
              {c === 0 && person
                ? <span className="person"><Skeleton round w={34} h={34} /><span className="person-copy"><Skeleton w={120 + ((r * 37) % 60)} /><Skeleton w={80} h={9} style={{ marginTop: 6 }} /></span></span>
                : <Skeleton w={WIDTHS[(r + c) % WIDTHS.length]} style={{ maxWidth: 160 }} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* Khối chữ chờ cho thẻ/drawer chưa có dữ liệu */
const LINE_WIDTHS = ["92%", "80%", "86%", "70%"];
export function SkeletonLines({ lines = 4, avatar, style }: { lines?: number; avatar?: boolean; style?: CSSProperties }) {
  return (
    <div className="skeleton-lines" role="status" aria-label="Đang tải" style={style}>
      {avatar ? <span className="person" style={{ marginBottom: 6 }}><Skeleton round w={54} h={54} /><span className="person-copy"><Skeleton w={180} h={14} /><Skeleton w={120} h={10} style={{ marginTop: 8 }} /></span></span> : null}
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} w={i === lines - 1 ? "48%" : LINE_WIDTHS[i % LINE_WIDTHS.length]} />)}
    </div>
  );
}
