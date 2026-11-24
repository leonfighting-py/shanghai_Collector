// 场馆批量地理编码（一次性脚本，不进采集流程）
//
// 为什么用 POI 搜索而不是地理编码：`/v3/geocode/geo` 拿场馆名去查会失真 ——
// 2026-11-24 实测「浦东美术馆」只命中到「上海市浦东新区」区级中心，
// 「上海博物馆东馆」命中的是「上海博物馆东馆(公交站)」。`/v3/place/text` 能拿到门牌号与所在区。
//
// 坐标系：高德返回 GCJ-02（火星坐标）。前端用高德瓦片，两者一致，**不要转 WGS-84**。
//
// 用法：
//   AMAP_WEB_SERVICE_KEY=xxx node scripts/geocode-venues.mjs            # 只出报告，不写文件
//   AMAP_WEB_SERVICE_KEY=xxx node scripts/geocode-venues.mjs --write    # 写回 venue-coordinates.js
//
// 结果分三档，只有「可信」的会被写回：
//   ok       —— 区一致，且 POI 名称与场馆名（或别名）互相包含
//   review   —— 区一致，但名称不像，需要人工看一眼
//   missing  —— 搜不到，或搜到的全在别的区

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VENUE_PROFILES } from "../src/lib/venue-profiles.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KEY = process.env.AMAP_WEB_SERVICE_KEY;
const WRITE = process.argv.includes("--write");
const QPS_INTERVAL_MS = 400; // 个人认证 Web 服务 QPS 3，留点余量
const REPORT_MD = path.join(root, "scripts/geocode-venues-report.md");
const OUT_JS = path.join(root, "src/lib/venue-coordinates.js");

if (!KEY) {
  console.error("缺少 AMAP_WEB_SERVICE_KEY。用法：AMAP_WEB_SERVICE_KEY=xxx node scripts/geocode-venues.mjs");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const norm = (value = "") => String(value).replace(/[\s（）()·•・\-—]/g, "").toLowerCase();

/** 高德的 adname 是「浦东新区」「黄浦区」，字典里是「浦东」「黄浦」 */
function sameDistrict(adname, district) {
  return String(adname || "").includes(district);
}

function scorePoi(poi, profile) {
  if (!sameDistrict(poi.adname, profile.district)) return 0;
  const poiName = norm(poi.name);
  const names = [profile.name, ...(profile.aliases || [])].map(norm).filter(Boolean);
  let best = 1;
  for (const name of names) {
    if (poiName === name) best = Math.max(best, 4);
    else if (poiName.includes(name) || name.includes(poiName)) best = Math.max(best, 3);
    // 高德常给「上海博物馆(东馆)」这种写法，去括号后再比一次
    else if (poiName.replace(/暂停开放|闭馆/g, "").includes(name)) best = Math.max(best, 3);
    // 缩写 POI（McaM）：名字里没有场馆名，但地址写了
    else if (norm(poi.address).includes(name)) best = Math.max(best, 3);
  }
  return best;
}

async function search(keyword) {
  const url =
    `https://restapi.amap.com/v3/place/text?key=${KEY}` +
    `&city=${encodeURIComponent("上海")}&keywords=${encodeURIComponent(keyword)}` +
    `&offset=10&page=1&extensions=base`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.status !== "1") throw new Error(`高德返回 status=${data.status} info=${data.info}`);
  return data.pois || [];
}

