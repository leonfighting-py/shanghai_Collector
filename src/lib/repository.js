import { getDatabaseConfig, runQuery, runTransaction } from "./db-pool.js";
import { dedupeEvents } from "./dedupe.js";
import { filterPublishableEvents, isInDateRange, mergeDuplicateEvents, toShanghaiDayWindow } from "./events.js";
import { SAMPLE_EVENTS } from "./sample-events.js";

export function buildSchemaSql() {
  return `
    create table if not exists source_configs (
      id bigserial primary key,
      source_name text not null unique,
      category text not null,
      base_url text not null,
      parser_type text not null default 'custom',
      enabled boolean not null default true,
      crawl_interval text not null default 'weekly',
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists collection_runs (
      id bigserial primary key,
      status text not null default 'running',
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      source_count integer not null default 0,
      raw_count integer not null default 0,
      published_count integer not null default 0,
      failure_count integer not null default 0,
      failures jsonb not null default '[]'::jsonb,
      dedupe_provider text not null default 'rules'
    );

    create table if not exists raw_events (
      id bigserial primary key,
      run_id bigint references collection_runs(id) on delete set null,
      title text,
      start_time timestamptz,
      end_time timestamptz,
      venue text,
      category text,
      signup_url text,
      source_name text not null,
      source_url text not null,
      raw_payload jsonb not null default '{}'::jsonb,
      publishable boolean not null default false,
      rejection_reason text,
      created_at timestamptz not null default now()
    );

    create table if not exists events (
      id bigserial primary key,
      title text not null,
      start_time timestamptz not null,
      end_time timestamptz,
      venue text not null,
      category text not null,
      signup_url text not null,
      source_name text not null,
      source_url text not null,
      dedupe_key text not null unique,
      sources jsonb not null default '[]'::jsonb,
      raw_event_ids jsonb not null default '[]'::jsonb,
      dedupe_provider text not null default 'rules',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists raw_events_run_id_idx on raw_events(run_id);
    create index if not exists raw_events_start_time_idx on raw_events(start_time);
    create index if not exists raw_events_category_idx on raw_events(category);
    create index if not exists events_start_time_idx on events(start_time);
    create index if not exists events_category_idx on events(category);
    create index if not exists collection_runs_started_at_idx on collection_runs(started_at);

    -- 详情页抓取结果的跨轮缓存（src/lib/detail-fetch.js）。
    -- 存提取结果不存 HTML：一页 40 KB，266 条就是 10 MB，跨境传输比重新抽一遍贵得多。
    create table if not exists event_detail_cache (
      source_url text primary key,
      image_url text,
      venue text,
      address text,
      price_min numeric,
      price_max numeric,
      is_free boolean,
      facet_provenance jsonb not null default '{}'::jsonb,
      fetched_at timestamptz not null default now()
    );
    create index if not exists event_detail_cache_fetched_at_idx on event_detail_cache(fetched_at);
  `;
}

// 已结束活动的存储保留天数。注意这只是「存储缓冲」，不是展示口径——
// 展示口径见 buildEventWindowWhereSql（只出「未结束」的活动）。
export const EVENT_RETENTION_DAYS = 7;
export const RUN_RETENTION_DAYS = 90;
// 详情页缓存有效期：超过就不再用，等下一次重新抓
export const DETAIL_CACHE_TTL_DAYS = 7;

export function buildCleanupSql({
  eventRetentionDays = EVENT_RETENTION_DAYS,
  runRetentionDays = RUN_RETENTION_DAYS,
  detailCacheRetentionDays = DETAIL_CACHE_TTL_DAYS,
} = {}) {
  return {
    statements: [
      {
        // raw_events 是采集中间产物，同样按「结束时间」判定，避免长期展览的原始记录被提前清掉
        sql: "delete from raw_events where start_time is not null and coalesce(end_time, start_time) < now() - ($1::int * interval '1 day')",
        params: [eventRetentionDays],
      },
      {
        // 关键：判定基准是 coalesce(end_time, start_time)，不是 start_time。
        // 长期展览（如 7 月开幕、明年才结束）按 start_time 会被误删——这类活动仍然在展，
        // 是有效内容。按「结束时间」判定才能既清掉过期内容、又不误伤进行中的活动。
        sql: "delete from events where coalesce(end_time, start_time) < now() - ($1::int * interval '1 day')",
        params: [eventRetentionDays],
      },
      {
        sql: "delete from collection_runs where started_at < now() - ($1::int * interval '1 day')",
        params: [runRetentionDays],
      },
      {
        // 缓存过期即无用（读取时按同样的 TTL 过滤），留着只会占空间
        sql: "delete from event_detail_cache where fetched_at < now() - ($1::int * interval '1 day')",
        params: [detailCacheRetentionDays],
      },
    ],
  };
}

