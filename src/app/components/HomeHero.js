"use client";

import { AnimatedHeading } from "./AnimatedHeading.js";
import { FadeIn } from "./FadeIn.js";
import { VideoHero } from "./VideoHero.js";

/**
 * Full-viewport hero with video background and animated typography.
 * The navbar is handled separately as a sticky header in the page layout.
 */
export function HomeHero({ videoUrl }) {
  return (
    <VideoHero videoUrl={videoUrl}>
      {/* ---- Hero Content (bottom) ---- */}
      <div className="flex flex-1 flex-col justify-end px-6 pb-12 md:px-12 lg:grid lg:grid-cols-2 lg:items-end lg:px-16 lg:pb-16">
        {/* Left column — main text */}
        <div>
          <AnimatedHeading
            text="Discover Shanghai\nin motion."
            charDelay={30}
            initialDelay={200}
            transitionMs={500}
            className="mb-4 text-4xl font-normal text-white md:text-5xl lg:text-6xl xl:text-7xl"
            style={{ letterSpacing: "-0.04em" }}
          />

          <FadeIn delay={800} duration={1000}>
            <p className="mb-5 text-base text-white/60 md:text-lg">
              Curated events, exhibitions, and happenings across Shanghai —
              updated every two days.
            </p>
          </FadeIn>
        </div>

        {/* Right column — tag */}
        <div className="flex items-end justify-start lg:justify-end">
          <FadeIn delay={1400} duration={1000}>
            <div className="liquid-glass mt-6 inline-block rounded-xl border border-white/20 px-6 py-3 lg:mt-0">
              <span className="text-lg font-light text-white md:text-xl lg:text-2xl">
                Exhibitions. Music. Talks. City.
              </span>
            </div>
          </FadeIn>
        </div>
      </div>
    </VideoHero>
  );
}
