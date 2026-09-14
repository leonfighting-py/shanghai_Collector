"use client";

import { VideoHero } from "./VideoHero.js";

export function HomeHero({ videoUrl }) {
  return (
    <VideoHero videoUrl={videoUrl}>
      <div className="shanghai-edition">
        <span><i aria-hidden="true" /> SHANGHAI / 城市漫游指南</span>
        <span className="shanghai-coordinates">31°14′ N &nbsp; 121°28′ E</span>
      </div>
      <div className="shanghai-intro">
        <p className="shanghai-kicker">让日常，多一点发现。</p>
        <h1>上海城市<span>生活雷达<span className="shanghai-title-dot">.</span></span></h1>
        <p className="shanghai-description">从一场展览，到一段街角旋律。<br />发现上海，正在发生的好生活。</p>
        <a className="shanghai-explore" href="#city-discoveries">探索城市活动 <span aria-hidden="true">↗</span></a>
      </div>
      <div className="shanghai-caption">
        <div className="shanghai-radar" aria-hidden="true"><i /><b /></div>
        <div><p>THE CITY IS ALIVE</p><span>展览 / 音乐 / 讲座 / 城市现场</span></div>
      </div>
    </VideoHero>
  );
}
