# 数据库故障诊断与恢复手册

> 2026-10-07 生产事故的产物。故障本身需要控制台权限才能修，这份文档负责把
> 「定位」和「恢复」压缩成照着敲的步骤，避免下次再花两天才发现。

## 1. 故障长什么样

三处会同时变红，看到任意一条就该来查数据库：

| 观察点 | 现象 |
| --- | --- |
| `Collect Events` workflow | 失败，日志里有 `error: (ENOTFOUND) tenant/user postgres.<ref> not found` |
| `Cleanup Old Data` workflow | 失败，同样的报错 |
| 生产 `https://news.leoncoooolest.com/api/events` | **HTTP 500 且 0 字节**（注意不是首页白屏 —— 首页是预渲染的，会照常 200，内容却是空的） |
| 微信小程序首页 | 空列表 / 报错 |

## 2. 五分钟定位

```bash
# ① 生产 API 是否还活着
curl -s -o /dev/null -w "http=%{http_code} size=%{size_download}\n" \
  https://news.leoncoooolest.com/api/events
# 期望 200 + 一个非零 size；500/0 → 数据库侧有问题

# ② 项目域名在权威 DNS 上还在不在（1.1.1.1 走 DoH，绕开本机 DNS）
curl -s -H 'accept: application/dns-json' \
  "https://1.1.1.1/dns-query?name=db.<project-ref>.supabase.co&type=A"
# Status 0 = 记录存在；Status 3 = NXDOMAIN，域名已不在

# ③ 真实解析对照（本机 resolver 可能被污染）
dig +short db.<project-ref>.supabase.co @1.1.1.1

# ④ 项目是否还有数据在返回（REST 端点，需要 anon key）
curl -s -o /dev/null -w "%{http_code}\n" https://<project-ref>.supabase.co/rest/v1/
```

当前这个项目的 ref 是 `zvlnemhtzxtxaaxulodg`。

## 3. 判读：三种状态

| 域名解析 | pooler 报错 | 控制台状态 | 结论 | 能不能救 |
| --- | --- | --- | --- | --- |
| NXDOMAIN | `tenant/user ... not found` | `Paused` 徽标 | **被暂停** | 能，数据完好 |
| NXDOMAIN | `tenant/user ... not found` | 显示正常 / Unhealthy | **控制面状态不同步** | 能，需提工单 |
| NXDOMAIN | `tenant/user ... not found` | 列表里没有了 | **已被删除** | 不能，只能重建 |

⚠️ **关键坑：NXDOMAIN 不能区分「暂停」和「删除」。**
Supabase 官方故障排查文档明确写着 —— 暂停的项目会停止提供其主机名，
所以连接会解析成 NXDOMAIN，**即使项目仍然存在**。所以别看到 NXDOMAIN 就下结论说项目没了，
必须打开控制台看项目列表里的状态徽标。

## 4. 恢复路径 A：项目只是被暂停（大概率是这个）

1. 打开 https://supabase.com/dashboard/projects
2. 找到项目卡片上的 `Paused` 徽标，点进去
3. 点 **Restore project** → 确认 → 等 2–5 分钟
4. 数据完好，**连接串不会变**，所以下面第 6 节三处配置都不用动
5. 跑一次采集回填：Actions → `Collect Events` → Run workflow

### 时间窗（别拖）
- 暂停后**约 90 天**内可一键恢复
- 超过 1 年：控制台不再提供一键恢复，但还能在 Project Overview 下载 `.backup` 文件，
  再迁移到新项目
- 项目一旦被删除：**数据、备份、PITR 快照全部永久消失，官方无法恢复**

### 如果是「控制面状态不同步」
症状：控制台显示正常、Settings 里只有「Pause project」没有「Restore project」、
Restart 按钮灰掉但你明明是 Owner。
这是 Supabase 侧的问题，只能提工单，会由他们把 DNS 记录恢复回来。

## 5. 恢复路径 B：项目已被删除（最坏情况）

数据无法找回。但这个项目的**用户可见数据是可以完全重建的**，所以实际损失有限：

| 表 | 能否重建 | 说明 |
| --- | --- | --- |
| `events` | ✅ 完全可重建 | 每次发布都是「按窗口全量替换」，跑一次采集就回来了 |
| `source_configs` | ✅ 完全可重建 | 由 `SOURCE_SEEDS` 自动 upsert |
| `raw_events` | ❌ 丢失 | 原始层，只用于排查解析问题 |
| `collection_runs` | ❌ 丢失 | 历史运行统计，连续失败告警的取样依据；从零开始累计 |

**不需要写恢复脚本。** `ensureSchema()` 在每次采集开始时自动建表，所以流程就是：

```bash
# 1. 新建 Supabase 项目（区域选东京/新加坡，离境内近）
#    地址：https://database.new
# 2. 从 Settings → Database → Connect 复制 Session pooler 连接串
#    （不要用 Direct connection，那是 IPv6-only，本机经常连不上）
# 3. 把连接串写进三处配置（见第 6 节）
# 4. 触发一次采集
```

## 6. ⚠️ 换库必须同步改「三处」，少一处就有一个端读不到数据

这是本项目最容易踩的坑：三个消费端各自持有连接信息，互不共享。

