import Link from "next/link";

import { CategoryEventCard } from "./components/CategoryEventCard.js";
import { HomeHero } from "./components/HomeHero.js";
import { StickyNavbar } from "./components/StickyNavbar.js";
import { FeaturedCarousel } from "./FeaturedCarousel.js";
import { buildHomeViewModel } from "../lib/home-view-model.js";
import { listEvents } from "../lib/repository.js";

// ---------------------------------------------------------------------------
// Video configuration
// ---------------------------------------------------------------------------
// Replace this with your own Shanghai video URL. You can also set the
// NEXT_PUBLIC_HERO_VIDEO_URL environment variable in .env / .dev.vars.
const HERO_VIDEO_URL =
  process.env.NEXT_PUBLIC_HERO_VIDEO_URL ||
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260403_050628_c4e32401-fab4-4a27-b7a8-6e9291cd5959.mp4";

// ---------------------------------------------------------------------------
export default async function Home({ searchParams }) {
  const params = await searchParams;
  const anchor = params?.week || new Date().toISOString().slice(0, 10);
  const events = await listEvents({ week: anchor });
  const view = buildHomeViewModel(events, { now: new Date(anchor) });

  return (
    <div id="top" className="bg-black text-white">
      {/* ---- Sticky navbar — always on top ---- */}
      <StickyNavbar />

      {/* ---- HERO — full-screen video with animated typography ---- */}
      <HomeHero videoUrl={HERO_VIDEO_URL} />

      {/* ---- CONTENT — cards & sections below the fold ---- */}
      <div className="mx-auto w-full max-w-[1240px] px-6 pb-20 md:px-12 lg:px-16">
        {/* ---- Window info ---- */}
        <div className="mb-6 mt-10 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-white/30">
            {view.updatedLabel} · {view.updatedDate}
          </p>
          <p className="text-xs text-white/25">
            {view.windowLabel} · {events.length} events
          </p>
        </div>

        {/* ---- Featured Carousel ---- */}
        <FeaturedCarousel events={view.featuredEvents} />

        {/* ---- Category Sections ---- */}
        <div className="mt-10 flex flex-col gap-12">
          {view.categorySections.map((section) => (
            <CategorySection section={section} key={section.title} />
          ))}
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
