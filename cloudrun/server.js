import express from "express";
import pg from "pg";

import { CATEGORIES, toShanghaiDayWindow } from "../src/lib/events.js";
import { dedupeEvents } from "../src/lib/dedupe.js";

// 公开响应 DTO：不泄漏 raw_event_ids 等内部字段（与 src/app/api/events/route.js 保持一致）
const PUBLIC_FIELDS = [
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "signup_url",
  "source_name",
  "source_url",
  "sources",
  "summary",
  "image_url",
];

function toPublicEvent(event) {
  const publicEvent = {};
  for (const field of PUBLIC_FIELDS) {
    if (event[field] !== undefined) publicEvent[field] = event[field];
  }
  // 封面图只接受绝对 http(s)。
  // 采集到的部分图是相对路径（高校源的 /_upload/...、../../images/...），
  // Web 端由 src/lib/image-url.js 的 isUsableImage() 在前端过滤，
  // 小程序侧没有这层逻辑且 <image> 必然加载失败，所以在服务端统一置空，
  // 前端走无图样式，避免裂图闪烁（这是与 Web DTO 的有意差异）。
  if (!isUsableImageUrl(publicEvent.image_url)) publicEvent.image_url = null;
  return publicEvent;
}

function isUsableImageUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

function databaseSsl(connectionString) {
  if (
    connectionString.includes("render.com") ||
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com")
  ) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: databaseSsl(process.env.DATABASE_URL || ""),
  max: 5,
});

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToEvent(row) {
  return {
    ...row,
    start_time: toIso(row.start_time),
    end_time: row.end_time ? toIso(row.end_time) : null,
  };
}

// 与 src/lib/repository.js 的窗口规则一致：
// 14 天发布窗口 + 展览回看 60 天 + 高校讲座回看 30 天
function buildEventWindowWhereSql(startParam, endParam) {
  return `(
    (start_time >= ${startParam} and start_time <= ${endParam})
    or (
      category = '展览'
      and start_time >= (${startParam}::timestamptz - interval '60 days')
      and start_time <= ${endParam}
    )
    or (
      category = '高校讲座'
      and start_time >= (${startParam}::timestamptz - interval '30 days')
      and start_time <= ${endParam}
    )
  )`;
}

async function listEvents({ week, category, search } = {}) {
  const { startDate, endDate } = toShanghaiDayWindow(week || new Date());

  const params = [`${startDate}T00:00:00+08:00`, `${endDate}T23:59:59+08:00`];
  const filters = [buildEventWindowWhereSql("$1", "$2")];

  if (category) {
    params.push(category);
    filters.push(`category = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(title ilike $${params.length} or venue ilike $${params.length} or summary ilike $${params.length})`);
  }

  const result = await pool.query(
    `
      select title, start_time, end_time, venue, category, signup_url, source_name,
             source_url, dedupe_key, sources, summary, image_url
      from events
      where ${filters.join(" and ")}
      order by start_time asc, title asc
    `,
    params,
  );

  // 读路径复用规则去重（过滤不可发布条目 + 合并软重复），与 Next.js 版行为一致
  const { events } = await dedupeEvents(result.rows.map(rowToEvent));
  return events;
}

function validateParams({ week, category, search }) {
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "week must be YYYY-MM-DD";
  if (category && !CATEGORIES.includes(category)) {
    return `category must be one of: ${CATEGORIES.join(", ")}`;
  }
  if (search && search.length > 100) return "search must be at most 100 characters";
  return null;
}

const app = express();
app.disable("x-powered-by");

app.get("/api/events", async (req, res) => {
  const params = {
    week: req.query.week || undefined,
    category: req.query.category || undefined,
    search: req.query.search || undefined,
  };

  const invalid = validateParams(params);
  if (invalid) {
    res.status(400).json({ error: invalid });
    return;
  }

  try {
    const events = await listEvents(params);
    // 数据每两日更新，公共读路径允许网关短缓存
    res.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=21600");
    res.json({
      events: events.map(toPublicEvent),
      count: events.length,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("listEvents failed:", error);
    res.status(500).json({ error: "internal error" });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ok" });
  } catch (error) {
    console.error("health check failed:", error);
    res.status(503).json({ status: "unhealthy" });
  }
});

// 临时诊断端点：打印容器内 DATABASE_URL 的形态与真实连接错误（不回显任何凭据）
// 排查完成后请连同 miniprogram/utils/config.js 一起清理，不要长期留在线上。
app.get("/api/debug", async (req, res) => {
  const cs = process.env.DATABASE_URL || "";
  const shape = { isSet: Boolean(cs), length: cs.length };
  if (cs) {
    try {
      const u = new URL(cs);
      shape.hostPrefix = u.hostname.slice(0, 14);
      shape.port = u.port || "(default 5432)";
      shape.isSharedPooler = u.hostname.includes("pooler.supabase.com");
      shape.isDirectHost = /^db\..*\.supabase\.co$/.test(u.hostname);
      shape.userHasProjectRefSuffix = u.username.includes(".");
      shape.userPrefix = u.username.slice(0, 8);
      shape.passwordLength = decodeURIComponent(u.password || "").length;
    } catch (error) {
      shape.parseError = error.message;
    }
  }
  let probe;
  try {
    await pool.query("select 1");
    probe = "ok";
  } catch (error) {
    probe = error.message;
  }
  res.json({ build: "debug-v1", env: shape, probe, node: process.version });
});

app.get("/", (req, res) => {
  res.json({ name: "shanghai-weekly-events cloudrun service", endpoints: ["/api/events", "/api/health"] });
});

const port = Number(process.env.PORT || 80);
app.listen(port, () => {
  console.log(`cloudrun service listening on port ${port}`);
});
