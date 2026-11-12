#!/usr/bin/env node
// 一次性回填：给「长期活动」补齐 end_time（约 3 个月）
//
// 背景：
//   src/lib/events.js 的 filterPublishableEvents 已经接上 inferEventEndTime，
//   但那只对「之后新采集」的事件生效。库里存量那些 end_time is null 的展览 /
//   驻场演出不会自己变好 —— 它们会被读窗口（coalesce(end_time, start_time)）
//   当成「已结束」挡在门外，必须回填一次。
//
// 用法：
//   node scripts/backfill-end-time.mjs            # 干跑，只打印将要改哪些行（默认）
//   node scripts/backfill-end-time.mjs --apply    # 实际写入，写入前先落 JSON 备份
//
// 幂等：只处理 end_time is null 的行，重复跑不会二次修改。
// 注意：只 select 窄字段。events 表带 raw_event_ids / sources 两个大 jsonb，
//       select * 会把本地 Node 进程撑爆（exit 137），这是踩过的坑。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { inferEventEndTime, isLongRunningEvent } from "../src/lib/event-duration.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

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

// 直连地址（db.<ref>.supabase.co:5432）在部分网络下是 IPv6-only，连不上；
// 统一改写成 Supabase pooler（IPv4）。区域由 SUPABASE_POOLER_HOST 覆盖。
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
const connectionString = toPoolerUrl(process.env.DATABASE_URL || env.DATABASE_URL);
if (!connectionString) {
  console.error("缺少 DATABASE_URL（.env 或环境变量）");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 3 });

const SELECT_NULL_END = `
  select dedupe_key, title, category, start_time, end_time
  from events
  where end_time is null
  order by category, start_time
`;

function shanghaiDay(value) {
  return new Date(new Date(value).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

async function main() {
  const { rows } = await pool.query(SELECT_NULL_END);
  console.log(`end_time is null 的行：${rows.length}`);

  const changes = [];
  const skipped = [];
  for (const row of rows) {
    const event = {
      title: row.title,
      category: row.category,
      start_time: row.start_time,
      end_time: row.end_time,
    };
    const next = inferEventEndTime(event);
    if (next && next !== event.end_time) changes.push({ row, next, longRunning: isLongRunningEvent(event) });
    else skipped.push(row);
  }

  const byCategory = new Map();
  for (const { row } of changes) {
    const key = `${row.category} / ${isLongRunningEvent(row) ? "长期" : "单场"}`;
    byCategory.set(key, (byCategory.get(key) || 0) + 1);
  }
  console.log(`\n将回填 ${changes.length} 行，跳过 ${skipped.length} 行（单场活动保持 null）`);
  for (const [key, count] of [...byCategory.entries()].sort()) {
    console.log(`  ${key.padEnd(16)} ${count}`);
  }

  console.log("\n样例（前 30 行）：");
  for (const { row, next } of changes.slice(0, 30)) {
    const span = Math.round((new Date(next) - new Date(row.start_time)) / 86400000);
    console.log(
      `  [${row.category}] ${String(row.title).slice(0, 34).padEnd(36)} ` +
        `${shanghaiDay(row.start_time)} → ${shanghaiDay(next)} (+${span}d)`,
    );
  }

  if (!APPLY) {
    console.log("\n这是干跑。确认无误后加 --apply 实际写入。");
    return;
  }
  if (!changes.length) {
    console.log("\n没有需要写入的行。");
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(ROOT, ".workbuddy", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `end-time-backfill-${stamp}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(rows, null, 2));
  console.log(`\n已备份 ${rows.length} 行 → ${path.relative(ROOT, backupFile)}`);

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const { row, next } of changes) {
      await client.query("update events set end_time = $1, updated_at = now() where dedupe_key = $2", [
        next,
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

  const after = await pool.query("select count(*)::int as total, count(end_time)::int as with_end from events");
  console.log(`\n已写入 ${changes.length} 行。`);
  console.log(`当前 events：${after.rows[0].total} 行，其中 ${after.rows[0].with_end} 行有 end_time。`);
}

main()
  .catch((error) => {
    console.error("回填失败：", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
