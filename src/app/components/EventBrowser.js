"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildAgenda,
  daysBetween,
  eventEndDay,
  formatDotDate,
  formatRange,
  formatShanghaiClock,
  isMultiDay,
  splitByToday,
} from "../../lib/agenda.js";
import { CATEGORIES, safeExternalUrl } from "../../lib/events.js";
import { districtOptions, matchesClassification, subcategoryOptions } from "../../lib/event-classify.js";
import { buildListParam } from "../../lib/favorite-list.js";
import { matchesScene } from "../../lib/scenes.js";
import { VenueMap } from "./VenueMap.js";
import { EventImage } from "./EventImage.js";
import { useFavorites } from "./useFavorites.js";

/** 每天默认展开的「当天开始 / 结束」行数，其余折叠到「展开当日其余」 */
const DAY_ROW_LIMIT = 5;
const RAIL_LIMIT = 14;

/**
 * 首页主体：「正在进行」海报栏 + 吸顶筛选条 + 按天分组的日程表。
 * 服务端一次给足整个两周窗口，类目 / 二级分类 / 区域 / 搜索 / 只看收藏都在这里本地筛，切换零延迟。
 *
 * 二级分类与区域是服务端派生的字段（`src/lib/event-classify.js`，不落库），
 * 数据随首屏 payload 一起下来，所以补筛选 UI 不需要改后端、也不需要重新采集。
 */
