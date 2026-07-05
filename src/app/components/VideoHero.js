"use client";

/**
 * Full-screen video background component.
 * Video plays raw — no overlay, no dimming.
 */
export function VideoHero({ videoUrl, children }) {
  return (
    <section className="relative h-screen w-full overflow-hidden">
      {/* Video background */}
      <video
        className="hero-video"
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* Content overlay */}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </section>
  );
}