async function main() {
  const results = [];

  for (const profile of VENUE_PROFILES) {
    let pois = [];
    let error = "";
    try {
      pois = await search(profile.name);
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }

    let best = null;
    let bestScore = 0;
    for (const poi of pois) {
      const score = scorePoi(poi, profile);
      if (score > bestScore) {
        bestScore = score;
        best = poi;
      }
    }

    // 同名/近名但落在别的区 —— 多半是字典里的区过时了，单独报出来让人判断
    let conflict = null;
    if (!best) {
      const names = [profile.name, ...(profile.aliases || [])].map(norm).filter(Boolean);
      conflict = pois.find((poi) => {
        const poiName = norm(poi.name);
        return names.some((name) => poiName.includes(name) || name.includes(poiName));
      }) || null;
    }

    const [lng, lat] = best ? String(best.location).split(",").map(Number) : [NaN, NaN];
    const status = conflict ? "conflict" : !best || bestScore < 2 ? "missing" : bestScore >= 3 ? "ok" : "review";
    results.push({
      name: profile.name,
      district: profile.district,
      status: error ? "missing" : status,
      poiName: (best || conflict)?.name || "",
      adname: (best || conflict)?.adname || "",
      address: (best || conflict)?.address || "",
      lng: Number.isFinite(lng) ? lng : null,
      lat: Number.isFinite(lat) ? lat : null,
      score: bestScore,
      error,
    });

    await sleep(QPS_INTERVAL_MS);
  }

  const counts = results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});

  const lines = [
    "# 场馆坐标地理编码报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    `坐标系：GCJ-02（与高德瓦片一致，未转 WGS-84）`,
    `场馆数：${results.length} ｜ 可信 ${counts.ok || 0} ｜ 待核 ${counts.review || 0} ｜ 区不符 ${counts.conflict || 0} ｜ 未命中 ${counts.missing || 0}`,
    "",
    "## 可信（会写入坐标文件）",
    "",
    "| 场馆 | 区 | 高德 POI | 地址 | 坐标 |",
    "|---|---|---|---|---|",
    ...results
      .filter((row) => row.status === "ok")
      .map((row) => `| ${row.name} | ${row.district} | ${row.poiName} | ${row.address} | ${row.lng},${row.lat} |`),
    "",
    "## 待人工核对（名称不像，未写入）",
    "",
    "| 场馆 | 区 | 高德 POI | 地址 |",
    "|---|---|---|---|",
    ...results
      .filter((row) => row.status === "review")
      .map((row) => `| ${row.name} | ${row.district} | ${row.poiName} | ${row.address} |`),
    "",
    "## 区不符（同名 POI 在别的区，字典里的区可能过时了，未写入坐标）",
    "",
    "| 场馆 | 字典区 | 高德 POI | 高德区 | 地址 |",
    "|---|---|---|---|---|",
    ...results
      .filter((row) => row.status === "conflict")
      .map((row) => `| ${row.name} | ${row.district} | ${row.poiName} | ${row.adname} | ${row.address} |`),
    "",
    "## 未命中",
    "",
    "| 场馆 | 区 | 原因 |",
    "|---|---|---|",
    ...results
      .filter((row) => row.status === "missing")
      .map((row) => `| ${row.name} | ${row.district} | ${row.error || "没有同区的候选"} |`),
    "",
  ];
  fs.writeFileSync(REPORT_MD, lines.join("\n"));

  console.log(`场馆 ${results.length} 条：可信 ${counts.ok || 0}、待核 ${counts.review || 0}、未命中 ${counts.missing || 0}`);
  console.log(`报告：${path.relative(root, REPORT_MD)}`);

  if (!WRITE) {
    console.log("未加 --write，只出报告。");
    return;
  }

  const okRows = results.filter((row) => row.status === "ok").sort((a, b) => a.name.localeCompare(b.name));
  const body = okRows.map((row) => `  ${JSON.stringify(row.name)}: [${row.lng}, ${row.lat}],`).join("\n");
  fs.writeFileSync(
    OUT_JS,
    `// 场馆坐标（自动生成，勿手改）。重新生成：AMAP_WEB_SERVICE_KEY=xxx npm run venues:geocode -- --write
//
// 坐标系 **GCJ-02（火星坐标）** —— 高德 POI 接口原样返回的值，前端瓦片也用高德，
// 两者一致。**不要转 WGS-84**：转了会整体偏移几百米，而且高德瓦片编号本身就用 GCJ-02。
//
// 来源：高德 /v3/place/text POI 搜索，按「区一致 + 名称互相包含」筛选；
// 名称不像或搜不到的不写进来，宁可没有坐标也不给错位置。
// 逐条核对记录见 scripts/geocode-venues-report.md。

export const VENUE_COORDINATES = {
${body}
};

/** [lng, lat]；没有坐标返回 null（前端按「未定位」处理） */
export function venueCoordinate(name) {
  return VENUE_COORDINATES[name] || null;
}
`,
  );
  console.log(`已写入 ${path.relative(root, OUT_JS)}（${okRows.length} 条）`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