export function EventBrowser({
  events,
  today,
  days,
  initialCategory = "",
  initialSubcategory = "",
  initialDistrict = "",
  initialSearch = "",
  sharedList = [],
  scenes = [],
  initialScene = "",
  sceneNow = "",
}) {
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);
  const [district, setDistrict] = useState(initialDistrict);
  const [search, setSearch] = useState(initialSearch);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  // 场景卡（今晚 / 周末 / 免费 / 雨天室内 / 带娃）：与类目、区域是 AND 关系
  const [scene, setScene] = useState(initialScene);
  // 「按区看」：把 16 区示意图摊在日程表上方，点区块等于选中该区
  const [showMap, setShowMap] = useState(false);
  // 全屏地图：侧栏 300px 装不下几十个点位，放大才看得清
  const [mapExpanded, setMapExpanded] = useState(false);
  // 点排行里的场馆 → 地图定位到它
  const [mapFocus, setMapFocus] = useState(null);
  // 朋友分享的清单（?list=slug.slug）只在本次访问显示，关掉就不再拦路
  const [sharedDismissed, setSharedDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  // 「展开当日其余」的展开状态，以 "more:<date>" 为键
  const [expanded, setExpanded] = useState({});
  // 「展期中」完整清单在抽屉里看：几十条纯文字摊在页面里，展开后要往回滑很久才能收起
  const [drawerDate, setDrawerDate] = useState("");
  // 筛选面板（细分 + 区域）。复用抽屉那套视觉：桌面从右侧滑出、手机从底部升起
  const [filterOpen, setFilterOpen] = useState(false);
  const { favorites, isFavorite, toggleFavorite, addFavorites } = useFavorites({ events });
  // 日期条上高亮的那一天：跟着滚动位置走，而不是固定在今天
  const [activeDate, setActiveDate] = useState(today);
  const filtersRef = useRef(null);
  const daysRef = useRef(null);
  const copiedTimer = useRef(null);

  // 选项表来自与服务端同一份常量：二级挂在类目下（没选类目时该组为空），区域恒为 16 区
  const subs = useMemo(() => subcategoryOptions(category), [category]);
  const areas = useMemo(() => districtOptions(), []);
  // 角标只数「二级 + 区域」：一级类目在上面的 Tab 里已经自证选中，不重复计数
  const filterCount = (subcategory ? 1 : 0) + (district ? 1 : 0);

  // 收藏与分享清单都只认「当前窗口内」的活动：已结束的 slug 还在 localStorage 里，
  // 拿它拼链接会让朋友打开一片空白，导出日历也会少几条。
  const windowSlugs = useMemo(() => new Set(events.map((event) => event.slug)), [events]);
  const liveFavorites = useMemo(() => favorites.filter((slug) => windowSlugs.has(slug)), [favorites, windowSlugs]);
  const sharedMatches = useMemo(() => sharedList.filter((slug) => windowSlugs.has(slug)), [sharedList, windowSlugs]);

  // 换一级类目后，原来的二级选择必然失效，一并清掉（与小程序同一语义）
  const selectCategory = (name) => {
    if (name === category) return;
    setCategory(name);
    setSubcategory("");
  };

  const resetFilter = () => {
    setSubcategory("");
    setDistrict("");
  };

  // 把筛选状态写回地址栏，方便分享；不走路由跳转，避免重新请求
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (category) params.set("category", category);
    else params.delete("category");
    if (subcategory) params.set("sub", subcategory);
    else params.delete("sub");
    if (district) params.set("area", district);
    else params.delete("area");
    if (search.trim()) params.set("search", search.trim());
    else params.delete("search");
    if (scene) params.set("scene", scene);
    else params.delete("scene");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [category, subcategory, district, search, scene]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const event of events) counts[event.category] = (counts[event.category] || 0) + 1;
    return counts;
  }, [events]);

  // 场景的判断基准时间由服务端给：客户端各自 new Date() 会和 SSR 结果对不上
  const sceneRef = useMemo(() => (sceneNow ? new Date(sceneNow) : new Date()), [sceneNow]);

  const matchesFilters = useCallback(
    (event, { ignoreDistrict = false } = {}) => {
      if (scene && !matchesScene(event, scene, sceneRef)) return false;
      // 一级类目 / 二级分类 / 区域：三者 AND，规则与小程序共用同一份谓词
      if (!matchesClassification(event, { category, subcategory, district: ignoreDistrict ? "" : district })) {
        return false;
      }
      if (onlyFavorites && !favorites.includes(event.slug)) return false;
      const keyword = search.trim().toLowerCase();
      if (!keyword) return true;
      return [event.title, event.venue, event.summary, event.source_name].some((text) =>
        String(text || "").toLowerCase().includes(keyword),
      );
    },
    [scene, sceneRef, category, subcategory, district, onlyFavorites, favorites, search],
  );

  const filtered = useMemo(
    () => events.filter((event) => matchesFilters(event)),
    [events, matchesFilters],
  );

  // 区域计数忽略区域筛选本身：否则选中黄浦后，图上只剩黄浦有数字，其余全变 0
  // 地图点位：同场馆合成一个点；只算当前筛选结果，地图会跟着筛选变
  const venuePoints = useMemo(() => {
    const byVenue = new Map();
    for (const event of filtered) {
      if (!event.venueKey || !event.coord) continue;
      const [lng, lat] = event.coord;
      if (!byVenue.has(event.venueKey)) {
        byVenue.set(event.venueKey, { name: event.venueKey, lng, lat, count: 0, titles: [] });
      }
      const point = byVenue.get(event.venueKey);
      point.count += 1;
      if (point.titles.length < 5) point.titles.push(event.title);
    }
    return [...byVenue.values()].sort((left, right) => right.count - left.count);
  }, [filtered]);

  const ongoing = useMemo(() => splitByToday(filtered, today).ongoing, [filtered, today]);
  const agenda = useMemo(() => buildAgenda(filtered, { today, days }), [filtered, today, days]);
  const visibleDays = agenda.filter((day) => day.rows.length > 0);
  const firstVisibleDate = visibleDays[0]?.date || today;

  // 吸顶筛选条的实际高度写进 CSS 变量：大号日期的吸附位置、锚点偏移都依赖它
  useEffect(() => {
    const node = filtersRef.current;
    if (!node) return undefined;
    const sync = () => document.documentElement.style.setProperty("--filters-height", `${node.offsetHeight}px`);
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // 滚动时找出「已经滚到筛选条下面」的最后一天，作为当前日期
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (filtersRef.current?.offsetHeight || 0) + 80;
      let current = firstVisibleDate;
      for (const section of document.querySelectorAll("section.day[id]")) {
        if (section.getBoundingClientRect().top > line) break;
        current = section.id.replace("day-", "");
      }
      setActiveDate(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [firstVisibleDate, visibleDays.length, expanded]);

  // 窄屏下日期条能横向滚动：当前日期滚出可视范围时把它带回来
  useEffect(() => {
    const strip = daysRef.current;
    const chip = strip?.querySelector(".is-active");
    if (!strip || !chip) return;
    const left = chip.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) {
      strip.scrollTo({ left: left - strip.clientWidth / 2 + chip.offsetWidth / 2, behavior: "smooth" });
    }
  }, [activeDate]);

  const drawerDay = drawerDate ? agenda.find((day) => day.date === drawerDate) : null;
  // 两个面板互斥：同时开着会叠两层遮罩，Esc 该关谁也没法判断
  const modalOpen = Boolean(drawerDay) || filterOpen;

  // 面板打开时锁住页面滚动，Esc 关闭
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      setDrawerDate("");
      setFilterOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [modalOpen]);

  const openFilter = () => {
    setDrawerDate("");
    setFilterOpen(true);
  };

  const openDrawer = (date) => {
    setFilterOpen(false);
    setDrawerDate(date);
  };

  // 「链接已复制」两秒后回弹
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  const copyShareLink = async () => {
    const url = `${window.location.origin}/?list=${buildListParam(liveFavorites)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // 非 https 或没给剪贴板权限时退化成手动复制，不静默失败
      window.prompt("复制这个链接发给朋友：", url);
    }
  };

  /** 关掉分享横幅，同时把地址栏里的 list 参数去掉，免得刷新又弹 */
  const dismissShared = () => {
    setSharedDismissed(true);
    const params = new URLSearchParams(window.location.search);
    if (!params.has("list")) return;
    params.delete("list");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
  };

  const adoptShared = () => {
    addFavorites(sharedMatches);
    setOnlyFavorites(true);
    dismissShared();
  };

  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !current[key] }));

  return (
    <>
      {ongoing.length > 0 ? (
        <section aria-label="正在进行">
          <div className="sec-head">
            <h2>正在进行</h2>
            <span>开展中的展览与长档期演出 · {ongoing.length} 场</span>
          </div>
          <div className="rail">
            {ongoing.slice(0, RAIL_LIMIT).map((event) => (
              <a
                className="poster"
                key={event.slug}
                href={`/e/${event.slug}`}
              >
                <span className="cover" data-label={event.category}>
                  <EventImage url={event.image_url} width={400} />
                </span>
                <strong>{event.title}</strong>
                <small><em>至 {formatDotDate(eventEndDay(event))}</em> · {event.venue}</small>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <div className="filters" id="agenda" ref={filtersRef}>
        {scenes.length > 0 ? (
          <div className="scenes" role="group" aria-label="场景">
            {scenes.map((item) => (
              <button
                type="button"
                key={item.key}
                className="scene"
                aria-pressed={scene === item.key}
                onClick={() => setScene((current) => (current === item.key ? "" : item.key))}
              >
                {item.label}
                <sup>{item.count}</sup>
              </button>
            ))}
          </div>
        ) : null}
        <div className="filters-line">
          <div className="tabs" role="group" aria-label="分类筛选">
            <button type="button" className="tab" aria-pressed={!category} onClick={() => selectCategory("")}>
              全部<sup>{events.length}</sup>
            </button>
            {CATEGORIES.map((name) => (
              <button
                type="button"
                className="tab"
                key={name}
                aria-pressed={category === name}
                onClick={() => selectCategory(name)}
              >
                {name}<sup>{categoryCounts[name] || 0}</sup>
              </button>
            ))}
          </div>
          <div className="tools">
            <button
              type="button"
              className="view-toggle"
              aria-pressed={showMap}
              onClick={() => setShowMap((value) => !value)}
            >
              {showMap ? "收起地图" : "地图"}
            </button>
            <button
              type="button"
              className="filter-toggle"
              aria-haspopup="dialog"
              aria-expanded={filterOpen}
              aria-pressed={filterCount > 0}
              onClick={openFilter}
            >
              筛选{filterCount > 0 ? <span>{filterCount}</span> : null}
            </button>
            <label className="search">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={search}
                placeholder="搜索活动 / 场馆"
                aria-label="搜索活动"
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="fav-toggle"
              aria-pressed={onlyFavorites}
              onClick={() => setOnlyFavorites((value) => !value)}
            >
              <b aria-hidden="true">{onlyFavorites ? "★" : "☆"}</b>
              我的收藏
              <span>{favorites.length}</span>
            </button>
          </div>
        </div>
        <nav className="days" aria-label="按日期跳转" ref={daysRef}>
          {agenda.map((day) => {
            const empty = day.rows.length === 0;
            return (
              <a
                key={day.date}
                href={empty ? undefined : `#day-${day.date}`}
                aria-current={day.date === activeDate ? "true" : undefined}
                className={`day-chip${day.date === activeDate ? " is-active" : ""}${day.isToday ? " is-today" : ""}${day.isWeekend ? " is-weekend" : ""}${empty ? " is-empty" : ""}`}
              >
                <small>{day.weekday}</small>
                <b>{day.day}</b>
              </a>
            );
          })}
        </nav>
      </div>

      <div className={`browser-body${showMap ? " has-aside" : ""}`}>
        <div className="browser-main">
      {sharedList.length > 0 && !sharedDismissed ? (
        <div className="shared-banner" role="status">
          <p>
            朋友分享了 <b>{sharedList.length}</b> 场活动
            {sharedMatches.length === 0
              ? "，但都已经不在最近两周了"
              : sharedMatches.length < sharedList.length
                ? `，其中 ${sharedMatches.length} 场还在最近两周`
                : ""}
          </p>
          <div className="banner-actions">
            <button type="button" className="chip-btn" onClick={adoptShared} disabled={sharedMatches.length === 0}>
              全部加入我的收藏
            </button>
            <a className="chip-btn" href={`/calendar.ics?slugs=${sharedList.join(",")}`}>
              导出到日历
            </a>
            <button type="button" className="chip-btn is-plain" onClick={dismissShared}>
              关闭
            </button>
          </div>
        </div>
      ) : null}

      {onlyFavorites ? (
        <div className="list-bar">
          <p>
            我的收藏 · {favorites.length} 场
            {liveFavorites.length < favorites.length
              ? `，其中 ${favorites.length - liveFavorites.length} 场不在最近两周`
              : ""}
          </p>
          <div className="banner-actions">
            <button
              type="button"
              className="chip-btn"
              onClick={copyShareLink}
              disabled={liveFavorites.length === 0}
            >
              {copied ? "链接已复制" : "复制分享链接"}
            </button>
            <a className="chip-btn" href={`/calendar.ics?slugs=${liveFavorites.join(",")}`}>
              导出到日历
            </a>
          </div>
        </div>
      ) : null}

      {visibleDays.length === 0 ? (
        <p className="empty">
          {onlyFavorites ? "还没有收藏的活动，点活动右侧的星标即可收藏。" : "没有匹配的活动，试试换个关键词、类目或筛选条件。"}
          {filterCount > 0 ? (
            <button type="button" className="empty-reset" onClick={resetFilter}>
              清除细分与区域筛选
            </button>
          ) : null}
        </p>
      ) : (
        visibleDays.map((day) => {
          const own = day.rows.filter((row) => row.kind !== "run");
          const featured = day.rows.filter((row) => row.kind === "run");
          const showAll = expanded[`more:${day.date}`];
          const shownOwn = showAll ? own : own.slice(0, DAY_ROW_LIMIT);

          return (
            <section className={`day${day.isToday ? " is-today" : ""}`} id={`day-${day.date}`} key={day.date}>
              <header className="day-side">
                <p className="day-num">{day.day}</p>
                <p className="day-week">{day.weekday}{day.isToday ? " · 今天" : ""}</p>
                <p className="day-meta">
                  {day.month} 月 · {day.startCount ? `${day.startCount} 场开始` : "无新开场"}
                  {day.endCount ? ` · ${day.endCount} 场收官` : ""}
                  {day.runningCount ? <span>{day.runningCount} 场展期中</span> : null}
                </p>
              </header>
              <div className="day-rows">
                {[...shownOwn, ...featured].map(({ event, kind }) => (
                  <AgendaRow
                    key={`${kind}-${event.slug}`}
                    event={event}
                    kind={kind}
                    date={day.date}
                    favorite={isFavorite(event.slug)}
                    onToggleFavorite={() => toggleFavorite(event.slug)}
                  />
                ))}
                {own.length > DAY_ROW_LIMIT ? (
                  <button type="button" className="fold" onClick={() => toggle(`more:${day.date}`)}>
                    <span>{showAll ? "收起" : `展开当日其余 ${own.length - DAY_ROW_LIMIT} 场`}</span>
                    <span aria-hidden="true">{showAll ? "↑" : "↓"}</span>
                  </button>
                ) : null}
                {day.folded.length > 0 ? (
                  <button type="button" className="fold" aria-haspopup="dialog" onClick={() => openDrawer(day.date)}>
                    <span>展期中 · 另有 {day.folded.length} 场今天也能去</span>
                    <span aria-hidden="true">查看全部 →</span>
                  </button>
                ) : null}
              </div>
            </section>
          );
        })
      )}
        </div>

        {showMap ? (
          <aside className="browser-aside" aria-label="场馆地图">
            <div className="aside-head">
              <span>场馆分布</span>
              <button type="button" onClick={() => setMapExpanded(true)}>
                放大
              </button>
            </div>
            <VenueMap points={venuePoints} focus={mapFocus} />
            <ol className="venue-rank">
              {venuePoints.slice(0, 6).map((point) => (
                <li key={point.name}>
                  <button type="button" onClick={() => setMapFocus({ ...point, tick: Date.now() })}>
                    <span className="rank-name">{point.name}</span>
                    <span className="rank-bar" style={{ width: `${Math.round((point.count / venuePoints[0].count) * 100)}%` }} />
                    <span className="rank-count">{point.count}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="map-foot">
              {venuePoints.length} 个场馆 / {venuePoints.reduce((sum, point) => sum + point.count, 0)} 场；
              另有 {filtered.length - venuePoints.reduce((sum, point) => sum + point.count, 0)} 场只有地址
            </p>
          </aside>
        ) : null}
      </div>

      {mapExpanded ? (
        <div className="map-overlay" role="dialog" aria-modal="true" aria-label="场馆分布全图">
          <div className="map-overlay-head">
            <b>场馆分布 · {venuePoints.length} 个场馆 / {venuePoints.reduce((sum, point) => sum + point.count, 0)} 场</b>
            <button type="button" onClick={() => setMapExpanded(false)}>
              关闭 ✕
            </button>
          </div>
          <VenueMap points={venuePoints} />
          <p className="map-foot">圆越大场次越多；点圆看该场馆的活动</p>
        </div>
      ) : null}

      {drawerDay ? (
        <div className="drawer-backdrop" onClick={() => setDrawerDate("")}>
          <div
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`${drawerDay.month} 月 ${drawerDay.day} 日展期中的活动`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-title">
                  <b>{drawerDay.day}</b>
                  {drawerDay.weekday}{drawerDay.isToday ? " · 今天" : ""}
                </p>
                <p className="drawer-meta">展期中 · {drawerDay.folded.length} 场这天也能去 · 按结束日期排序</p>
              </div>
              <button type="button" className="drawer-close" onClick={() => setDrawerDate("")} autoFocus>
                关闭 ✕
              </button>
            </header>
            <div className="drawer-body">
              {drawerDay.folded.map((event) => (
                <AgendaRow
                  key={event.slug}
                  event={event}
                  kind="run"
                  date={drawerDay.date}
                  favorite={isFavorite(event.slug)}
                  onToggleFavorite={() => toggleFavorite(event.slug)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {filterOpen ? (
        <div className="drawer-backdrop" onClick={() => setFilterOpen(false)}>
          <div
            className="drawer filter-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="筛选活动"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="drawer-head">
              <div>
                <p className="drawer-title">筛选</p>
                <p className="drawer-meta">选完点「查看结果」收起 · 已生效 {filtered.length} 场</p>
              </div>
              <button type="button" className="drawer-close" onClick={() => setFilterOpen(false)} autoFocus>
                关闭 ✕
              </button>
            </header>

            <div className="drawer-body">
              {subs.length > 0 ? (
                <>
                  <p className="filter-label">细分 · {category}</p>
                  <div className="filter-group">
                    {subs.map((item) => (
                      <button
                        type="button"
                        key={item.value}
                        className={`fchip${item.value === subcategory ? " is-on" : ""}`}
                        aria-pressed={item.value === subcategory}
                        onClick={() => setSubcategory(item.value)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <p className="filter-label">细分 · 先在上面选一个类目</p>
              )}

              <p className="filter-label">区域</p>
              <div className="filter-group">
                {areas.map((item) => (
                  <button
                    type="button"
                    key={item.value}
                    className={`fchip${item.value === district ? " is-on" : ""}`}
                    aria-pressed={item.value === district}
                    onClick={() => setDistrict(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <p className="filter-note">区域按场馆名与地标推断，识别不出的活动只在「全部」里出现。</p>
            </div>

            <div className="filter-actions">
              <button type="button" className="filter-reset" onClick={resetFilter} disabled={filterCount === 0}>
                清除
              </button>
              <button type="button" className="filter-done" onClick={() => setFilterOpen(false)}>
                查看结果
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AgendaRow({ event, kind, date, favorite, onToggleFavorite }) {
  const source = formatSourceLabel(event);
  const range =
    kind === "run"
      ? `至 ${formatDotDate(eventEndDay(event))} · 还剩 ${daysBetween(date, eventEndDay(event))} 天`
      : formatRange(event);

  return (
    <div className={`row${kind === "start" ? "" : " is-span"}`}>
      {/*
        整行点进站内详情页。用铺满整行的一层链接而不是把它包在 <a> 里：
        行内还有星标按钮和「去报名」外链，链接套链接在 HTML 里不合法，
        套按钮也不行。所以内容层 pointer-events 关掉，让这一层接住点击。
      */}
      <a className="row-hit" href={`/e/${event.slug}`} aria-label={`查看「${event.title}」详情`} />
      <span className="row-time">
        {kind === "last" ? "最后一天" : kind === "run" ? "展期中" : formatShanghaiClock(event.start_time)}
        {kind === "start" && isMultiDay(event) ? <small>首日</small> : null}
      </span>
      <span className="row-main">
        <strong>{event.title}</strong>
        <small>
          {range ? <em>{range}</em> : null}
          {event.venue}
          {source ? ` · ${source}` : ""}
        </small>
        {/* 只想跳去报名页的人不必先进详情页 */}
        <a className="row-go" href={safeExternalUrl(event.signup_url)} target="_blank" rel="noopener noreferrer">
          去报名 ↗
        </a>
      </span>
      <span className="row-cat">{event.category}</span>
      <span className="row-thumb">
        <EventImage url={event.image_url} width={240} />
      </span>
      <button
        type="button"
        className="star"
        aria-label={favorite ? "取消收藏" : "收藏活动"}
        aria-pressed={favorite}
        onClick={onToggleFavorite}
      >
        {favorite ? "★" : "☆"}
      </button>
    </div>
  );
}

/** 来源与场馆同名（场馆官网自己发的）时不重复显示 */
function formatSourceLabel(event) {
  const source = String(event.source_name || "").trim();
  const venue = String(event.venue || "").trim();
  if (!source || source === venue) return "";
  if (venue.includes(source) || source.includes(venue)) return "";
  return source;
}