export function normalizeSourceConfig(source) {
  return {
    source_name: source.name || source.source_name,
    category: source.category,
    base_url: source.url || source.base_url,
    parser_type: source.parser_type || "custom",
    enabled: source.enabled ?? true,
    crawl_interval: source.crawl_interval || "weekly",
    notes: source.notes || "",
  };
}


// 补列语句。新增的 DDL 一律写成 if not exists，保证重复执行无副作用（scripts/migrate.mjs 每次部署都会跑）。
//
// 注意 district 不在这里：区域是派生字段（event-classify.js 的 detectDistrict），
// 采集侧补的区域靠场馆字典喂给它，不落库。落库就会和派生值打架——读路径会覆盖写入值。
export const EVENTS_ADD_COLUMNS_SQL = `
    alter table events add column if not exists summary text not null default '';
    alter table events add column if not exists image_url text;
    alter table events add column if not exists address text;
    alter table events add column if not exists price_min numeric;
    alter table events add column if not exists price_max numeric;
    alter table events add column if not exists is_free boolean;
    alter table events add column if not exists audience jsonb not null default '[]'::jsonb;
    alter table events add column if not exists facet_provenance jsonb not null default '{}'::jsonb;
    alter table raw_events add column if not exists summary text;
    alter table raw_events add column if not exists image_url text;
  `;

// 字段补齐新增的列（docs/plans/2026-10-12-event-facets-backfill.md 第 3 节）。
// 读、写、加列三处都从这里派生，少一处就会「写进去了但读不出来」。
export const FACET_COLUMNS = ["address", "price_min", "price_max", "is_free", "audience", "facet_provenance"];

/** 读路径的字段列表；listEvents 与单条查询共用，避免两边漂移 */
export const EVENT_SELECT_COLUMNS = [
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "signup_url",
  "source_name",
  "source_url",
  "dedupe_key",
  "sources",
  "dedupe_provider",
  "summary",
  "image_url",
  ...FACET_COLUMNS,
  "created_at",
  "updated_at",
].join(", ");

// 写入列（顺序 = 占位符顺序）。updated_at 用 now()，不占参数。
export const EVENT_UPSERT_COLUMNS = [
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "signup_url",
  "source_name",
  "source_url",
  "dedupe_key",
  "sources",
  "raw_event_ids",
  "dedupe_provider",
  "summary",
  "image_url",
  ...FACET_COLUMNS,
];

const JSONB_UPSERT_COLUMNS = new Set(["sources", "raw_event_ids", "audience", "facet_provenance"]);

/** 冲突更新时不动 dedupe_key（它是冲突目标），其余列照抄 excluded */
const UPSERT_SKIP_UPDATE = new Set(["dedupe_key"]);

export function buildEventUpsertSql() {
  const columns = EVENT_UPSERT_COLUMNS.join(", ");
  const placeholders = EVENT_UPSERT_COLUMNS.map((column, index) => {
    const slot = `$${index + 1}`;
    return JSONB_UPSERT_COLUMNS.has(column) ? `${slot}::jsonb` : slot;
  }).join(", ");
  const updates = EVENT_UPSERT_COLUMNS.filter((column) => !UPSERT_SKIP_UPDATE.has(column))
    .map((column) => `${column} = excluded.${column}`)
    .concat("updated_at = now()")
    .join(",\n            ");

  return `
          insert into events (${columns}, updated_at)
          values (${placeholders}, now())
          on conflict (dedupe_key) do update set
            ${updates}
      `;
}

