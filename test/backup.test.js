import test from "node:test";
import assert from "node:assert/strict";

import {
  backupFileName,
  backupTag,
  buildBackupAlert,
  buildReleaseNotes,
  getBackupConfig,
  parseS3Listing,
  s3Enabled,
  selectStaleByDay,
  selectStaleTags,
  shanghaiDay,
  splitConnectionUrl,
  toSessionUrl,
  verifyDumpListing,
  withSslMode,
  REQUIRED_TABLES,
} from "../scripts/backup-db.mjs";

// 这些用例守的是「备份体系最坏的失败模式」——以为有备份，其实备份是空的/连错了库。

test("pg_dump must not go through the transaction pooler", () => {
  assert.equal(
    toSessionUrl("postgresql://postgres.ref:pw@aws-1-us-west-2.pooler.supabase.com:6543/postgres"),
    "postgresql://postgres.ref:pw@aws-1-us-west-2.pooler.supabase.com:5432/postgres",
  );
  // 已经是 session 模式的不要动
  const session = "postgresql://postgres.ref:pw@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  assert.equal(toSessionUrl(session), session);
  // 直连形态（没有 pooler 主机名）也不该被改写
  const direct = "postgresql://postgres:pw@db.ref.supabase.co:5432/postgres";
  assert.equal(toSessionUrl(direct), direct);
  assert.equal(toSessionUrl(""), "");
});

test("sslmode is added only when absent", () => {
  assert.equal(withSslMode("postgresql://a/b"), "postgresql://a/b?sslmode=require");
  assert.equal(withSslMode("postgresql://a/b?x=1"), "postgresql://a/b?x=1&sslmode=require");
  assert.equal(
    withSslMode("postgresql://a/b?sslmode=verify-full"),
    "postgresql://a/b?sslmode=verify-full",
    "已指定 sslmode 时不能覆盖用户的选择",
  );
});

test("day stamps are rendered in Asia/Shanghai", () => {
  // 2026-10-07T16:30Z 在上海已经是 10-08
  assert.equal(shanghaiDay(new Date("2026-10-07T16:30:00Z")), "2026-10-08");
  assert.equal(shanghaiDay(new Date("2026-10-07T15:30:00Z")), "2026-10-07");
  assert.equal(backupFileName("2026-10-08"), "shanghai-collector-public-2026-10-08.dump");
  assert.equal(backupTag("2026-10-08"), "db-backup-2026-10-08");
  assert.equal(backupTag("2026-10-08", "custom"), "custom-2026-10-08");
});

test("stale tag pruning keeps the newest N and ignores unrelated releases", () => {
  const tags = [
    "v1.2.0", // 正常的版本发布，绝不能删
    "db-backup-2026-10-08",
    "db-backup-2026-10-06",
    "db-backup-2026-10-04",
    "db-backup-2026-10-02",
    "release-notes",
  ];

  assert.deepEqual(selectStaleTags(tags, { keep: 2 }), ["db-backup-2026-10-04", "db-backup-2026-10-02"]);
  assert.deepEqual(selectStaleTags(tags, { keep: 4 }), []);
  assert.deepEqual(selectStaleTags(tags, { keep: 1 }), [
    "db-backup-2026-10-06",
    "db-backup-2026-10-04",
    "db-backup-2026-10-02",
  ]);
  assert.deepEqual(selectStaleTags([], { keep: 1 }), []);
  assert.deepEqual(selectStaleTags(null, { keep: 1 }), []);
});

test("stale pruning is by date, not by list order", () => {
  const entries = [
    { key: "b-2026-10-02", day: "2026-10-02" },
    { key: "b-2026-10-14", day: "2026-10-14" },
    { key: "b-2026-10-06", day: "2026-10-06" },
  ];
  assert.deepEqual(selectStaleByDay(entries, { keep: 2 }), ["b-2026-10-02"]);
});

