"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

const COVER = "/images/shanghai-radar-cover.jpg";

/** Local Shanghai artwork is also the fallback for optional custom video. */
export function VideoHero({ videoUrl, children }) {
  const sectionRef = useRef(null);
  const videoRef = useRef(null);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [inView, setInView] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);
  const moving = !paused && !reducedMotion && inView;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    syncPreference();
    preference.addEventListener("change", syncPreference);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(sectionRef.current);
    return () => {
      preference.removeEventListener("change", syncPreference);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (moving) video.play().catch((error) => {
      // A quick pause or reduced-motion change can cancel a pending play request.
      if (error.name !== "AbortError") setVideoFailed(true);
    });
    else video.pause();
  }, [moving, videoUrl, videoFailed]);

  return (
    <section ref={sectionRef} className="shanghai-hero" data-motion={moving ? "playing" : "paused"} aria-label="上海城市生活雷达">
      <div className="shanghai-scene" data-media={videoUrl && !videoFailed ? "video" : "art"} aria-hidden="true">
        <Image className="shanghai-art" src={COVER} alt="" fill priority unoptimized sizes="100vw" />
        {videoUrl && !videoFailed && !reducedMotion && (
          <video ref={videoRef} className="hero-video" src={videoUrl} poster={COVER} loop muted playsInline preload="metadata" onError={() => setVideoFailed(true)} />
        )}
        {!videoUrl || videoFailed ? <div className="shanghai-waterlight" /> : null}
      </div>
      <div className="shanghai-scrim" aria-hidden="true" />
      <div className="shanghai-hero-content">{children}</div>
      {!reducedMotion && (
        <button className="shanghai-motion-control" type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "播放封面动效" : "暂停封面动效"} aria-pressed={paused}>
          <span aria-hidden="true">{paused ? "▷" : "Ⅱ"}</span>
          {paused ? "播放动效" : "暂停动效"}
        </button>
      )}
    </section>
  );
}