| # | 位置 | 改什么 | 谁受影响 |
| --- | --- | --- | --- |
| 1 | GitHub → Settings → Secrets → `DATABASE_URL` | 新连接串 | `collect.yml`、`cleanup.yml`（采集与清理） |
| 2 | Cloudflare 控制台 → Hyperdrive → 绑定 `e700165a80e741759b6feb9c052b4f5f` | 编辑 origin 连接串 | Web 端（`news.leoncoooolest.com`）的读路径 |
| 3 | 微信云托管 → 服务 `events-api` → 环境变量 `DATABASE_URL` | 新连接串 | 小程序 API（`/api/events`） |

注意第 2 处：`wrangler.jsonc` 里的 `localConnectionString` 只是本地开发的占位符，
**生产用的是 Cloudflare 云端存的 Hyperdrive 配置**，改仓库文件没用。

改完第 2 处记得让 Hyperdrive 生效（控制台保存后会自动重启连接池），
改完第 3 处要**发布新版本**才生效。

### 这个项目的 pooler 连接串长什么样（2026-10-08 实测）

```
postgresql://postgres.zvlnemhtzxtxaaxulodg:<密码>@aws-1-us-west-2.pooler.supabase.com:6543/postgres
```

扫过 22 个 region × `aws-0`/`aws-1` 两种前缀共 44 个主机，**只有 `aws-1-us-west-2` 能找到 tenant**：

```
✅ aws-1-us-west-2.pooler.supabase.com   →  transaction(6543) 与 session(5432) 都通
   aws-0-us-west-2.pooler.supabase.com   →  tenant/user not found
```

⚠️ **注意是 `aws-1-` 前缀，不是 `aws-0-`。** 网上大量教程还写着 `aws-0-`，照抄会得到
`tenant/user not found` —— 这个报错**不代表项目没了**，只代表那个主机上没有你的 tenant。

⚠️ **restore 之后 tenant 注册有延迟**：恢复完成约 2 分钟时扫描 16 个 region 全部
`tenant not found`，约 10 分钟后再扫才找到。**恢复完请等 5–10 分钟再判定，否则会误判成恢复失败。**

## 7. 恢复后验证清单

```bash
# ① 采集能跑通
gh workflow run "Collect Events" && gh run watch

# ② 生产 API 恢复
curl -s https://news.leoncoooolest.com/api/events | head -c 200

# ③ 端到端哨兵变绿
node scripts/canary.mjs && echo "OK"

# ④ 小程序（人工）
#    开发者工具点「编译」，确认首页有数据、筛选面板选项不为空
```

⚠️ **本机用 `.env` 直连是连不上的** —— 那是 `db.<ref>.supabase.co:5432` 的 **IPv6-only**
通道，本机多半报 `ECONNRESET`。**这不代表数据库没恢复。** 要在本机验连接，用 pooler 形态：

```bash
node -e '
const pg = require("pg");
const c = new pg.Client({
  connectionString: "postgresql://postgres.zvlnemhtzxtxaaxulodg:<密码>@aws-1-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});
c.connect()
 .then(() => c.query("select count(*) from events"))
 .then((r) => console.log("events:", r.rows[0].count))
 .catch((e) => console.log("失败:", e.message))
 .finally(() => c.end());
'
```

（本机在 2026-10-08 实测 `aws-1-us-west-2:6543` 可用，`events` 表 303 行。）

## 8. 复盘：为什么这次静默了两天

不是采集没失败 —— 是**失败得太早，早到告警代码还没轮到执行**。

```
runCollectJob()
  └─ listEvents()          ← 第 71 行，第一步就是数据库读取
       └─ 抛 ENOTFOUND    ← 进程在这里就死了
  ...
  （下游的 notifyCollectAlert 永远到不了）
```

原有的告警只覆盖三种信号：连续失败的信源、分类召回塌方、发布守门拦截。
这三者**全都依赖采集跑完**（要把结果写进 `collection_runs` 才能统计）。
于是「数据库整体不可达」这类故障恰好落在告警的盲区里。
最后是人工发现的 —— 整整两天，生产只在返回 500。

## 9. 已经加上的对策

| 对策 | 文件 | 作用 |
| --- | --- | --- |
| 致命错误告警通道 | `src/lib/alerting.js` 的 `notifyFatalError` | 采集在任何一步崩掉都会推飞书，不再依赖「跑完才告警」 |
| 入口脚本兜底 | `scripts/collect-local.js` | 捕获致命错误 → 推告警 + 写 Step Summary + 保留非零退出码 |
| 告警链路自身容错 | `scripts/collect-local.js` | `listRecentCollectionRuns` 也是一次数据库读取，它挂了不能再把成功的采集带崩 |
| 端到端哨兵 | `.github/workflows/canary.yml` + `scripts/canary.mjs` | 每 6 小时探一次生产 API；零依赖、不跑 `npm ci`、不碰 `pg`，采集挂了它照样能跑 |

### 还没做、建议你决定的
- **升级到 Pro（$25/月）**：付费项目不会被暂停，这是唯一能根治「免费额度/闲置暂停」的办法
- **异地备份**：目前没有任何 `pg_dump` 定时备份。免费项目一旦删除就全没了，值得加一个每天
  `pg_dump` 到 GitHub Artifacts 或对象存储的 workflow
- **查清这次暂停的真实原因**：采集本来每 2 天跑一次，不该触发 7 天闲置暂停。
  可能是免费额度（存储/egress/磁盘 IO 预算）耗尽，也可能是 Supabase 侧的实例暂停
  —— 登录控制台时顺便看一眼 Billing / Reports 页面
