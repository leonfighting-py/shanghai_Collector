"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "shanghai-radar-favorites";

// 模块级：同页所有 hook 实例共享的订阅总线，保证卡片间星标状态同步
const listeners = new Set();

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
    listeners.forEach((notify) => notify(list));
  } catch {
    // 隐私模式等场景静默失败
  }
}

/**
 * localStorage 收藏：以 dedupe_key 为标识。
 * SSR 首帧返回空集（避免水合不一致），挂载后读取。
 */
export function useFavorites() {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    setFavorites(readFavorites());
    listeners.add(setFavorites);
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setFavorites(readFavorites());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(setFavorites);
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
