// 期刊归档：每次发布成功后存一份当期快照。
//
// 为什么存快照而不是存活动 id：cleanup 会按结束时间删 events，
// 归档要能活过清理。所以这里把卡片要用的字段整份抄一份，
// 往期页面**不查 events 表**，活动删光了照样能看。

import { buildHomeViewModel } from "./home-view-model.js";
import { getDatabaseConfig, runQuery } from "./db-pool.js";

// Worker 里没有 process.env.DATABASE_URL（连接串来自 Hyperdrive 绑定），
// 判「有没有库」要以 getDatabaseConfig() 为准，否则线上会静默返回空列表。
function hasDatabase() {
  return Boolean(getDatabaseConfig());
}

/** 快照里每条推荐要留的字段（渲染卡片够用即可，别整条塞进去） */
export const ISSUE_HIGHLIGHT_FIELDS = [
  "slug",
  "title",
  "start_time",
  "end_time",
  "venue",
  "category",
  "image_url",
  "summary",
];

/**
 * 由当期活动算出快照。复用首页的视图模型，保证「归档里看到的」和「当天下架前首页看到的」一致。
 * @returns {{issue_date: string, label: string, highlights: object[], stats: object}}
 */
export function buildIssueSnapshot(events, { now = new Date(), highlightLimit = 5 } = {}) {
  // 存 5 条：首页只展示 3 条，但第 17 天的分享海报要 5 条，归档里多存两条不吃亏
  const view = buildHomeViewModel(events, { now, highlightLimit });
  const highlights = view.highlights.map((event) => {
    const row = {};
    for (const field of ISSUE_HIGHLIGHT_FIELDS) row[field] = event[field] ?? null;
    return row;
  });
  return {
    issue_date: view.today,
    label: view.issueLabel,
    highlights,
    stats: view.stats,
  };
}

/** 同一天重复采集时覆盖，不产生第二期 */
export async function saveIssue(snapshot) {
  if (!hasDatabase()) return { saved: false, dryRun: true };
  await runQuery(
    `
      insert into issues (issue_date, label, highlights, stats)
      values ($1::date, $2, $3::jsonb, $4::jsonb)
      on conflict (issue_date) do update set
        label = excluded.label,
        highlights = excluded.highlights,
        stats = excluded.stats
    `,
    [snapshot.issue_date, snapshot.label, JSON.stringify(snapshot.highlights), JSON.stringify(snapshot.stats)],
  );
  return { saved: true, dryRun: false };
}

/** 归档列表：新到旧。只取渲染列表要用的几列，不拉整份 highlights */
export async function listIssues({ limit = 60 } = {}) {
  if (!hasDatabase()) return [];
  const result = await runQuery(
    `
      select to_char(issue_date, 'YYYY-MM-DD') as issue_date, label, stats,
             jsonb_array_length(highlights) as highlight_count
      from issues
      order by issue_date desc
      limit $1
    `,
    [limit],
  );
  return result.rows.map((row) => ({
    date: row.issue_date,
    label: row.label,
    stats: row.stats || {},
    highlightCount: row.highlight_count,
  }));
}

/** 单期。查不到返回 null，由页面决定 404 */
export async function getIssue(date) {
  if (!hasDatabase()) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const result = await runQuery(
    "select issue_date, label, highlights, stats, created_at from issues where issue_date = $1::date",
    [date],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    date: date,
    label: row.label,
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    stats: row.stats || {},
    createdAt: row.created_at,
  };
}