/** 与 buildEventUpsertSql 的列顺序严格对应：测试里会核对两者长度 */
export function buildEventUpsertParams(event, rawEventIds, dedupeProvider) {
  return EVENT_UPSERT_COLUMNS.map((column) => {
    if (column === "sources") return JSON.stringify(event.sources || []);
    if (column === "raw_event_ids") return JSON.stringify(rawEventIds);
    if (column === "dedupe_provider") return dedupeProvider;
    if (column === "summary") return event.summary || "";
    if (column === "audience") return JSON.stringify(event.audience || []);
    if (column === "facet_provenance") return JSON.stringify(event.facet_provenance || {});
    if (column === "is_free") return typeof event.is_free === "boolean" ? event.is_free : null;
    if (column === "price_min" || column === "price_max") {
      const value = event[column];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    return event[column] ?? null;
  });
}

/**
 * 建表 + 补列。
 *
 * lockTimeoutMs：只给部署前迁移用。`alter table ... add column if not exists` 即使列已存在
 * 也要先拿表的排他锁；如果此刻有长读（每天 05:00 UTC 的 pg_dump、采集开头的 listEvents），
 * alter 会排队，而排队中的排他锁会把后面所有普通读一起堵住——首页卡到那条长读结束为止
 * （2026-11-14 本地复现：一条 0.03 秒的读被堵到 5.5 秒）。
 * 传了这个参数就在一个事务里执行，并 `set local lock_timeout`：拿不到锁就报 55P03 放弃（scripts/migrate.mjs 默认 3 秒），
 * 由调用方决定重试还是让部署失败，绝不长时间占着锁队列。`set local` 只在本事务内生效，
 * runTransaction 用独立连接池、用完即关，不会把超时设置漏给别的查询。
 * 采集和清理任务不传，行为与以前一致。
 */
export async function ensureSchema({ lockTimeoutMs } = {}) {
  if (!process.env.DATABASE_URL) return;
  const statements = [buildSchemaSql(), EVENTS_ADD_COLUMNS_SQL];
  if (!lockTimeoutMs) {
    for (const sql of statements) await query(sql);
    return;
  }
  const timeout = Math.max(1, Math.floor(Number(lockTimeoutMs)));
  await runTransaction([
    { sql: `set local lock_timeout = ${timeout}` },
    ...statements.map((sql) => ({ sql })),
  ]);
}

export async function upsertSourceConfigs(sources) {
  if (!process.env.DATABASE_URL) return { upserted: sources.length, dryRun: true };
  await ensureSchema();

  for (const source of sources.map(normalizeSourceConfig)) {
    await query(
      `
        insert into source_configs (source_name, category, base_url, parser_type, enabled, crawl_interval, notes, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, now())
        on conflict (source_name) do update set
          category = excluded.category,
          base_url = excluded.base_url,
          parser_type = excluded.parser_type,
          enabled = excluded.enabled,
          crawl_interval = excluded.crawl_interval,
          notes = excluded.notes,
          updated_at = now()
      `,
      [source.source_name, source.category, source.base_url, source.parser_type, source.enabled, source.crawl_interval, source.notes],
    );
  }

  return { upserted: sources.length, dryRun: false };
}

export async function startCollectionRun({ sourceCount = 0 } = {}) {
  if (!process.env.DATABASE_URL) return { id: null, dryRun: true };
  await ensureSchema();
  const result = await query("insert into collection_runs (source_count) values ($1) returning id", [sourceCount]);
  return { id: result.rows[0].id, dryRun: false };
}

export async function finishCollectionRun(runId, { status, rawCount, publishedCount, failures, dedupeProvider }) {
  if (!process.env.DATABASE_URL || !runId) return { dryRun: true };
  await query(
    `
      update collection_runs
      set status = $2,
          finished_at = now(),
          raw_count = $3,
          published_count = $4,
          failure_count = $5,
          failures = $6::jsonb,
          dedupe_provider = $7
      where id = $1
    `,
    [runId, status, rawCount, publishedCount, failures.length, JSON.stringify(failures), dedupeProvider],
  );
  return { dryRun: false };
}

export async function insertRawEvents(events, { runId = null } = {}) {
  if (!process.env.DATABASE_URL) return { inserted: events.length, dryRun: true, rawEventIds: [] };
  await ensureSchema();
  const rawEventIds = [];

  for (const event of events) {
    const publishable = Boolean(event.title && event.start_time && event.venue && event.signup_url && event.category);
    const result = await query(
      `
        insert into raw_events (
          run_id, title, start_time, end_time, venue, category, signup_url,
          source_name, source_url, raw_payload, publishable, rejection_reason, image_url
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13)
        returning id
      `,
      [
        runId,
        event.title || null,
        event.start_time || null,
        event.end_time || null,
        event.venue || null,
        event.category || null,
        event.signup_url || null,
        event.source_name,
        event.source_url,
        JSON.stringify(event),
        publishable,
        publishable ? null : "missing_required_fields",
        event.image_url || null,
      ],
    );
    rawEventIds.push(result.rows[0].id);
  }

  return { inserted: events.length, dryRun: false, rawEventIds };
}

export async function listEvents({ week, category, search } = {}) {
  const { startDate, endDate } = toShanghaiDayWindow(week || new Date());

  if (!getDatabaseConfig()) {
    return applyFilters(SAMPLE_EVENTS, { startDate, endDate, category, search });
  }

  // 读路径不执行 DDL：建表仅由采集/清理任务负责，读账号无需 CREATE/ALTER 权限
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

  // 不取 raw_event_ids：写入侧把整批采集的 raw id（10-15 那轮是 2374 个 uuid）塞进了每一行，
  // 103 行合计 2.03 MB；跨境链路（runner → us-west-2）传这块要 33–46 秒，
  // 超过 DB_QUERY_TIMEOUT_MS 的 20 秒 → 每轮第一步 listEvents 必失败，采集自锁（10-17~10-23 停更 9 天）。
  // 这个字段在本函数的所有消费方都没用到（Web 白名单 / API DTO / feed 都剥离它），
  // 去掉后同一查询 1.6 秒、69 KB。要溯源请单独按需查 raw_events。
  const result = await query(
    `
      select ${EVENT_SELECT_COLUMNS}
      from events
      where ${filters.join(" and ")}
      order by start_time asc, title asc
    `,
    params,
  );

  const { events: deduped } = await dedupeEvents(result.rows.map(rowToEvent));
  return deduped;
}

export async function publishEvents(events, { week = new Date(), rawEventIds = [], dedupeProvider = "rules" } = {}) {
  const { events: deduped, provider } = await dedupeEvents(events);
  return replaceWeekEvents(deduped, {
    week,
    rawEventIds,
    dedupeProvider: dedupeProvider || provider,
  });
}

export async function replaceWeekEvents(events, { week = new Date(), rawEventIds = [], dedupeProvider = "rules" } = {}) {
  const { startDate, endDate } = toShanghaiDayWindow(week);
  const normalized = mergeDuplicateEvents(events);

  if (!process.env.DATABASE_URL) {
    return { inserted: normalized.length, startDate, endDate, dryRun: true };
  }

  await ensureSchema();

  // 单连接事务：BEGIN/DELETE/INSERT/COMMIT 必须落在同一连接上才具备原子性
  const statements = [
    {
      sql: `delete from events where ${buildEventWindowWhereSql("$1", "$2")}`,
      params: [`${startDate}T00:00:00+08:00`, `${endDate}T23:59:59+08:00`],
    },
    ...normalized.map((event) => ({
      sql: buildEventUpsertSql(),
      params: buildEventUpsertParams(event, rawEventIds, dedupeProvider),
    })),
  ];

  await runTransaction(statements);
  return { inserted: normalized.length, startDate, endDate, dryRun: false };
}

export async function cleanupOldData(options) {
  if (!process.env.DATABASE_URL) return { dryRun: true };
  await ensureSchema();
  const cleanup = buildCleanupSql(options);
  for (const statement of cleanup.statements) {
    await query(statement.sql, statement.params);
  }
  return { dryRun: false };
}

/**
 * 读详情页缓存。过期的、没缓存的都不会出现在返回值里，由调用方重新抓。
 * @param {string[]} urls
 * @returns {Promise<Map<string, object>>} source_url → 提取结果
 */
export async function readDetailCache(urls, { ttlDays = DETAIL_CACHE_TTL_DAYS } = {}) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  const records = new Map();
  if (!getDatabaseConfig() || unique.length === 0) return records;

  // 一条 SQL 塞 266 个 URL 没问题；分批只是防止将来源池暴涨时把语句撑爆
  const CHUNK = 500;
  for (let index = 0; index < unique.length; index += CHUNK) {
    const chunk = unique.slice(index, index + CHUNK);
    const result = await query(
      `
        select source_url, image_url, venue, address, price_min, price_max, is_free, facet_provenance
        from event_detail_cache
        where source_url = any($1::text[])
          and fetched_at > now() - ($2::int * interval '1 day')
      `,
      [chunk, ttlDays],
    );
    for (const row of result.rows) records.set(row.source_url, rowToDetailRecord(row));
  }
  return records;
}

