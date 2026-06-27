"use client";

import { useEffect, useState } from "react";

import { CAROUSEL_INTERVAL_MS, nextCarouselIndex } from "../lib/carousel.js";

export function FeaturedCarousel({ events }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const total = events.length;
  const activeEvent = events[activeIndex];

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
    <section className="featured-carousel" aria-label="近两日强推活动">
      <a className="featured-slide" href={activeEvent.signup_url}>
        <span className="cover-kicker">{activeEvent.category}</span>
        <h2>{activeEvent.title}</h2>
        {activeEvent.summary ? <p className="featured-summary">{activeEvent.summary}</p> : null}
        <p>
          {activeEvent.venue} / {formatDateTime(activeEvent.start_time)}
        </p>
      </a>

      {total > 1 && (
        <>
          <button className="carousel-arrow carousel-arrow-left" type="button" aria-label="上一条" onClick={showPrevious}>
            ‹
          </button>
          <div className="carousel-dots" aria-label="切换强推活动">
            {events.map((event, index) => (
              <button
                aria-label={`切换到 ${event.title}`}
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
          <button className="carousel-arrow carousel-arrow-right" type="button" aria-label="下一条" onClick={showNext}>
            ›
          </button>
        </>
      )}
    </section>
  );
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