test("s3 listing is parsed into name + day", () => {
  const listing = [
    "                           PRE db-backups/",
    "2026-10-08 06:01:22    1212471 db-backups/shanghai-collector-public-2026-10-08.dump",
    "2026-10-07 06:01:20    1198000 db-backups/shanghai-collector-public-2026-10-07.dump",
    "2026-10-07 06:01:20       4096 db-backups/README.md",
  ].join("\n");

  const parsed = parseS3Listing(listing);
  assert.equal(parsed.length, 2, "只认 .dump 结尾的对象");
  assert.deepEqual(parsed[0], {
    key: "db-backups/shanghai-collector-public-2026-10-08.dump",
    day: "2026-10-08",
  });
  assert.deepEqual(parseS3Listing(""), []);
});

test("dump verification catches a missing table", () => {
  const good = [
    "; Selected TOC Entries:",
    "215; 1259 16391 TABLE public collection_runs postgres",
    "216; 1259 16394 TABLE public events postgres",
    "220; 1259 16397 TABLE public raw_events postgres",
    "224; 1259 16400 TABLE public source_configs postgres",
  ].join("\n");
  assert.deepEqual(verifyDumpListing(good), { ok: true, missing: [] });

  const empty = "; Selected TOC Entries:\n";
  const result = verifyDumpListing(empty);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, REQUIRED_TABLES, "空 dump 必须四张表全部报缺");

  // 部分缺失（按行过滤，别用 .*\n —— 末行后面没有换行符）
  const partial = good
    .split("\n")
    .filter((line) => !line.includes("source_configs"))
    .join("\n");
  const partialResult = verifyDumpListing(partial);
  assert.equal(partialResult.ok, false);
  assert.deepEqual(partialResult.missing, ["source_configs"]);
});

test("the password never ends up in pg_dump's argv", () => {
  const { url, password } = splitConnectionUrl(
    "postgresql://postgres.zvlnemhtzxtxaaxulodg:s3cr3t%40pw@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require",
  );
  assert.equal(password, "s3cr3t@pw", "密码要 URL 解码后单独拿出来");
  assert.equal(
    url,
    "postgresql://postgres.zvlnemhtzxtxaaxulodg@aws-1-us-west-2.pooler.supabase.com:5432/postgres?sslmode=require",
  );
  assert.doesNotMatch(url, /s3cr3t/, "URL 里不能残留密码");
  assert.match(url, /sslmode=require/, "查询参数不能丢");
});

test("splitConnectionUrl handles password-less and unparseable input", () => {
  assert.deepEqual(splitConnectionUrl(""), { url: "", password: "" });
  // 没有密码：原样保留，不能凭空造一个
  const bare = splitConnectionUrl("postgresql://postgres@host:5432/postgres");
  assert.equal(bare.password, "");
  assert.match(bare.url, /^postgresql:\/\/postgres@host:5432\/postgres$/);
  // 解析不了时不要吞掉，交给 pg_dump 报错
  assert.deepEqual(splitConnectionUrl("not a url"), { url: "not a url", password: "" });
});

test("第二路：endpoint / bucket / 两把钥匙 缺任何一个都不启用", () => {
  const full = {
    endpoint: "https://cos.ap-shanghai.myqcloud.com",
    bucket: "b",
    accessKeyId: "id",
    secretAccessKey: "sec",
  };
  assert.equal(s3Enabled(full), true);
  for (const key of Object.keys(full)) {
    assert.equal(s3Enabled({ ...full, [key]: "" }), false, `缺 ${key} 时不应启用`);
  }
  assert.equal(s3Enabled({}), false);

  // endpoint 是必填而不是可选项：不填的话 aws CLI 会默认打到 AWS S3 上，
  // 那是「静默传到另一个地方」，比不传更危险 —— 这条护栏就是防这个。
  assert.equal(s3Enabled({ ...full, endpoint: "" }), false, "缺 endpoint 必须视为未启用");
});

