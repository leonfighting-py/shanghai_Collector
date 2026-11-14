"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shanghai-radar-favorites";
// window 级事件：跨 bundle chunk 同步（模块级变量会因代码分割产生多实例）
const FAV_CHANGED_EVENT = "shanghai-radar-favorites-changed";

// 新格式：10 位 base32（撞号时带 -2 后缀）。旧格式是 dedupe_key「标题|日期|场馆」。
const SLUG_RE = /^[0-9a-z]{10}(-\d+)?$/;

function readFavorites() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeFavorites(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(FAV_CHANGED_EVENT, { detail: list }));
  } catch {
    // 隐私模式等场景静默失败
  }
}

/**
 * localStorage 收藏：以 slug 为标识（见 src/lib/event-slug.js）。
 * SSR 首帧返回空集（避免水合不一致），挂载后读取；
 * 通过 window 事件保证同页所有卡片与收藏区状态同步。
 *
 * events 只用于旧收藏迁移：老版本存的是 dedupe_key，标题被富化改写后会失配。
 */
export function useFavorites({ events = [] } = {}) {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const sync = (list) => setFavorites(Array.isArray(list) ? list : readFavorites());
    sync(readFavorites());

    const onCustom = (event) => sync(event.detail);
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) sync(readFavorites());
    };
    window.addEventListener(FAV_CHANGED_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FAV_CHANGED_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // 旧收藏（dedupe_key）按当前列表匹配一次换成 slug。匹配不上的原样留着 ——
  // 活动可能只是掉出了当前两周窗口，回来时还能认。
  useEffect(() => {
    if (events.length === 0) return;
    const current = readFavorites();
    if (current.length === 0) return;

    const slugByDedupeKey = new Map();
    for (const event of events) {
      if (event.dedupe_key && event.slug) slugByDedupeKey.set(event.dedupe_key, event.slug);
    }

    let migrated = false;
    const next = current.map((key) => {
      if (SLUG_RE.test(key)) return key;
      const slug = slugByDedupeKey.get(key);
      if (!slug) return key;
      migrated = true;
      return slug;
    });

    if (migrated) writeFavorites([...new Set(next)]);
  }, [events]);

  const isFavorite = useCallback(
    (key) => favorites.includes(key),
    [favorites],
  );

  const toggleFavorite = useCallback((key) => {
    const current = readFavorites();
    const next = current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key];
    writeFavorites(next);
  }, []);

  return { favorites, isFavorite, toggleFavorite };
}
