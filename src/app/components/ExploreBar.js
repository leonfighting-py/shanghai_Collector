"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CATEGORIES, toShanghaiDate } from "../../lib/events.js";

/**
 * 玻璃质感探索条：搜索 + 分类 + 起始日。
 * 纯表单 GET 提交（无 JS 也可用）；有 JS 时搜索防抖即时应用、清空自动恢复。
 */
export function ExploreBar({ initialSearch = "", initialCategory = "", initialWeek = "" }) {
  const [search, setSearch] = useState(initialSearch);
  const [category, setCategory] = useState(initialCategory);
  const [week, setWeek] = useState(initialWeek);
  const debounceRef = useRef(null);

  // 防抖：搜索词变化后 600ms 自动提交（仅在有 JS 时）
  useEffect(() => {
    if (search === initialSearch) return undefined;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyNavigation({ search, category, week });
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyNavigation = useCallback((next) => {
    const params = new URLSearchParams();
    if (next.search?.trim()) params.set("search", next.search.trim());
    if (next.category) params.set("category", next.category);
    if (next.week) params.set("week", next.week);
    const query = params.toString();
    window.location.href = query ? `/?${query}` : "/";
  }, []);

  const onCategory = useCallback(
    (value) => {
      const next = value === category ? "" : value;
      setCategory(next);
      applyNavigation({ search, category: next, week });
    },
    [category, search, week, applyNavigation],
  );

  const onWeek = useCallback(
    (event) => {
      setWeek(event.target.value);
      applyNavigation({ search, category, week: event.target.value });
    },
    [category, search, applyNavigation],
  );

  const hasFilters = Boolean(search.trim() || category || week);

  return (
    <form
      className="explore-bar liquid-glass"
      onSubmit={(event) => {
        event.preventDefault();
        applyNavigation({ search, category, week });
      }}
      role="search"
    >
      {/* 搜索输入 */}
      <label className="explore-search">
        <svg className="explore-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          name="search"
          value={search}
          placeholder="搜索活动、场馆、关键词…"
          onChange={(event) => setSearch(event.target.value)}
          aria-label="搜索活动"
          maxLength={100}
        />
      </label>

      {/* 分类 chips */}
      <div className="explore-categories" role="group" aria-label="分类筛选">
        {CATEGORIES.map((name) => (
          <button
            key={name}
            type="button"
            className={`explore-chip ${category === name ? "is-active" : ""}`}
            aria-pressed={category === name}
            onClick={() => onCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* 起始日 + 清除 */}
      <div className="explore-controls">
        <label className="explore-week">
          <span>起</span>
          <input
            type="date"
            name="week"
            value={week || toShanghaiDate(new Date())}
            min="2024-01-01"
            onChange={onWeek}
            aria-label="起始日期"
          />
        </label>
        {hasFilters ? (
          <button
            type="button"
            className="explore-clear"
            onClick={() => {
              setSearch("");
              setCategory("");
              setWeek("");
              window.location.href = "/";
            }}
          >
            清除筛选
          </button>
        ) : null}
      </div>

      {/* 无 JS 兜底提交按钮 */}
      <noscript>
        <button type="submit" className="explore-clear">搜索</button>
      </noscript>
    </form>
  );
}