test("第二路：provider 无关，配置项全部来自 BACKUP_S3_* 环境变量", () => {
  // 换存储只改 env、不改代码：这里用腾讯云 COS 的形态验一遍
  const cos = getBackupConfig({
    BACKUP_S3_ENDPOINT: "https://cos.ap-shanghai.myqcloud.com/",
    BACKUP_S3_BUCKET: "my-backups",
    BACKUP_S3_ACCESS_KEY_ID: "id",
    BACKUP_S3_SECRET_ACCESS_KEY: "sec",
    BACKUP_S3_REGION: "ap-shanghai",
    BACKUP_S3_PREFIX: "/backups/db/",
  });
  assert.equal(cos.s3.endpoint, "https://cos.ap-shanghai.myqcloud.com", "末尾斜杠要去掉");
  assert.equal(cos.s3.bucket, "my-backups");
  assert.equal(cos.s3.region, "ap-shanghai");
  assert.equal(cos.s3.prefix, "backups/db", "两侧斜杠都要去掉");
  assert.equal(s3Enabled(cos.s3), true);

  // 默认值
  const bare = getBackupConfig({});
  assert.equal(bare.s3.prefix, "db-backups");
  assert.equal(bare.s3.region, "auto");
  assert.equal(bare.s3.endpoint, "");
  assert.equal(s3Enabled(bare.s3), false);

  // 不再内置 Cloudflare R2 专用变量：给了 R2_* 也不该启用第二路
  assert.equal(
    s3Enabled(
      getBackupConfig({
        R2_ACCOUNT_ID: "acc",
        R2_ACCESS_KEY_ID: "id",
        R2_SECRET_ACCESS_KEY: "sec",
        R2_BUCKET: "b",
      }).s3,
    ),
    false,
    "R2_* 已废弃，不应再被识别为第二路配置",
  );
});

test("保留数与连接串回落", () => {
  assert.equal(getBackupConfig({}).keep, 30);
  assert.equal(getBackupConfig({ BACKUP_KEEP: "7" }).keep, 7);
  assert.equal(getBackupConfig({ BACKUP_KEEP: "0" }).keep, 30, "非法保留数回落默认值");
  assert.equal(getBackupConfig({ BACKUP_KEEP: "abc" }).keep, 30);
  assert.equal(
    getBackupConfig({ DATABASE_URL: "postgresql://a", BACKUP_DATABASE_URL: "postgresql://b" }).databaseUrl,
    "postgresql://b",
    "BACKUP_DATABASE_URL 优先，方便单独给备份配一个 session 串",
  );
});

test("the failure alert names the stage and stays useful without a day", () => {
  const text = buildBackupAlert({ stage: "backup-db", detail: "pg_dump: connection refused", day: "2026-10-08" });
  assert.match(text, /备份告警/);
  assert.match(text, /connection refused/);
  assert.match(text, /2026-10-08/);

  const noDay = buildBackupAlert({ stage: "x", detail: "boom" });
  assert.match(noDay, /boom/);
  assert.doesNotMatch(noDay, /本应是/);
});

test("release notes carry a usable restore recipe", () => {
  const notes = buildReleaseNotes({
    day: "2026-10-08",
    fileName: "shanghai-collector-public-2026-10-08.dump",
    bytes: 1212471,
    digest: "abc123",
    tables: REQUIRED_TABLES,
    second: "bucket/db-backups/shanghai-collector-public-2026-10-08.dump",
  });

  assert.match(notes, /数据库备份 2026-10-08/);
  assert.match(notes, /1\.16 MB/);
  assert.match(notes, /abc123/);
  assert.match(notes, /pg_restore/);
  assert.match(notes, /--schema=public/);
  assert.match(notes, /session pooler\(5432\)/, "必须提醒不用 transaction pooler");
  assert.match(notes, /对象存储/, "第二路要说清在对象存储里，不点名具体厂商");
  assert.doesNotMatch(notes, /Cloudflare/, "不该再出现厂商绑定");
  for (const table of REQUIRED_TABLES) assert.match(notes, new RegExp(`\`${table}\` ✅`));
});

test("release notes say so when the second copy is not configured", () => {
  const notes = buildReleaseNotes({ day: "2026-10-08", fileName: "f.dump", bytes: 2048, digest: "d", tables: [], second: "" });
  assert.match(notes, /第二份：未启用/);
  assert.match(notes, /BACKUP_S3_/, "要告诉用户怎么把它打开");
  for (const table of REQUIRED_TABLES) assert.match(notes, new RegExp(`\`${table}\` ❌`));
});
