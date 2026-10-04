"use client";

import { VideoHero } from "./VideoHero.js";

export function HomeHero({ videoUrl }) {
  return (
    <VideoHero videoUrl={videoUrl}>
      <div className="shanghai-intro">
        <h1>上海城市<span>生活雷达<span className="shanghai-title-dot">.</span></span></h1>
        <p className="shanghai-description">从一场展览，到一段街角旋律，发现上海正在发生的好生活。</p>
        {/* 直接跳到今天的日程，而不是让人自己猜要往下滑 */}
        <a className="shanghai-explore" href="#agenda">看看今天有什么 <span aria-hidden="true">↓</span></a>
      </div>
    </VideoHero>
  );
}
