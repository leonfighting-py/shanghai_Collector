import Link from "next/link";

import { CategoryEventCard } from "./components/CategoryEventCard.js";
import { ExploreBar } from "./components/ExploreBar.js";
import { FavoritesShelf } from "./components/FavoritesShelf.js";
import { HomeHero } from "./components/HomeHero.js";
import { StickyNavbar } from "./components/StickyNavbar.js";
import { FeaturedCarousel } from "./FeaturedCarousel.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { toShanghaiDate } from "../lib/events.js";
import { listEvents } from "../lib/repository.js";

// ---------------------------------------------------------------------------
// Media configuration — override via env vars in .env / .dev.vars
// ---------------------------------------------------------------------------
const HERO_VIDEO_URL =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL ||
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4";

// Shanghai sunset skyline photo (Xie Jian / Unsplash)
// Replace with your own: NEXT_PUBLIC_CONTENT_BG_IMAGE
const CONTENT_BG_IMAGE =
  process.env.NEXT_PUBLIC_CONTENT_BG_IMAGE ||
  "https://images.unsplash.com/photo-1698215191113-6f879dc1b538?w=1920&q=80";

// ---------------------------------------------------------------------------
export default async function Home({ searchParams }) {
  const params = await searchParams;
  // 默认锚点取上海日期（UTC 日期在 0-8 点会比上海晚一天）
  const anchor = params?.week || toShanghaiDate(new Date());
  const search = typeof params?.search === "string" ? params.search.trim().slice(0, 100) : "";
  const category = typeof params?.category === "string" ? params.category : "";
  const events = await listEvents({ week: anchor, search: search || undefined });
  const view = buildHomeViewModel(events, { now: new Date(anchor) });
  const isFiltering = Boolean(search || category);

  return (
    <div id="top" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* ---- Sticky navbar — always on top ---- */}
      <StickyNavbar />

      {/* ---- HERO — full-screen video with animated typography ---- */}
      <HomeHero videoUrl={HERO_VIDEO_URL} />

      {/* ---- CONTENT — city photo background with frosted glass ---- */}
      <div
        className="content-bg"
        style={{ backgroundImage: `url(${CONTENT_BG_IMAGE})` }}
      >
        {/* Darker scrim — uses theme variable for proper light/dark */}
        <div
          className="absolute inset-0"
          style={{ background: "var(--overlay-color)" }}
        />

        <div className="relative z-10 mx-auto w-full max-w-[1240px] px-6 pb-20 md:px-12 lg:px-16">
          {/* ---- Window info ---- */}
          <div className="mb-6 mt-10 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
            <p
              className="text-xs font-medium uppercase tracking-[0.12em]"
              style={{ color: "var(--text-muted)" }}
            >
              {view.updatedLabel} · {view.updatedDate}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {view.windowLabel} · {events.length} events
            </p>
          </div>

          {/* ---- Explore Bar：搜索 + 分类 + 起始日 ---- */}
          <ExploreBar initialSearch={search} initialCategory={category} initialWeek={params?.week || ""} />

          {/* ---- 我的收藏（localStorage）---- */}
          <FavoritesShelf events={events} />

          {isFiltering ? (
            /* ---- 筛选模式：平铺全部命中结果 ---- */
            <div className="mt-10">
              <div className="section-label">
                <div>
                  <p className="eyebrow">SEARCH RESULTS</p>
                  <span className="title">
                    {search ? `“${search}”` : ""}{category || "全部"} · {events.length} 条
                  </span>
                </div>
              </div>
              {events.length === 0 ? (
                <p className="browse-empty">没有匹配的活动，试试换个关键词或分类。</p>
              ) : (
                <div className="category-grid category-grid--browse">
                  {events.map((event) => (
                    <CategoryEventCard event={event} key={event.dedupe_key} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* ---- Featured Carousel ---- */}
              <FeaturedCarousel events={view.featuredEvents} />

              {/* ---- Category Sections ---- */}
              <div className="mt-10 flex flex-col gap-12">
                {view.categorySections.map((section) => (
                  <CategorySection section={section} key={section.title} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CategorySection({ section }) {
  const hasMore = section.totalCount > section.events.length;
  const sectionId = `section-${section.title}`;

  return (
    <section id={sectionId} className="scroll-mt-24">
      <div className="section-label">
        <div>
          <p className="eyebrow">{section.eyebrow}</p>
          <span className="title">{section.title}</span>
        </div>
        {hasMore ? (
          <Link className="section-more" href={section.browseHref}>
            查看更多 · 共 {section.totalCount} 条
          </Link>
        ) : (
          <span className="section-count">共 {section.totalCount} 条</span>
        )}
      </div>

      <div className="category-grid">
        {section.events.map((event) => (
          <CategoryEventCard
            event={event}
            key={`${section.title}-${event.dedupe_key}`}
          />
        ))}
      </div>
    </section>
  );
}
