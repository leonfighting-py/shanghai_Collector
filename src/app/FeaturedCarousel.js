"use client";

import { useEffect, useState } from "react";

import { CAROUSEL_INTERVAL_MS, nextCarouselIndex } from "../lib/carousel.js";
import { safeExternalUrl } from "../lib/events.js";

export function FeaturedCarousel({ events }) {
  // 只展示有真实封面的事件；无图事件在分类网格里已有渐变兜底，featured 走纯图片位
  const withCovers = events.filter((event) => isUsableImage(event.image_url));
  const [activeIndex, setActiveIndex] = useState(0);
  const total = withCovers.length;
  const activeEvent = withCovers[activeIndex];

  useEffect(() => {
    if (total <= 1) return undefined;
    const timer = setInterval(() => {
      setActiveIndex((index) => nextCarouselIndex(index, 1, total));
    }, CAROUSEL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [total]);

  if (!activeEvent) return null;

  function showPrevious(event) {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((index) => nextCarouselIndex(index, -1, total));
  }

  function showNext(event) {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex((index) => nextCarouselIndex(index, 1, total));
  }

  function showSlide(index) {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(index);
    };
  }

  return (
    <section className="featured-carousel" aria-label="Featured events">
      <a
        className="featured-slide featured-slide--image"
        href={safeExternalUrl(activeEvent.signup_url)}
        target="_blank"
        rel="noopener noreferrer"
        style={{ backgroundImage: `url(${activeEvent.image_url})` }}
      >
        <span className="featured-cover-scrim" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="featured-cover-img" src={activeEvent.image_url} alt="" loading="eager" referrerPolicy="no-referrer" />
        <span className="featured-slide-content">
          <span className="cover-kicker">{activeEvent.category}</span>
          <h2>{activeEvent.title}</h2>
          {activeEvent.summary ? (
            <p className="featured-summary">{activeEvent.summary}</p>
          ) : null}
          <p className="featured-meta">
            {activeEvent.venue} / {formatDateTime(activeEvent.start_time)}
          </p>
        </span>
      </a>

      {total > 1 && (
        <>
          <button
            className="carousel-arrow carousel-arrow-left"
            type="button"
            aria-label="Previous"
            onClick={showPrevious}
          >
            ‹
          </button>
          <div className="carousel-dots" aria-label="Slide navigation">
            {withCovers.map((event, index) => (
              <button
                aria-label={`Go to ${event.title}`}
                aria-pressed={index === activeIndex}
                className={index === activeIndex ? "is-active" : ""}
                key={event.dedupe_key}
                onClick={showSlide(index)}
                type="button"
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <button
            className="carousel-arrow carousel-arrow-right"
            type="button"
            aria-label="Next"
            onClick={showNext}
          >
            ›
          </button>
        </>
      )}
    </section>
  );
}

function isUsableImage(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
