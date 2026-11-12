#!/usr/bin/env node
// 数据库备份：pg_dump → 校验 → 上传 GitHub Release（必选）+ 对象存储（可选）→ 滚动清理
//
// 为什么要有它（2026-10-07/08 事故）：
//   Supabase 项目被暂停后，生产数据整体不可达。当时的补救是「重跑采集」——
//   events 表确实可以由采集完全重建，但 raw_events 原始层和 collection_runs 历史运行
//   记录丢了就是丢了，这两样没有第二份。所以备份的价值不只是防灾难，
//   更是让「回滚到昨天」成为可能（比如某次采集把窗口写脏了）。
//
// 设计约束（改动前请先读）：
//   · 只备份 public schema。auth / storage 等由 Supabase 托管，重建项目时自动生成；
//     备份它们只会让文件从 1.2 MB 涨到 34 MB，还把恢复路径搞复杂。
//   · dump 走 session pooler（5432）。transaction pooler（6543）实测也能跑通，
//     但 Supabase 官方对 pg_dump 的建议是直连或 session 模式，没必要赌。
//   · 上传成功 ≠ 备份可用。必须用 `pg_restore --list` 确认确实列出了那四张表，
//     否则会出现「以为有备份，其实备份是空的」——这是备份体系里最坏的失败模式。
//   · 第二路是**provider 无关**的：任何兼容 S3 协议的对象存储都行
//     （腾讯云 COS / 阿里云 OSS / Backblaze B2 / AWS S3 / MinIO …）。
//     5 个 BACKUP_S3_* 变量配齐就自动启用，不齐就只走 Release，**不需要改代码**。
//     ⚠️ 2026-10-08 起**不再内置 Cloudflare R2 的专用配置**：Cloudflare 侧当时正因
//     Worker 顶在 CPU 上限上而间歇性 503，不适合再把备份托付给它。要接 R2 的话，
//     它本身也兼容 S3，按通用变量填即可（endpoint 形如
//     https://<account>.r2.cloudflarestorage.com）。
//   · 连接串拆成两半：不含密码的 URL 走 `-d` 参数、密码走 PGPASSWORD 环境变量。
//     密码绝不能进命令行参数（会出现在进程列表里）；也不用 PGDATABASE，
//     因为实测 Supabase 的 postgres 镜像 entrypoint 会让它在 pg_dump 进程里失效。
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { sendFeishuText, shanghaiTime } from "../src/lib/alerting.js";

const run = promisify(execFile);

// 这四张表缺任何一张，备份都不算数
export const REQUIRED_TABLES = ["events", "raw_events", "collection_runs", "source_configs"];
const DEFAULT_KEEP = 30;
const DEFAULT_PREFIX = "db-backup";

function clip(text, max = 300) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export function getBackupConfig(env = process.env) {
  const keep = Number(env.BACKUP_KEEP ?? DEFAULT_KEEP);
  return {
    databaseUrl: env.BACKUP_DATABASE_URL || env.DATABASE_URL || "",
    outDir: env.BACKUP_DIR || ".backup",
    keep: Number.isFinite(keep) && keep >= 1 ? Math.floor(keep) : DEFAULT_KEEP,
    releasePrefix: env.BACKUP_RELEASE_PREFIX || DEFAULT_PREFIX,
    repo: env.GITHUB_REPOSITORY || "",
    pgDump: env.PG_DUMP_BIN || "pg_dump",
    pgRestore: env.PG_RESTORE_BIN || "pg_restore",
    aws: env.AWS_BIN || "aws",
    dryRun: env.BACKUP_DRY_RUN === "1",
    // 第二路：任何兼容 S3 协议的对象存储。不绑定具体厂商 —— 换存储只改 env，不改代码。
    s3: {
      endpoint: (env.BACKUP_S3_ENDPOINT || "").replace(/\/+$/, ""),
      bucket: env.BACKUP_S3_BUCKET || "",
      accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID || "",
      secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY || "",
      // 有些厂商（COS/OSS）要求区域参与签名；不填时用 auto，对多数 S3 兼容实现无害
      region: env.BACKUP_S3_REGION || "auto",
      prefix: (env.BACKUP_S3_PREFIX || "db-backups").replace(/^\/+|\/+$/g, ""),
    },
    webhookUrl: env.FEISHU_WEBHOOK_URL || "",
    secret: env.FEISHU_WEBHOOK_SECRET || "",
  };
}

