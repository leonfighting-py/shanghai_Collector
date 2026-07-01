import pg from "pg";

import { dedupeEvents } from "./dedupe.js";
import { isInDateRange, mergeDuplicateEvents, toShanghaiDayWindow } from "./events.js";
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
  `;
}

export function buildCleanupSql({ eventRetentionDays = 60, runRetentionDays = 90 } = {}) {
  return {
    statements: [
      {
        sql: "delete from raw_events where start_time is not null and start_time < now() - ($1::int * interval '1 day')",
        params: [eventRetentionDays],
      },
      {
        sql: "delete from events where start_time < now() - ($1::int * interval '1 day')",
        params: [eventRetentionDays],
      },
      {
        sql: "delete from collection_runs where started_at < now() - ($1::int * interval '1 day')",
        params: [runRetentionDays],
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

let pool;

export async function ensureSchema() {
  if (!process.env.DATABASE_URL) return;
  await query(buildSchemaSql());
  await query(`
    alter table events add column if not exists summary text not null default '';
    alter table raw_events add column if not exists summary text;
  `);
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
          source_name, source_url, raw_payload, publishable, rejection_reason
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
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
      ],
    );
    rawEventIds.push(result.rows[0].id);
  }

  return { inserted: events.length, dryRun: false, rawEventIds };
}

export async function listEvents({ week, category, search } = {}) {
  const { startDate, endDate } = toShanghaiDayWindow(week || new Date());

  if (!process.env.DATABASE_URL) {
    return applyFilters(SAMPLE_EVENTS, { startDate, endDate, category, search });
  }

  await ensureSchema();
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

  const result = await query(
    `
      select title, start_time, end_time, venue, category, signup_url, source_name,
             source_url, dedupe_key, sources, raw_event_ids, dedupe_provider, summary,
             created_at, updated_at
      from events
      where ${filters.join(" and ")}
      order by start_time asc, title asc
    `,
    params,
  );

  return result.rows.map(rowToEvent);
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
  await query("begin");
  try {
    await query("delete from events where start_time >= $1 and start_time <= $2", [
      `${startDate}T00:00:00+08:00`,
      `${endDate}T23:59:59+08:00`,
    ]);

    for (const event of normalized) {
      await query(
        `
          insert into events (
            title, start_time, end_time, venue, category, signup_url, source_name,
            source_url, dedupe_key, sources, raw_event_ids, dedupe_provider, summary, updated_at
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12, $13, now())
          on conflict (dedupe_key) do update set
            title = excluded.title,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            venue = excluded.venue,
            category = excluded.category,
            signup_url = excluded.signup_url,
            source_name = excluded.source_name,
            source_url = excluded.source_url,
            sources = excluded.sources,
            raw_event_ids = excluded.raw_event_ids,
            dedupe_provider = excluded.dedupe_provider,
            summary = excluded.summary,
            updated_at = now()
        `,
        [
          event.title,
          event.start_time,
          event.end_time,
          event.venue,
          event.category,
          event.signup_url,
          event.source_name,
          event.source_url,
          event.dedupe_key,
          JSON.stringify(event.sources || []),
          JSON.stringify(rawEventIds),
          dedupeProvider,
          event.summary || "",
        ],
      );
    }

    await query("commit");
    return { inserted: normalized.length, startDate, endDate, dryRun: false };
  } catch (error) {
    await query("rollback");
    throw error;
  }
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

function databaseSsl() {
  const url = process.env.DATABASE_URL ?? "";
  if (url.includes("render.com") || url.includes("supabase.co") || url.includes("pooler.supabase.com")) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

async function query(sqlText, params = []) {
  pool ||= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: databaseSsl(),
  });

  return pool.query(sqlText, params);
}

function rowToEvent(row) {
  return {
    ...row,
    start_time: toIso(row.start_time),
    end_time: row.end_time ? toIso(row.end_time) : null,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
  };
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function buildEventWindowWhereSql(startParam, endParam) {
  return `(
    (start_time >= ${startParam} and start_time <= ${endParam})
    or (
      category = '展览'
      and start_time >= (${startParam}::timestamptz - interval '60 days')
      and start_time <= ${endParam}
    )
  )`;
}

export function filterEventsForWindow(events, { startDate, endDate }) {
  return events.filter((event) => isInDateRange(event, startDate, endDate));
}

function applyFilters(events, { startDate, endDate, category, search }) {
  const lowerSearch = search?.trim().toLowerCase();
  return filterEventsForWindow(events, { startDate, endDate })
    .filter((event) => !category || event.category === category)
    .filter((event) => {
      if (!lowerSearch) return true;
      return `${event.title} ${event.venue} ${event.summary || ""}`.toLowerCase().includes(lowerSearch);
    })
    .sort((left, right) => new Date(left.start_time).getTime() - new Date(right.start_time).getTime());
}