/** 批量写详情页缓存（一条语句 unnest 展开，不逐条往返跨境链路） */
export async function writeDetailCache(records) {
  const entries = records instanceof Map ? [...records] : Object.entries(records || {});
  if (!getDatabaseConfig() || entries.length === 0) return { written: 0, dryRun: true };

  const column = (pick) => entries.map(([, record]) => pick(record));
  const params = [
    entries.map(([url]) => url),
    column((record) => record.image_url ?? null),
    column((record) => record.venue || null),
    column((record) => record.address || null),
    column((record) => record.price_min ?? null),
    column((record) => record.price_max ?? null),
    column((record) => (typeof record.is_free === "boolean" ? record.is_free : null)),
    column((record) => JSON.stringify(record.facet_provenance || {})),
  ];

  await query(
    `
      insert into event_detail_cache (
        source_url, image_url, venue, address, price_min, price_max, is_free, facet_provenance, fetched_at
      )
      select t.source_url, t.image_url, t.venue, t.address, t.price_min, t.price_max,
             t.is_free, t.facet_provenance::jsonb, now()
      from unnest(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::boolean[], $8::text[]
      ) as t(source_url, image_url, venue, address, price_min, price_max, is_free, facet_provenance)
      on conflict (source_url) do update set
        image_url = excluded.image_url,
        venue = excluded.venue,
        address = excluded.address,
        price_min = excluded.price_min,
        price_max = excluded.price_max,
        is_free = excluded.is_free,
        facet_provenance = excluded.facet_provenance,
        fetched_at = now()
    `,
    params,
  );

  return { written: entries.length, dryRun: false };
}