// endpoint / bucket / 两把钥匙 齐了才算「第二路可用」。
// 故意把 endpoint 也列为必填：不填的话 aws CLI 会默认打到 AWS S3 上，
// 那就变成「静默传到另一个地方」，比不传更危险。
export function s3Enabled(s3 = {}) {
  return Boolean(s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey);
}

export function shanghaiDay(date = new Date()) {
  // en-CA 的日期格式就是 YYYY-MM-DD，省掉手工补零
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// pg_dump 需要会话级语义（长事务 + 导出的快照）。transaction pooler 每个事务可能落到
// 不同后端，官方建议不要用它做 dump；统一换到同主机的 session 模式。
export function toSessionUrl(url) {
  if (!url) return url;
  return String(url).replace(/(\.pooler\.supabase\.com):6543\b/, "$1:5432");
}

export function withSslMode(url) {
  if (!url) return url;
  if (/[?&]sslmode=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

// 把连接串拆成「不含密码的 URL」+「密码」两份。
//
// 为什么这么做：pg_dump 读 PGDATABASE 环境变量也能连，但实测 Supabase 的 postgres
// 镜像 entrypoint 会让 PGDATABASE 在 pg_dump 进程里失效（容器里跑 bash 能读到、
// 跑 pg_dump 读不到），说明这条路径不可靠。改用 `-d <url>` 显式传参最稳，
// 但绝不能把密码放进命令行 —— 参数会出现在进程列表里。
// 所以拆开：URL 走参数（`ps` 里安全），密码走 PGPASSWORD 环境变量。
export function splitConnectionUrl(url) {
  if (!url) return { url: "", password: "" };
  try {
    const parsed = new URL(url);
    const password = decodeURIComponent(parsed.password || "");
    parsed.password = "";
    return { url: parsed.toString(), password };
  } catch {
    // 解析不了就原样返回，让 pg_dump 自己去报错，别在这里掩盖问题
    return { url, password: "" };
  }
}

export function backupFileName(day) {
  return `shanghai-collector-public-${day}.dump`;
}

export function backupTag(day, prefix = DEFAULT_PREFIX) {
  return `${prefix}-${day}`;
}

// 按日期倒序保留最近 keep 份，返回应删除的那些。只认自己前缀的 tag，
// 不能误删仓库里正常的版本发布。
export function selectStaleTags(existingTags, { prefix = DEFAULT_PREFIX, keep = DEFAULT_KEEP } = {}) {
  const pattern = new RegExp(`^${prefix}-(\\d{4}-\\d{2}-\\d{2})$`);
  const mine = [];
  for (const tag of existingTags || []) {
    const match = pattern.exec(String(tag));
    if (match) mine.push({ key: String(tag), day: match[1] });
  }
  return selectStaleByDay(mine, { keep });
}

// entries: [{ key, day }] → 按日期倒序保留最近 keep 个，返回其余的 key
export function selectStaleByDay(entries, { keep = DEFAULT_KEEP } = {}) {
  const sorted = [...(entries || [])].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  return sorted.slice(keep).map((entry) => entry.key);
}

// `aws s3 ls` 的输出形如：
//   2026-10-08 06:01:22    1212471 db-backups/shanghai-collector-public-2026-10-08.dump
export function parseS3Listing(listing) {
  const entries = [];
  for (const line of String(listing || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = /(\d{4}-\d{2}-\d{2})\.dump$/.exec(trimmed);
    if (!match) continue;
    entries.push({ key: trimmed.split(/\s+/).pop(), day: match[1] });
  }
  return entries;
}

// `pg_restore --list` 的输出片段：
//   216; 1259 16389 TABLE public events postgres
export function verifyDumpListing(listing, requiredTables = REQUIRED_TABLES) {
  const text = String(listing || "");
  const missing = requiredTables.filter(
    (table) => !new RegExp(`TABLE public ${table}\\b`).test(text),
  );
  return { ok: missing.length === 0, missing };
}

export function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function buildBackupAlert({ stage, detail, day }) {
  return [
    `【上海活动雷达｜备份告警】${shanghaiTime()}`,
    `阶段：${stage}`,
    `详情：${clip(detail)}`,
    "",
    day ? `本应是 ${day} 的备份。` : "",
    "→ 当前没有新的可用备份。若持续失败，请尽快手动跑一次并检查 DATABASE_URL。",
  ]
    .filter(Boolean)
    .join("\n");
}

async function gh(args, { config } = {}) {
  const full = config?.repo ? [...args, "--repo", config.repo] : args;
  return run("gh", full, { maxBuffer: 32 * 1024 * 1024 });
}

function s3Args(config, tail) {
  return ["--endpoint-url", config.s3.endpoint, ...tail];
}

function s3Env(config) {
  return {
    AWS_ACCESS_KEY_ID: config.s3.accessKeyId,
    AWS_SECRET_ACCESS_KEY: config.s3.secretAccessKey,
    AWS_DEFAULT_REGION: config.s3.region,
  };
}

export function buildReleaseNotes({ day, fileName, bytes, digest, tables, second }) {
  const tableList = REQUIRED_TABLES.map((t) =>
    tables.includes(t) ? `- \`${t}\` ✅` : `- \`${t}\` ❌`,
  ).join("\n");

  return [
    `# 数据库备份 ${day}`,
    "",
    `- 文件：\`${fileName}\`（${(bytes / 1024 / 1024).toFixed(2)} MB，pg_dump custom 格式）`,
    `- SHA-256：\`${digest}\``,
    `- 范围：\`public\` schema（Supabase 自有的 auth/storage 等不在内，重建项目时会自动生成）`,
    second ? `- 第二份：对象存储 \`${second}\`` : `- 第二份：未启用（\`BACKUP_S3_*\` 未配置，本次只有这一份）`,
    "",
    "## 包含的表",
    "",
    tableList,
    "",
    "## 怎么恢复",
    "",
    "```bash",
    "# 1. 下载本页的 .dump 文件",
    `# 2. 找一个 PostgreSQL 17 客户端（服务器是 PG 17，客户端版本不能更低）`,
    `pg_restore --dbname "<新项目的 session pooler 连接串>" \\`,
    `  --schema=public --no-owner --no-privileges --clean --if-exists ${fileName}`,
    "# 注意：pg_restore 也要走 session pooler(5432) 或直连，不要用 transaction pooler(6543)",
    "# 3. 验证",
    `PGDATABASE="<连接串>" psql -c "select count(*) from events"`,
    "```",
    "",
    "> 只想恢复某一张表：`pg_restore -d \"<连接串>\" -t events <文件>`",
    "> 想先看看里面有什么：`pg_restore --list <文件>`",
    "",
    `_由 \`.github/workflows/backup.yml\` 自动生成。_`,
  ].join("\n");
}

async function main() {
  const config = getBackupConfig();
  const day = shanghaiDay();
  const fileName = backupFileName(day);
  const tag = backupTag(day, config.releasePrefix);
  const outPath = join(config.outDir, fileName);

  try {
    if (!config.databaseUrl) throw new Error("DATABASE_URL / BACKUP_DATABASE_URL 未配置");

    // ① 建目录
    mkdirSync(config.outDir, { recursive: true });

    // ② 先把客户端版本打出来。pg_dump 不向前兼容，服务器是 PG 17 而客户端是 16 时
    //    会直接中止；日志里有这一行，排查时就不用猜了（10-08 第一次跑就踩了这个）。
    const { stdout: pgVersion } = await run(config.pgDump, ["--version"], { maxBuffer: 1024 * 1024 });
    console.log(`[backup] ${pgVersion.trim()}`);

    // ③ dump。URL 走参数、密码走 PGPASSWORD，密码不进命令行
    const { url: connectUrl, password } = splitConnectionUrl(
      withSslMode(toSessionUrl(config.databaseUrl)),
    );
    console.log(`[backup] 开始 dump（schema=public，session 模式）→ ${outPath}`);
    await run(
      config.pgDump,
      [
        "-d", connectUrl,
        "-n", "public",
        "--format=custom",
        "--compress=9",
        "--no-owner",
        "--no-privileges",
        "-f", outPath,
      ],
      { env: { ...process.env, PGPASSWORD: password }, maxBuffer: 32 * 1024 * 1024 },
    );

    // ④ 基本体检：文件得存在且不像空壳
    const bytes = statSync(outPath).size;
    if (bytes < 1024) throw new Error(`dump 只有 ${bytes} 字节，明显不对`);

    // ⑤ 关键校验：清单里必须真的有那四张表
    const { stdout: listing } = await run(config.pgRestore, ["--list", outPath], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const check = verifyDumpListing(listing);
    if (!check.ok) {
      throw new Error(`dump 校验失败，缺表：${check.missing.join(", ")}`);
    }
    console.log(`[backup] 校验通过：${(bytes / 1024 / 1024).toFixed(2)} MB，四张表齐全`);

    const digest = sha256(outPath);
    const secondTarget = s3Enabled(config.s3)
      ? `${config.s3.bucket}/${config.s3.prefix}/${fileName}`
      : "";

    if (config.dryRun) {
      console.log(`[backup] --dry-run：跳过上传与清理。sha256=${digest}`);
      return { ok: true, dryRun: true, fileName, bytes, digest };
    }

    // ⑥ 第一路：GitHub Release（永久保留，不像 Artifacts 90 天过期）
    const notesPath = join(config.outDir, `${tag}.notes.md`);
    writeFileSync(
      notesPath,
      buildReleaseNotes({
        day,
        fileName,
        bytes,
        digest,
        tables: REQUIRED_TABLES,
        second: secondTarget,
      }),
    );
    await gh(["release", "create", tag, outPath, "--title", `数据库备份 ${day}`, "--notes-file", notesPath], {
      config,
    });
    console.log(`[backup] 已上传 GitHub Release：${tag}`);

    // ⑦ 第二路：对象存储（可选，provider 无关）。失败不影响第一路，但要喊出来
    if (s3Enabled(config.s3)) {
      const env = { ...process.env, ...s3Env(config) };
      try {
        await run(
          config.aws,
          s3Args(config, ["s3", "cp", outPath, `s3://${config.s3.bucket}/${config.s3.prefix}/${fileName}`]),
          { env, maxBuffer: 32 * 1024 * 1024 },
        );
        console.log(`[backup] 已上传第二路：s3://${secondTarget}（${config.s3.endpoint}）`);

        const { stdout: lsOut } = await run(
          config.aws,
          s3Args(config, ["s3", "ls", `s3://${config.s3.bucket}/${config.s3.prefix}/`]),
          { env, maxBuffer: 32 * 1024 * 1024 },
        );
        for (const key of selectStaleByDay(parseS3Listing(lsOut), { keep: config.keep })) {
          await run(config.aws, s3Args(config, ["s3", "rm", `s3://${config.s3.bucket}/${key}`]), { env });
          console.log(`[backup] 第二路清理旧备份：${key}`);
        }
      } catch (error) {
        console.error(`[backup] 第二路上传失败（第一路 Release 已成功，不中断）：${error.message}`);
      }
    } else {
      console.log("[backup] 第二路未启用（BACKUP_S3_* 未配齐），本次只写 GitHub Release");
    }

    // ⑧ 滚动清理：只删自己前缀的 tag，保留最近 keep 份
    const { stdout: tagList } = await gh(
      ["release", "list", "--limit", "200", "--json", "tagName", "--jq", ".[].tagName"],
      { config },
    );
    for (const stale of selectStaleTags(
      tagList.split("\n").map((t) => t.trim()).filter(Boolean),
      { prefix: config.releasePrefix, keep: config.keep },
    )) {
      await gh(["release", "delete", stale, "--yes", "--cleanup-tag"], { config });
      console.log(`[backup] 清理旧 Release：${stale}`);
    }

    console.log(`[backup] 完成：${fileName}（${bytes} 字节，sha256=${digest.slice(0, 16)}…）`);
    return { ok: true, fileName, bytes, digest, tag, second: secondTarget };
  } catch (error) {
    // pg_dump 会在连接前就把文件建出来，失败后留下一个 0 字节空壳。
    // 必须清掉 —— 否则它看起来像一份备份，这是最容易被误判的情况。
    try {
      rmSync(outPath, { force: true });
    } catch {
      /* 清理失败无所谓，不影响告警 */
    }

    console.error(`[backup] 失败：${error.message}`);
    if (config.webhookUrl) {
      try {
        const sent = await sendFeishuText(
          buildBackupAlert({ stage: "backup-db", detail: error.message, day }),
          { webhookUrl: config.webhookUrl, secret: config.secret },
        );
        console.error(`[backup] 告警 ${sent.sent ? "已推送" : `未推送（${sent.reason}）`}`);
      } catch (alertError) {
        console.error(`[backup] 告警推送本身失败：${alertError.message}`);
      }
    }
    throw error;
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const result = await main();
  if (!result?.ok) process.exitCode = 1;
}
