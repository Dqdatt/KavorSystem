"use client";
/* Số tài khoản ngân hàng: chủ hồ sơ thấy đủ; HR/Kế toán có quyền thấy "•••• 4 số" + nút mắt, mở ngăn kéo bấm "Hiện số" mới gọi API
   (mỗi lần gọi ghi nhật ký). Số đầy đủ chỉ nằm trong state của ngăn kéo: đóng là mất. */
import { useState } from "react";
import type { BankAccountReveal, BankAccountView } from "@kavor/contracts";
import { call } from "../_lib/client";
import { Drawer, ErrorLine, Icon, Person } from "./kit";

export function BankAccountNo({ bank, revealPath, person }: { bank: BankAccountView; revealPath: string; person: { name: string; code: string } }) {
  const [open, setOpen] = useState(false);
  if (bank.accountNo) return <>{bank.accountNo}</>;
  return (
    <span className="row sub" style={{ display: "inline-flex", whiteSpace: "nowrap", verticalAlign: "middle" }}>•••• {bank.last4}
      {bank.revealable ? <button type="button" className="iconbtn bare" style={{ width: 26, height: 26 }} aria-label="Xem số tài khoản" onClick={() => setOpen(true)}><Icon name="eye" size={15} /></button> : null}
      {open ? <RevealDrawer bank={bank} revealPath={revealPath} person={person} onClose={() => setOpen(false)} /> : null}
    </span>
  );
}

/* "Ngân hàng | số | chủ TK" theo cụm như vs(): ô hẹp chỉ xuống dòng giữa các cụm */
export function BankLine({ bank, revealPath, person }: { bank: BankAccountView; revealPath: string; person: { name: string; code: string } }) {
  return <><span className="seg">{bank.bankName}<i className="vs" /></span> <span className="seg"><BankAccountNo bank={bank} revealPath={revealPath} person={person} /><i className="vs" /></span> <span className="seg">{bank.holder}</span></>;
}

function RevealDrawer({ bank, revealPath, person, onClose }: { bank: BankAccountView; revealPath: string; person: { name: string; code: string }; onClose: () => void }) {
  const [no, setNo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reveal = async () => {
    setBusy(true); setErr(null);
    try { setNo((await call<BankAccountReveal>("POST", revealPath, {})).accountNo); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Drawer onClose={onClose} head={<div><b>Xem số tài khoản</b><div className="muted">Lượt xem dữ liệu nhạy cảm được ghi vào nhật ký hệ thống.</div></div>}
      foot={no ? <button className="btn primary" onClick={onClose}>Đóng</button> : <><button className="btn ghost" onClick={onClose}>Hủy</button><button className="btn primary" disabled={busy} onClick={reveal}><Icon name="eye" />Hiện số</button></>}>
      {no ? <Person name={person.name} seed={person.code} sub={`${bank.bankName} ${no} | ${bank.holder}`} />
        : <><div className="note info"><Icon name="lock" /><span>Số tài khoản đang được ẩn. Bấm &quot;Hiện số&quot; để xem, hành động này ghi vào nhật ký với tên bạn.</span></div><ErrorLine text={err} /></>}
    </Drawer>
  );
}
