"use client";
/* Bản đồ chọn vị trí chấm công (docs/plans/web-ui-polish.md bước 5): Leaflet, ghim kéo thả hoặc bấm lên bản đồ để đặt, vòng tròn vẽ theo
   bán kính đang nhập, ô tìm địa chỉ. DNS của nhà mạng Việt Nam (VNPT, đo 29/10) chặn openstreetmap.org (cả tile lẫn Nominatim) và CARTO
   đã bắt buộc API key, nên bản dev dùng máy chủ tile cộng đồng OSM Đức (tile.openstreetmap.de, chỉ hợp dùng nhẹ) và tìm địa chỉ bằng
   Photon (komoot, dữ liệu OSM) — chỉ gửi khi bấm "Tìm". Nhà cung cấp cho production chưa chọn: đổi qua NEXT_PUBLIC_MAP_TILE_URL/_ATTRIBUTION.
   Tải phía client bằng next/dynamic (Leaflet cần window). */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./kit";

type Point = { lat: number; lng: number };
type Hit = { lat: number; lng: number; label: string };
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

/* Chưa có tọa độ thì mở ở trung tâm TP.HCM — chỉ là khung nhìn ban đầu, không lưu */
const START: Point = { lat: 10.7769, lng: 106.7009 };
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://tile.openstreetmap.de/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION
  ?? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
/* Khung Việt Nam (kinh độ/vĩ độ tây-nam-đông-bắc) để kết quả tìm ưu tiên trong nước */
const VN_BBOX = "102.1,8.2,109.5,23.4";
const PIN = L.divIcon({ className: "map-pin", html: "<span></span>", iconSize: [28, 38], iconAnchor: [14, 36] });

export default function LocationMap({ value, radius, onPick }: { value: Point | null; radius: number; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!box.current || map.current) return;
    const at = value ?? START;
    const m = L.map(box.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([at.lat, at.lng], value ? 17 : 12);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(m);
    m.attributionControl.setPrefix(false);
    const mk = L.marker([at.lat, at.lng], { draggable: true, icon: PIN, opacity: value ? 1 : 0 }).addTo(m);
    const accent = getComputedStyle(box.current).getPropertyValue("--accent").trim() || "green";
    const c = L.circle([at.lat, at.lng], { radius, color: accent, fillColor: accent, weight: 2, fillOpacity: 0.12, opacity: value ? 1 : 0 }).addTo(m);
    const move = (p: L.LatLng) => pick.current({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) });
    mk.on("drag", () => c.setLatLng(mk.getLatLng()));
    mk.on("dragend", () => move(mk.getLatLng()));
    m.on("click", (e: L.LeafletMouseEvent) => move(e.latlng));
    /* Trong modal: con lăn chuột cuộn form, chỉ phóng/thu bản đồ sau khi bấm vào bản đồ */
    m.on("focus click", () => m.scrollWheelZoom.enable());
    m.on("blur mouseout", () => m.scrollWheelZoom.disable());
    map.current = m; marker.current = mk; circle.current = c;
    // Modal vừa mở: kích thước khung chưa ổn định lúc Leaflet đo
    const t = setTimeout(() => m.invalidateSize(), 120);
    return () => { clearTimeout(t); m.remove(); map.current = null; };
  }, []);

  /* Tọa độ đổi từ ô nhập, nút vị trí hiện tại, kết quả tìm hoặc kéo ghim → dời ghim + vòng, giữ ghim trong khung nhìn */
  useEffect(() => {
    const m = map.current, mk = marker.current, c = circle.current;
    if (!m || !mk || !c || !value) return;
    const ll = L.latLng(value.lat, value.lng);
    mk.setLatLng(ll).setOpacity(1);
    c.setLatLng(ll).setStyle({ opacity: 1, fillOpacity: 0.12 });
    if (!m.getBounds().pad(-0.1).contains(ll)) m.setView(ll, Math.max(m.getZoom(), 16));
  }, [value?.lat, value?.lng]);

  useEffect(() => { if (radius > 0) circle.current?.setRadius(radius); }, [radius]);

  async function search() {
    const text = q.trim();
    if (text.length < 3) { setErr("Nhập ít nhất 3 ký tự địa chỉ."); return; }
    setSearching(true); setErr(null); setHits(null);
    try {
      const r = await fetch(`https://photon.komoot.io/api/?limit=5&lang=default&bbox=${VN_BBOX}&q=${encodeURIComponent(text)}`);
      if (!r.ok) throw new Error(String(r.status));
      const list = ((await r.json()) as { features: PhotonFeature[] }).features.map((f): Hit => {
        const p = f.properties;
        const street = [p.housenumber, p.street].filter(Boolean).join(" ");
        const label = [p.name, street, p.locality, p.district, p.city ?? p.county, p.state].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
        return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label };
      });
      setHits(list);
      if (!list.length) setErr("Không tìm thấy địa chỉ. Thử ghi rõ số nhà, đường, quận/huyện.");
    } catch {
      setErr("Chưa tìm được địa chỉ (mạng hoặc dịch vụ bản đồ bận). Có thể kéo ghim hoặc nhập tọa độ.");
    } finally {
      setSearching(false);
    }
  }

  function choose(h: Hit) {
    const p = { lat: Number(h.lat.toFixed(6)), lng: Number(h.lng.toFixed(6)) };
    setHits(null);
    map.current?.setView([p.lat, p.lng], 17);
    onPick(p);
  }

  return (
    <div className="location-map">
      <div className="location-map-search">
        <label className="search"><Icon name="search" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setErr(null); }} placeholder="Tìm địa chỉ, ví dụ: 12 Nguyễn Huệ, Quận 1"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(); } }} /></label>
        <button type="button" className="btn small" onClick={() => void search()} disabled={searching}>{searching ? "Đang tìm…" : "Tìm"}</button>
      </div>
      {hits && hits.length ? (
        <div className="location-map-hits">{hits.map((h, i) => <button type="button" key={i} onClick={() => choose(h)}><Icon name="pin" size={14} /><span>{h.label}</span></button>)}</div>
      ) : null}
      <div ref={box} className="location-map-canvas" />
      <small className="muted">{err ?? (value ? "Kéo ghim hoặc bấm lên bản đồ để chỉnh vị trí; vòng tròn là bán kính chấm công." : "Bấm lên bản đồ hoặc tìm địa chỉ để đặt ghim.")}</small>
    </div>
  );
}
