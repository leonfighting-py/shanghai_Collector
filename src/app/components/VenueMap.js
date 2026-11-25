"use client";

import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";

// 高德栅格瓦片（style=8 是路网注记图）。坐标系 **GCJ-02**，
// 与 venue-coordinates.js 里的坐标一致，不要纠偏 —— 纠了会整体偏到空白处。
const TILE_URL =
  "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";

const SHANGHAI_CENTER = [31.2304, 121.4737];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

/**
 * 场馆地图：同场馆的活动合成一个点，点上标条数。
 *
 * Leaflet 在 useEffect 里动态 import：它只在地图视图被选中时才下载，
 * 首屏（区域图 / 日程表）不带这份依赖。
 */
export function VenueMap({ points = [], focus = null, zoom = 12, onSelect = null }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          center: SHANGHAI_CENTER,
          zoom: 11,
          // 页面本身要纵向滚动，鼠标滚轮默认不抢
          scrollWheelZoom: false,
        });
        L.tileLayer(TILE_URL, {
          subdomains: "1234",
          maxZoom: 18,
          attribution: "© 高德地图",
        }).addTo(mapRef.current);
      }

      const map = mapRef.current;
      markersRef.current = new Map();
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      const layer = L.layerGroup().addTo(map);
      layerRef.current = layer;

      // 用圆的**面积**表达场次，而不是在点上写数字：
      // 侧栏只有 300px 宽，几十个数字气泡会糊成一团；面积是能一眼比较的量。
      // 半径按 sqrt 映射（面积与场次成正比），最小 7px 保证 1 场也点得到。
      for (const point of points) {
        // 半径 ∝ sqrt(场次)：加常数项会压缩大小差异，13 场与 7 场会看着一样大
        const radius = Math.max(6, Math.min(30, Math.sqrt(point.count) * 6));
        const dot = L.circleMarker([point.lat, point.lng], {
          radius,
          className: "venue-dot",
          weight: 1.2,
        });
        if (onSelect) {
          dot.on("click", () => onSelect(point));
        } else {
          const lines = point.titles.slice(0, 3).map((title) => `· ${escapeHtml(title)}`).join("<br />");
          dot.bindPopup(
            `<strong>${escapeHtml(point.name)}</strong><br />${point.count} 场${lines ? `<br />${lines}` : ""}`,
            { maxWidth: 220 },
          );
        }
        dot.bindTooltip(`${escapeHtml(point.name)} · ${point.count} 场`, { direction: "top", offset: [0, -2] });
        markersRef.current.set(point.name, dot);
        layer.addLayer(dot);
      }

      // 不用 fitBounds：临港的天文馆、航海博物馆会把视野拉到整个市域，
      // 市中心几十个点挤成一团黑块。固定在人广 zoom 11，想看远郊自己拖。
      if (!map._centered) {
        map.setView(SHANGHAI_CENTER, zoom);
        map._centered = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [points]);

  // 外部选中某个场馆时定位过去。tick 让「再次点同一个」也能触发。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus?.name) return;
    const marker = markersRef.current.get(focus.name);
    if (!marker) return;
    map.setView([focus.lat, focus.lng], Math.max(map.getZoom(), 14), { animate: true });
    marker.openPopup?.();
  }, [focus]);

  // 组件卸载时销毁地图实例，否则切换视图会留下监听与瓦片请求
  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return <div className="venue-map" ref={containerRef} role="region" aria-label="场馆地图" />;
}
