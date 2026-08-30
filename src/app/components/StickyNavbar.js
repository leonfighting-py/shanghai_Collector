"use client";

import { useCallback } from "react";

import { ThemeToggle } from "./ThemeToggle.js";

const NAV_LINKS = [
  { label: "演出音乐", sectionId: "section-演出音乐" },
  { label: "展览", sectionId: "section-展览" },
  { label: "线下活动", sectionId: "section-线下活动" },
  { label: "高校讲座", sectionId: "section-高校讲座" },
];

/**
 * Fixed-position navbar with liquid-glass styling.
 * Links use smooth scrolling to anchor sections on the homepage.
 */
export function StickyNavbar() {
  const scrollTo = useCallback((e, sectionId) => {
    e.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  return (
    <nav className="fixed left-0 right-0 top-0 z-50 px-6 pt-4 md:px-12 lg:px-16">
      <div className="liquid-glass flex items-center justify-between rounded-xl px-4 py-2">
        {/* Left: brand — scroll to top */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="navbar-brand"
        >
          Shanghai Radar
        </a>

        {/* Center: section links */}
        <div className="hidden gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.sectionId}
              href={`#${link.sectionId}`}
              onClick={(e) => scrollTo(e, link.sectionId)}
              className="navbar-link"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Right: theme toggle */}
        <ThemeToggle />
      </div>
    </nav>
  );
}