function rowToDetailRecord(row) {
  return {
    image_url: row.image_url || null,
    venue: row.venue || "",
    address: row.address || "",
    price_min: toNullableNumber(row.price_min),
    price_max: toNullableNumber(row.price_max),
    is_free: row.is_free === null || row.is_free === undefined ? null : Boolean(row.is_free),
    facet_provenance:
      row.facet_provenance && typeof row.facet_provenance === "object" ? row.facet_provenance : {},
  };
}

// 源健康巡检：读取最近 N 次采集记录，供健康脚本聚合"持续失败/间歇失败"的源。
// 与实时探活互补——实时探活回答"现在挂没挂"，历史趋势回答"谁一直挂"。
export async function listRecentCollectionRuns({ limit = 10 } = {}) {
  if (!process.env.DATABASE_URL) return [];
  await ensureSchema();
  const result = await query(
    `
      select id, status, source_count, raw_count, published_count, failure_count,
             failures, started_at, finished_at, dedupe_provider
      from collection_runs
      order by started_at desc
      limit $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    sourceCount: row.source_count,
    rawCount: row.raw_count,
    publishedCount: row.published_count,
    failureCount: row.failure_count,
    failures: Array.isArray(row.failures) ? row.failures : [],
    startedAt: row.started_at ? toIso(row.started_at) : null,
    finishedAt: row.finished_at ? toIso(row.finished_at) : null,
    dedupeProvider: row.dedupe_provider,
  }));
}


async function query(sqlText, params = []) {
  return runQuery(sqlText, params);
}

function rowToEvent(row) {
  return {
    ...row,
    start_time: toIso(row.start_time),
    end_time: row.end_time ? toIso(row.end_time) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    // pg 把 numeric 读成字符串；null 要留成 null（Number(null) 会变 0，等于凭空说「免费」）
    price_min: toNullableNumber(row.price_min),
    price_max: toNullableNumber(row.price_max),
  };
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// 读窗口 = 「未结束」的活动。
// 判定：以结束时间（缺省回退到开始时间）的「上海日期」 >= 今天的「上海日期」。
//   - 单日活动当天全程保留（哪怕已经开场几小时），次日自然消失；
//   - 跨日演出、长期展览只要还没结束就一直在，与 start_time 多早无关。
//
// 这里**不再**按分类做「展览回看 60 天 / 高校讲座回看 30 天」：那会让已经结束的活动
// 继续出现在「未来两周」列表里，和产品定位冲突（也是"列表里混着一个月前的内容"的根因）。
// 已结束的活动如何保留由 cleanupOldData 的 7 天存储缓冲统一负责，不进展示口径。
export function buildEventWindowWhereSql(startParam, endParam) {
  return `(
    start_time <= ${endParam}
    and (coalesce(end_time, start_time) at time zone 'Asia/Shanghai')::date
        >= (${startParam}::timestamptz at time zone 'Asia/Shanghai')::date
  )`;
}

export function filterEventsForWindow(events, { startDate, endDate }) {
  return events.filter((event) => isInDateRange(event, startDate, endDate));
}

function applyFilters(events, { startDate, endDate, category, search }) {
  const lowerSearch = search?.trim().toLowerCase();
  // 没有数据库时的兜底：样本数据也要过一遍派生字段（slug / 区域 / 二级分类），
  // 否则本地开站会生成 /e/undefined 这样的链接。有库的路径由 listEvents 走 dedupeEvents。
  return filterPublishableEvents(events)
    .filter((event) => isInDateRange(event, startDate, endDate))
    .filter((event) => !category || event.category === category)
    .filter((event) => {
      if (!lowerSearch) return true;
      return `${event.title} ${event.venue} ${event.summary || ""}`.toLowerCase().includes(lowerSearch);
    })
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}
