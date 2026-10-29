"use client";
/* Bản đồ chọn vị trí chấm công bằng Google Maps (dùng khi có NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; không có thì location-map.tsx dùng Leaflet).
   Cùng hành vi với bản Leaflet: ghim kéo thả hoặc bấm lên bản đồ để đặt, vòng tròn theo bán kính, tìm địa chỉ bằng Geocoding khi bấm "Tìm".
   Chi phí: chỉ tải bản đồ khi HR mở form địa điểm và chỉ gọi Geocoding khi bấm Tìm — nằm trong hạn mức miễn phí hằng tháng của Google.
   Key phải giới hạn theo HTTP referrer (localhost:3000, tên miền web HR) và chỉ bật Maps JavaScript API + Geocoding API. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./kit";

type Point = { lat: number; lng: number };
type Hit = { lat: number; lng: number; label: string };
/* SDK Google nạp động, không thêm gói @types/google.maps */
type G = any;

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
/* Map ID bắt buộc cho ghim AdvancedMarker; "DEMO_MAP_ID" của Google dùng được khi chưa tạo Map ID riêng */
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";
const START: Point = { lat: 10.7769, lng: 106.7009 };
const r6 = (n: number) => Number(n.toFixed(6));

let loading: Promise<G> | null = null;
function loadGoogle(): Promise<G> {
  const w = window as unknown as { google?: G; __kavorGmReady?: () => void };
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  loading ??= new Promise((ok, bad) => {
    w.__kavorGmReady = () => ok(w.google);
    const s = document.createElement("script");
    /* language/region=VN: tên đường tiếng Việt, ranh giới theo hiển thị tại Việt Nam */
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY)}&v=weekly&libraries=marker,geocoding&language=vi&region=VN&loading=async&callback=__kavorGmReady`;
    s.async = true;
    s.onerror = () => { loading = null; bad(new Error("load")); };
    document.head.appendChild(s);
  });
  return loading;
}

export default function GoogleLocationMap({ value, radius, onPick }: { value: Point | null; radius: number; onPick: (p: Point) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const g = useRef<{ google: G; map: G; marker: G; circle: G } | null>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    loadGoogle().then((google) => {
      if (dead || !box.current) return;
      const at = value ?? START;
      const accent = getComputedStyle(box.current).getPropertyValue("--accent").trim() || "#10b981";
      const map = new google.maps.Map(box.current, { center: at, zoom: value ? 17 : 12, mapId: MAP_ID, streetViewControl: false, mapTypeControl: false, fullscreenControl: false, gestureHandling: "cooperative", clickableIcons: false });
      const marker = new google.maps.marker.AdvancedMarkerElement({ map: value ? map : null, position: at, gmpDraggable: true, title: "Vị trí chấm công" });
      const circle = new google.maps.Circle({ map: value ? map : null, center: at, radius, strokeColor: accent, strokeWeight: 2, fillColor: accent, fillOpacity: 0.12, clickable: false });
      const move = (ll: G) => pick.current({ lat: r6(ll.lat()), lng: r6(ll.lng()) });
      marker.addListener("drag", () => circle.setCenter(marker.position));
      marker.addListener("dragend", () => { const p = marker.position; move(new google.maps.LatLng(p.lat, p.lng)); });
      map.addListener("click", (e: G) => move(e.latLng));
      g.current = { google, map, marker, circle };
    }).catch(() => setErr("Không tải được Google Maps (kiểm tra API key và giới hạn referrer). Vẫn nhập được vĩ độ/kinh độ."));
    return () => { dead = true; };
    /* bản đồ tạo một lần; vị trí/bán kính đồng bộ ở hai effect dưới */
  }, []);

  useEffect(() => {
    const x = g.current;
    if (!x || !value) return;
    x.marker.position = value; x.marker.map = x.map;
    x.circle.setCenter(value); x.circle.setMap(x.map);
    if (!x.map.getBounds()?.contains(value)) { x.map.panTo(value); if (x.map.getZoom() < 16) x.map.setZoom(16); }
  }, [value?.lat, value?.lng]);

  useEffect(() => { if (radius > 0) g.current?.circle.setRadius(radius); }, [radius]);

  async function search() {
    const text = q.trim();
    if (text.length < 3) { setErr("Nhập ít nhất 3 ký tự địa chỉ."); return; }
    const x = g.current;
    if (!x) return;
    setSearching(true); setErr(null); setHits(null);
    try {
      const { results } = await new x.google.maps.Geocoder().geocode({ address: text, region: "VN", componentRestrictions: { country: "VN" } });
      const list: Hit[] = (results as G[]).slice(0, 5).map((r) => ({ lat: r.geometry.location.lat(), lng: r.geometry.location.lng(), label: r.formatted_address }));
      setHits(list);
      if (!list.length) setErr("Không tìm thấy địa chỉ. Thử ghi rõ số nhà, đường, quận/huyện.");
    } catch {
      setErr("Không tìm thấy địa chỉ. Thử ghi rõ số nhà, đường, quận/huyện.");
    } finally {
      setSearching(false);
    }
  }

  function choose(h: Hit) {
    const p = { lat: r6(h.lat), lng: r6(h.lng) };
    setHits(null);
    g.current?.map.setCenter(p); g.current?.map.setZoom(17);
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
