#!/usr/bin/env node
// 一次性清理：把「规则修好之前」已经落库的脏行清掉
//
// 规则（events.js 的 NEWS_TITLE_PATTERNS / normalizeEventCategory、collector.js 的
// RETIRED_SOURCE_NAMES）只对**之后新采集**的行生效，存量行不会自己变好，所以要跑一次。
//
// 三类处理：
//   1. 来自已退休源的行         → 删除（赢商网系 = 商业地产资讯，不是活动）
//   2. 过不了 isEventLikeTitle  → 删除（通知类：考试大纲/评选细则/信息维护/选派通知/周报预告）
//   3. 类目归错的行             → 改类目（演出音乐 → 展览，标题以「展」结尾）
//
// 用法：
//   node scripts/cleanup-dirty-events.mjs            # 干跑（默认）
//   node scripts/cleanup-dirty-events.mjs --apply    # 实际写入，先落 JSON 备份
//
// 幂等：按当前规则重算，重复跑第二遍就是 0 条。
// 注意：只 select 窄字段。events 带 raw_event_ids / sources 两个大 jsonb，
//      select * 会把本地 Node 进程撑爆（exit 137）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { isEventLikeTitle, normalizeEventCategory } from "../src/lib/events.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

// 与 collector.js 的 RETIRED_SOURCE_NAMES 保持一致（该集合未导出，这里只列本次相关的两条）
const RETIRED_FOR_DOMAIN = new Set(["赢商网", "赢商网·华东"]);

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function toPoolerUrl(rawUrl) {
  if (!rawUrl) return "";
  if (rawUrl.includes("pooler.supabase.com")) return rawUrl;
  const url = new URL(rawUrl);
  const ref = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname)?.[1];
  if (!ref) return rawUrl;
  url.hostname = process.env.SUPABASE_POOLER_HOST || "aws-1-us-west-2.pooler.supabase.com";
  url.port = "6543";
  url.username = `postgres.${ref}`;
  return url.toString();
}

const env = loadEnv();
const pool = new pg.Pool({
  connectionString: toPoolerUrl(process.env.DATABASE_URL || env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  max: 3,
});

async function main() {
  const { rows } = await pool.query(`
    select dedupe_key, title, source_name, category, start_time, end_time
    from events
  `);
  console.log(`扫描 ${rows.length} 行`);

  const deletions = [];
  const categoryFixes = [];

  for (const row of rows) {
    if (RETIRED_FOR_DOMAIN.has(row.source_name)) {
      deletions.push({ ...row, reason: "已退休源（商业地产资讯）" });
      continue;
    }
    if (!isEventLikeTitle(row.title)) {
      deletions.push({ ...row, reason: "标题非活动（通知/公告/资讯）" });
      continue;
    }
    const category = normalizeEventCategory(row);
    if (category !== row.category) categoryFixes.push({ ...row, nextCategory: category });
  }

  console.log(`\n待删除 ${deletions.length} 行：`);
  const byReason = new Map();
  for (const row of deletions) {
    const key = `${row.reason} / ${row.source_name}`;
    byReason.set(key, (byReason.get(key) || 0) + 1);
  }
  for (const [key, count] of [...byReason.entries()].sort()) console.log(`  ${String(count).padStart(3)}  ${key}`);
  const sample = deletions.filter((row) => row.reason.includes("标题非活动")).slice(0, 8);
  if (sample.length) {
    console.log("  抽样（标题非活动）：");
    for (const row of sample) console.log(`     ${row.title.slice(0, 40)}`);
  }

  console.log(`\n待改类目 ${categoryFixes.length} 行：`);
  for (const row of categoryFixes.slice(0, 12)) {
    console.log(`  ${row.category} → ${row.nextCategory}   ${row.title.slice(0, 40)}`);
  }

  if (!APPLY) {
    console.log("\n这是干跑。确认无误后加 --apply 实际写入。");
    return;
  }
  if (!deletions.length && !categoryFixes.length) {
    console.log("\n没有需要写入的行。");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, ".workbuddy", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `dirty-events-cleanup-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ deletions, categoryFixes }, null, 2));
  console.log(`\n已备份 → ${path.relative(ROOT, backupFile)}`);

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of deletions) {
      await client.query("delete from events where dedupe_key = $1", [row.dedupe_key]);
    }
    for (const row of categoryFixes) {
      await client.query("update events set category = $1, updated_at = now() where dedupe_key = $2", [
        row.nextCategory,
        row.dedupe_key,
      ]);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const after = await pool.query(
    "select count(*)::int as total, count(*) filter (where category = '展览')::int as exhibitions from events",
  );
  console.log(`\n已删除 ${deletions.length} 行、改类目 ${categoryFixes.length} 行。`);
  console.log(`当前 events：${after.rows[0].total} 行（展览 ${after.rows[0].exhibitions} 行）。`);
}

main()
  .catch((error) => {
    console.error("清理失败：", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
