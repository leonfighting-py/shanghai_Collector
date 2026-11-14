// 部署前迁移：把 ensureSchema 的建表/加列推到线上库，并验证四张核心表都在。
//
// 为什么必须存在（见 docs/plans/2026-11-11 迭代方案 WP0-B）：
//   推到 main 会立刻部署 Web，而加列要等下一轮采集才会执行 ensureSchema —— 中间这段
//   时间窗里，读查询一旦引用了"还不存在的列"，首页会直接报错。deploy.yml 在构建
//   Worker 之前先跑本脚本，把窗口关掉。
//   backup.yml / cleanup.yml 已在 GitHub 托管 runner 上用同一个 secret 连库，网络是通的。
//
// ensureSchema 的语句全部是 create ... if not exists / add column if not exists，
// 幂等，重复执行没有副作用；后续工作包新增的 DDL 必须保持这个性质。
//
// 用法：node scripts/migrate.mjs（package.json 里的 npm run migrate 会自动 --env-file=.env）
import { ensureSchema } from "../src/lib/repository.js";
import { runQuery } from "../src/lib/db-pool.js";

// 没有连接串时以非零码退出：迁移脚本的职责就是"确保库结构就绪"，
// 静默跳过会让"以为迁移过了"和"根本没跑"变得无法区分（写完必验原则）。
if (!process.env.DATABASE_URL) {
  console.error("[migrate] 缺少 DATABASE_URL，迁移未执行。请配置环境变量后重跑（不能静默跳过）。");
  process.exit(1);
}

// 锁等待上限与重试：DDL 拿不到表锁时不排队（排队会把首页的读一起堵住，见 repository.js 的 ensureSchema 注释），
// 而是 3 秒放弃、隔一会儿再试；几次都拿不到就让部署失败，好过让线上卡住。
// 等锁期间普通读仍会被堵住，最多堵这么久，所以上限宁短勿长（实测 2 秒上限时读只多等了 0.5 秒）。
const LOCK_TIMEOUT_MS = Number(process.env.MIGRATE_LOCK_TIMEOUT_MS) || 3_000;
const MAX_ATTEMPTS = 4;
const RETRY_WAIT_MS = 15_000;

console.log(`[migrate] 开始应用 schema（幂等，可重复执行；锁等待上限 ${LOCK_TIMEOUT_MS} ms）...`);
for (let attempt = 1; ; attempt += 1) {
  try {
    await ensureSchema({ lockTimeoutMs: LOCK_TIMEOUT_MS });
    break;
  } catch (error) {
    // 55P03 = lock_not_available：表正被长读/长事务占着（备份、采集），过一会儿通常就让出来了
    if (error?.code !== "55P03" || attempt >= MAX_ATTEMPTS) {
      console.error(`[migrate] 失败（第 ${attempt} 次）：${error?.message || error}`);
      await runQuery.localPool?.end().catch(() => {});
      process.exit(1);
    }
    console.warn(`[migrate] 第 ${attempt} 次没拿到表锁（有长查询占着），${RETRY_WAIT_MS / 1000} 秒后重试...`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_WAIT_MS));
  }
}

// 验证：不满足"四张核心表都在"就判失败。守的是备份体系同款的最坏模式——
// "以为迁移成功了，其实什么都没建成"。
const EXPECTED_TABLES = ["collection_runs", "events", "raw_events", "source_configs"];
const result = await runQuery(
  "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
);
const tables = result.rows.map((row) => row.table_name);
const missing = EXPECTED_TABLES.filter((table) => !tables.includes(table));
if (missing.length > 0) {
  console.error(`[migrate] 迁移后仍缺表：${missing.join(", ")}`);
  await runQuery.localPool?.end().catch(() => {});
  process.exit(1);
}

console.log(`[migrate] 完成。public 下共 ${tables.length} 张表：${tables.join(", ")}`);

// 显式关掉本地连接池，让进程干净退出（读路径的 runQuery 会缓存池，不关会挂着）
await runQuery.localPool?.end().catch(() => {});
