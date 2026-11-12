"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shanghai-radar-favorites";
// window 级事件：跨 bundle chunk 同步（模块级变量会因代码分割产生多实例）
const FAV_CHANGED_EVENT = "shanghai-radar-favorites-changed";

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
 * localStorage 收藏：以 dedupe_key 为标识。
 * SSR 首帧返回空集（避免水合不一致），挂载后读取；
 * 通过 window 事件保证同页所有卡片与收藏区状态同步。
 */
export function useFavorites() {
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
