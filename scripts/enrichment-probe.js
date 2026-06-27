#!/usr/bin/env node

import { enrichEventsForPublish, getEventEnrichmentConfig } from "../src/lib/event-enrichment.js";

const config = getEventEnrichmentConfig();

if (!config.enabled) {
  console.error("请在 .env 中配置：");
  console.error("  SILICONFLOW_API_KEY=你的硅基流动 API Key");
  console.error("  SILICONFLOW_MODEL=Qwen/Qwen3.5-35B-A3B");
  console.error("  LLM_ENRICHMENT_ENABLED=true");
  process.exit(1);
}

const samples = [
  {
    title: "《敢爱敢做》的热血酣畅、《分分钟需要你》的温柔细碎轮番上演，半生相守的默契藏在每句旋律里",
    start_time: "2026-06-27T11:00:00.000Z",
    end_time: "2026-06-28T13:00:00.000Z",
    venue: "浦发银行东方体育中心",
    category: "演出音乐",
    signup_url: "https://mp.weixin.qq.com/s/example-1",
    source_name: "公众号·ShanghaiWOW",
    source_url: "https://mp.weixin.qq.com/s/example-1",
  },
  {
    title: "6月魔都文娱活动TOP 15 乔治・莫兰迪：独白",
    start_time: "2026-06-17T02:00:00.000Z",
    end_time: "2026-10-31T13:00:00.000Z",
    venue: "浦东美术馆（浦东新区滨江大道 2777 号）",
    category: "展览",
    signup_url: "https://mp.weixin.qq.com/s/example-2",
    source_name: "公众号·ShanghaiWOW",
    source_url: "https://mp.weixin.qq.com/s/example-2",
  },
  {
    title: "大张伟 “大好时光 - 我们伟大的人生” 演唱会上海站",
    start_time: "2026-06-20T11:00:00.000Z",
    end_time: null,
    venue: "浦发银行东方体育中心（浦东新区耀体路 701 号）",
    category: "演出音乐",
    signup_url: "https://mp.weixin.qq.com/s/example-3",
    source_name: "公众号·ShanghaiWOW",
    source_url: "https://mp.weixin.qq.com/s/example-3",
  },
];

console.log(`模型：${config.silicon.model}`);
console.log(`批量：${config.batchSize}，并发：${config.concurrency}\n`);

const result = await enrichEventsForPublish(samples);

if (result.failures.length > 0) {
  console.error("部分批次失败：", result.failures);
}

console.log(`已润色 ${result.enrichedCount} 条，跳过 ${result.skippedCount} 条\n`);

for (const event of result.events) {
  console.log("—".repeat(40));
  console.log("原标题：", event.original_title || samples.find((s) => s.signup_url === event.signup_url)?.title);
  console.log("新标题：", event.title);
  console.log("简介：", event.summary || "(空)");
}
