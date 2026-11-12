// 微信云开发云函数：小程序读活动的后端（替代云托管 events-api 的 /api/events）
//
// 为什么入口是 CommonJS、核心逻辑用动态 import：
//   微信云函数的调用约定是 `exports.main`（CommonJS），而 src/lib/*.js 是 ESM。
//   lib/ 下放的是 src/lib 的原样副本（改名 .mjs，dedupe.mjs 仅把 import 路径改成 ./events.mjs），
//   用动态 import 加载，避免把 540 行 ESM 手工改写成 CJS。
//   test/cloudfunction-lib-parity.test.js 守住这份副本与 src/lib 不漂移。
//
// 与 cloudrun/server.js 的关系：查询、DTO、参数校验逐行对齐。改一处必须同步另一处，
// 否则小程序走云函数和走云托管会看到不同的集合。

const pg = require("pg");

let pool = null;
let libPromise = null;

function loadLib() {
  if (!libPromise) {
    libPromise = Promise.all([import("./lib/events.mjs"), import("./lib/dedupe.mjs")]).then(
      ([events, dedupe]) => ({ ...events, ...dedupe }),
    );
  }
  return libPromise;
}

// 公开响应 DTO：不泄漏 raw_event_ids 等内部字段（与 cloudrun/server.js、src/app/api/events/route.js 一致）
const PUBLIC_FIELDS = [
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "subcategory",
  "district",
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
  // 封面图只接受绝对 http(s)：采集到的相对路径在小程序 <image> 里必然加载失败，
  // 这里统一置空走无图样式（与 cloudrun/server.js 相同的有意差异）。
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

// 云函数实例会被复用，连接池挂在模块作用域上；冷启动新建，实例回收时随之销毁
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) throw new Error("DATABASE_URL 未配置（云函数环境变量）");

  pool = new pg.Pool({
    connectionString,
    ssl: databaseSsl(connectionString),
    max: 2,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
  });
  // 空闲连接被对端断开时不要让进程崩掉（pg-pool 不会替我们兜这个）
  pool.on("error", (error) => console.error("pool idle error:", error));
  return pool;
}

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

// 与 src/lib/repository.js 的 buildEventWindowWhereSql 保持一致：
// 只出「未结束」的活动（结束日 >= 今天，按上海日期比较），不再做分类回看。
function buildEventWindowWhereSql(startParam, endParam) {
  return `(
    start_time <= ${endParam}
    and (coalesce(end_time, start_time) at time zone 'Asia/Shanghai')::date
        >= (${startParam}::timestamptz at time zone 'Asia/Shanghai')::date
  )`;
}

async function listEvents(lib, { week, category, search } = {}) {
  const { startDate, endDate } = lib.toShanghaiDayWindow(week || new Date());

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

  const result = await getPool().query(
    `
      select title, start_time, end_time, venue, category, signup_url, source_name,
             source_url, dedupe_key, sources, summary, image_url
      from events
      where ${filters.join(" and ")}
      order by start_time asc, title asc
    `,
    params,
  );

  // 读路径复用规则去重（过滤不可发布条目 + 合并软重复），与 Next.js / 云托管版行为一致
  const { events } = await lib.dedupeEvents(result.rows.map(rowToEvent));
  return events;
}

function validateParams(lib, { week, category, search }) {
  const { CATEGORIES } = lib;
  if (week && !/^\d{4}-\d{2}-\d{2}$/.test(week)) return "week must be YYYY-MM-DD";
  if (category && !CATEGORIES.includes(category)) {
    return `category must be one of: ${CATEGORIES.join(", ")}`;
  }
  if (search && search.length > 100) return "search must be at most 100 characters";
  return null;
}

function normalize(event) {
  const source = event || {};
  const toText = (value) => (typeof value === "string" && value ? value : undefined);
  return {
    week: toText(source.week),
    category: toText(source.category),
    search: toText(source.search),
  };
}

exports.main = async (event) => {
  const params = normalize(event);

  try {
    const lib = await loadLib();
    const invalid = validateParams(lib, params);
    if (invalid) return { error: invalid, statusCode: 400 };

    const events = await listEvents(lib, params);
    // 与云托管版响应结构一致，小程序端不用改解析逻辑
    return {
      events: events.map(toPublicEvent),
      count: events.length,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error("listEvents failed:", error);
    return { error: "internal error", statusCode: 500 };
  }
};
