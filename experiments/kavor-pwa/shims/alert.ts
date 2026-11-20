/* Hộp thoại kiểu iOS (UIAlertController) cho Alert.alert trên web. Dựng bằng DOM để dùng được cả ngoài cây React. */
type Btn = { text?: string; style?: "default" | "cancel" | "destructive"; onPress?: () => void };
type Opts = { cancelable?: boolean; onDismiss?: () => void };

const CSS = `
.kv-alert-bg{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.28);opacity:0;transition:opacity .2s ease;-webkit-tap-highlight-color:transparent}
.kv-alert-bg.on{opacity:1}
.kv-alert{width:270px;border-radius:14px;overflow:hidden;background:rgba(242,242,242,.86);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#000;transform:scale(1.12);transition:transform .25s cubic-bezier(.2,.9,.3,1.2)}
.kv-alert-bg.on .kv-alert{transform:scale(1)}
.kv-alert-body{padding:19px 16px 18px;text-align:center}
.kv-alert-t{font-size:17px;font-weight:600;line-height:22px}
.kv-alert-m{font-size:13px;line-height:17px;margin-top:3px}
.kv-alert-btns{display:flex;flex-direction:column;border-top:.5px solid rgba(60,60,67,.29)}
.kv-alert-btns.row{flex-direction:row}
.kv-alert-btns button{flex:1;min-height:44px;border:0;background:transparent;font:inherit;font-size:17px;color:#007AFF;cursor:pointer;padding:0 8px}
.kv-alert-btns button+button{border-top:.5px solid rgba(60,60,67,.29)}
.kv-alert-btns.row button+button{border-top:0;border-left:.5px solid rgba(60,60,67,.29)}
.kv-alert-btns button:active{background:rgba(0,0,0,.08)}
.kv-alert-btns button.cancel{font-weight:600}
.kv-alert-btns button.destructive{color:#FF3B30}
`;

let styled = false;
function ensureStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement("style");
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function webAlert(title: string, message?: string, buttons?: Btn[], options?: Opts) {
  if (typeof document === "undefined") return;
  ensureStyle();
  const list: Btn[] = buttons?.length ? buttons : [{ text: "OK" }];
  /* iOS: nút Hủy nằm cuối khi xếp dọc, bên trái khi xếp ngang */
  const row = list.length === 2;
  const ordered = row ? [...list].sort((a, b) => (a.style === "cancel" ? -1 : b.style === "cancel" ? 1 : 0)) : [...list].sort((a, b) => (a.style === "cancel" ? 1 : b.style === "cancel" ? -1 : 0));

  const bg = document.createElement("div");
  bg.className = "kv-alert-bg";
  bg.setAttribute("role", "alertdialog");
  const box = document.createElement("div");
  box.className = "kv-alert";
  const body = document.createElement("div");
  body.className = "kv-alert-body";
  const t = document.createElement("div");
  t.className = "kv-alert-t";
  t.textContent = title;
  body.appendChild(t);
  if (message) {
    const m = document.createElement("div");
    m.className = "kv-alert-m";
    m.textContent = message;
    body.appendChild(m);
  }
  const btns = document.createElement("div");
  btns.className = `kv-alert-btns${row ? " row" : ""}`;
  let done = false;
  const close = (after?: () => void) => {
    if (done) return;
    done = true;
    bg.classList.remove("on");
    setTimeout(() => bg.remove(), 200);
    after?.();
  };
  for (const b of ordered) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = b.text ?? "OK";
    if (b.style) el.className = b.style;
    el.onclick = (e) => { e.stopPropagation(); close(b.onPress); };
    btns.appendChild(el);
  }
  box.appendChild(body);
  box.appendChild(btns);
  box.onclick = (e) => e.stopPropagation();
  bg.appendChild(box);
  bg.onclick = () => { if (options?.cancelable) close(options.onDismiss); };
  document.body.appendChild(bg);
  requestAnimationFrame(() => bg.classList.add("on"));
}
