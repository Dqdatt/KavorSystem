"use client";
import { useState } from "react";
import { ErrorLine, Field, Modal, useAction } from "./kit";

/* Xác nhận thao tác cần lý do (khóa tài khoản, từ chối/thu hồi thiết bị, kết thúc áp dụng…) */
export function ReasonModal({ title, label, danger, go, ok, onClose, onDone }: { title: string; label: string; danger?: boolean; go: (reason: string) => Promise<unknown>; ok: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const { busy, run } = useAction();
  return (
    <Modal title={title} onClose={onClose} foot={<><button className="btn" onClick={onClose}>Hủy</button>
      <button className={`btn ${danger ? "danger" : "primary"}`} disabled={!!busy} onClick={async () => {
        if (reason.trim().length < 5) { setErr("Ghi lý do ít nhất 5 ký tự."); return; }
        if (await run("go", () => go(reason.trim()), ok)) { onClose(); onDone(); }
      }}>{busy ? "Đang xử lý…" : "Xác nhận"}</button></>}>
      <Field label={label} full><textarea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setErr(null); }} autoFocus /></Field>
      <ErrorLine text={err} />
    </Modal>
  );
}

