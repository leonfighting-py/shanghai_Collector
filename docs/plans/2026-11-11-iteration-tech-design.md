# 下一阶段迭代技术方案

日期：2026-11-11
状态：WP0、WP1 已完成并上线（2026-11-14，leonfighting-py/shanghai_Collector#1），其余待实现
读者：负责实现的 agent。每个工作包可以单独领走，领之前先读第 1、2、3 节。

## 1. 范围和工作包

本方案把下一阶段的迭代拆成 8 个工作包（下文记作 WP0 到 WP7）。每个工作包写明目标、设计、要改的文件、测试、验收，以及哪些步骤必须由人来做。

| 编号 | 名称 | 一句话 | 依赖 |
|---|---|---|---|
| WP0 | 工程基线 | PR 测试、建表迁移前置、采集阶段耗时、过期文档 | 无 |
| WP1 | 信源注册表拆分 | 把 2600 行信源表从 `collector.js` 搬出去，行为不变 | WP0 |
| WP2 | 活动字段补齐 | 区域、地址、价格、人群，加详情页缓存 | WP0、WP1 |
| WP3 | 稳定 ID 和 Web 详情页 | 每条活动有固定链接、结构化数据、日历文件 | WP0 |
| WP4 | 小程序能力 | 按 ID 打开详情、分享直达、加入手机日历 | WP3 |
| WP5 | 场景筛选 | 今天、今晚、本周末、免费、亲子 | WP2 |
| WP6 | 互动数据 | 记录详情浏览和外链点击，进每周体检 | WP3 |
| WP7 | 供给和时效 | 头部信源每日采、解析器失效时 LLM 兜底、AI 聚会排查 | WP1 |

建议顺序：WP0 → WP1 → WP2 → WP3 → WP7 → WP4 → WP5 → WP6。

可以并行的组合：WP7 和 WP3；WP4 和 WP5；WP6 和 WP5。

不要并行的组合：WP2 和 WP3。两者都改 `repository.js`、`events.js` 和四处字段白名单，并行会反复冲突。

第 12 节列了三件需要用户先拍板的事，不属于任何工作包，实现方不要自行处理。

## 2. 现状（2026-11-11 实测）

数据来自线上库 `shanghai-collector`（Supabase 项目 ref `uctibqgknvdxcqbncrjx`，东京区）和仓库当前代码。

### 2.1 发布窗口内的活动

| 项 | 数字 |
|---|---|
| 总数 | 315 条 |
| 演出音乐 | 105 |
| 线下活动 | 105 |
| 展览 | 54 |
| 高校讲座 | 49 |
| AI聚会 | 2 |
| 场馆只写"上海" | 65 条（21%） |
| 没有可用封面图 | 195 条（62%） |
| 不同场馆名 | 177 个 |
| 贡献了活动的信源 | 63 个 |
| 多信源合并的活动 | 24 条 |

`docs/plans/2026-10-12-event-facets-backfill.md` 里的基线（窗口 119 条、演出加展览占 88%）已经过期。线下活动和讲座的量上来了，偏科只剩 AI 聚会一类：注册表里有 30 个 AI 聚会信源，窗口内只有 2 条。

场馆只写"上海"的 65 条集中在几个信源：格瓦拉 13、钛媒体·活动 10、意大利文化处·活动日历 10、上海市政府·赛事活动 4。

没有封面图的集中在：上海文化云·活动报名 44 条全无图、上海古典音乐会·上海乐历 18 条全无图、上海市政府·区文化活动预告 12 条全无图。`backfillEventImages` 每轮只回填 30 条（`src/lib/image-backfill.js:52`）。

### 2.2 采集

| 项 | 数字 |
|---|---|
| 频率 | 每两日一次（`.github/workflows/collect.yml`） |
| 境内信源数 | 261 |
| 单轮原始条目 | 约 2500 |
| 单轮耗时 | 最近 6 轮在 20 到 26 分钟之间，job 上限 55 分钟 |
| 最近 6 轮状态 | 全部是 `partial`，失败源 1 到 11 个 |

`collection_runs.status` 只要有一个信源失败就记 `partial`，所以这个字段现在区分不出好坏。

### 2.3 代码

- `src/lib/collector.js` 3064 行，第 16 到 2648 行是信源表 `SOURCE_SEEDS_RAW`，第 2689 到 2809 行是停采清单 `RETIRED_SOURCE_NAMES`，调度逻辑只有最后约 250 行。
- 325 个信源条目里 207 个用 `PARSERS.cnCmsLectures`，只有 1 个用 `PARSERS.llmExtract`。
- `events` 表的列：`id, title, start_time, end_time, venue, category, signup_url, source_name, source_url, dedupe_key, sources, raw_event_ids, dedupe_provider, summary, image_url, created_at, updated_at`。没有区域、价格、人群、地址。
- `district` 和 `subcategory` 是读取时派生的，不落库（`src/lib/events.js:235` 的 `filterPublishableEvents`，规则在 `src/lib/event-classify.js`）。区名用短名，如"浦东""黄浦"。
- Web 只有首页、`/category/[name]`（跳转）、`/api/events`、`/feed.xml`、`/sitemap.xml`、`/llms.txt`。没有单条活动的页面。
- 小程序走云函数 `miniprogram/cloudfunctions/events`。详情页靠 `eventChannel` 从列表页拿整条活动（`miniprogram/pages/detail/detail.js:17`），分享出去的链接只能落到首页。
- Web 和小程序里没有任何埋点。
- `npm test` 只在 `.github/workflows/deploy.yml` 里跑，也就是合进 `main` 之后。全量测试约 2 秒。

## 3. 所有工作包都要遵守的约束

这些是仓库现有的做法，违反任何一条都会出线上事故或者让测试失败。

### 3.1 发布是整窗替换

`replaceWeekEvents`（`src/lib/repository.js:273`）先删掉窗口内所有行，再把本轮结果插回去。后果有三条：

- `events.id` 每两天就变，不能当对外的标识。
- 任何"上一轮补上的字段"本轮不重新算就会丢。要跨轮保留的东西必须有自己的表，或者能从本轮数据重新算出来。
- 分类下跌保护会把上一轮的旧行顶回来（`src/lib/collect-job.js:48`），旧行是 `listEvents` 读出来的。所以 `listEvents` 的查询必须带上所有落库的字段，否则被保护的分类会丢字段。

### 3.2 读路径不建表

建表和加列只在 `ensureSchema`（`src/lib/repository.js:124`）里，由采集和清理任务执行。Web 和云函数只读。

这带来一个部署顺序问题：推到 `main` 会立刻部署 Web，而新列要等下一轮采集才会加上。如果读查询里写了还不存在的列，首页会直接报错。WP0 会加一个迁移步骤解决它。在 WP0 合并之前，任何工作包都不要在读查询里加新列。

### 3.3 四处字段白名单和三处查询必须一起改

给活动加一个对外字段，要同时改下面这些地方：

| 位置 | 内容 |
|---|---|
| `src/lib/repository.js` 的 `listEvents` | select 列表 |
| `src/lib/repository.js` 的 `replaceWeekEvents` | insert 列、冲突更新、参数 |
| `src/app/api/events/route.js` | `PUBLIC_FIELDS` |
| `src/app/page.js` | `CLIENT_FIELDS` |
| `miniprogram/cloudfunctions/events/index.js` | `PUBLIC_FIELDS` 和 select 列表 |
| `cloudrun/server.js` | `PUBLIC_FIELDS` 和 select 列表 |
| `src/app/llms.txt/route.js` | 字段说明 |

`test/cloudfunction-lib-parity.test.js` 会比对云函数和云托管的字段表，漏改会失败。

### 3.4 三份代码副本

- `miniprogram/cloudfunctions/events/lib/*.mjs` 是 `src/lib` 里四个文件的原样副本（`events.js`、`dedupe.js`、`event-classify.js`、`event-duration.js`），只把 import 的扩展名换成 `.mjs`。改了 `src/lib` 里这四个文件，必须重新复制。
- 这四个文件的依赖闭包目前恰好是它们自己。给其中任何一个加新的 import，就要把被引入的文件也加进副本和 `test/cloudfunction-lib-parity.test.js` 的 `LIB_COPIES`。能不加就不加。
- `miniprogram/utils/classify.js` 是 `event-classify.js` 里选项表的 CommonJS 副本，由 `test/miniprogram-classify-parity.test.js` 守着。

### 3.5 抓不到就留空

沿用 10-12 方案的原则。空值表示"不知道"，不表示"免费"或"适合所有人"。界面上筛"免费"只出 `is_free = true` 的活动。

### 3.6 测试

- 用 `node --test`，放在 `test/` 下，文件名 `*.test.js`。
- 不发真实网络请求，不连真实数据库。抓取函数、模型调用、数据库查询都通过参数注入假实现，现有测试都是这么写的。
- HTML 样本放 `test/fixtures/`。
- 提交前本地跑 `npm test`，必须全绿。

### 3.7 其他

- 不加新的 npm 依赖。确实需要时在 PR 里写明理由。
- 代码注释用中文，写"为什么"，沿用现有文件的写法。
- 提交信息沿用现有格式：`feat(采集): ...`、`fix(小程序): ...`、`docs: ...`。
- 密钥不进仓库。新的环境变量要同时写进 `.env.example` 和 `README.md` 的环境变量表。
- 小程序代码是 CommonJS，不能引用 `src/`。
- 采集跑在境内自建 runner 上（`runs-on: [self-hosted, china]`），访问 GitHub 和 npm 要走镜像，照抄 `collect.yml` 里的写法。

### 3.8 实现方做不了的事

下面这些需要用户本人操作，实现方做完代码后在 PR 描述里列出来：

- 上传云函数：在微信开发者工具里右键 `cloudfunctions/events` 选"上传并部署"。
- 发布小程序：上传代码、提审、发布。
- 修改小程序的隐私保护指引。
- 改 GitHub 仓库的 Secrets 和 Variables。
- 核对场馆字典（WP2）。

## 4. WP0：工程基线

### 4.1 目标

后面的工作包都要加列、改读查询、动采集流程。先把保护措施补齐。

### 4.2 内容

**A. PR 测试工作流**

新建 `.github/workflows/test.yml`：

- 触发：`pull_request`，以及推送到非 `main` 分支。
- `runs-on: ubuntu-latest`，Node 24，`npm ci`，`npm test`。
- 不需要任何 secret。

**B. 迁移脚本和部署前迁移**

新建 `scripts/migrate.mjs`：调用 `ensureSchema()`，打印执行结果，没有 `DATABASE_URL` 时以非零码退出。在 `package.json` 加 `"migrate": "node --env-file=.env scripts/migrate.mjs"`。

改 `.github/workflows/deploy.yml`：在"Build Cloudflare Worker"之前加一步"Apply schema"，运行 `node scripts/migrate.mjs`，环境变量 `DATABASE_URL: ${{ secrets.DATABASE_URL }}`。`backup.yml` 和 `cleanup.yml` 已经在 GitHub 托管 runner 上用这个 secret 连库，说明网络是通的。

`ensureSchema` 里的语句全部是 `create ... if not exists` 和 `add column if not exists`，重复执行没有副作用。后续工作包加的 DDL 必须保持这个性质。

云函数没有自动部署。凡是改了云函数读查询的工作包，PR 描述里要写明"先合并并等部署完成，再上传云函数"。

**C. 采集阶段耗时**

`collect.yml` 的注释里写着"等日志能打出各阶段耗时时再收紧"上限。在 `runCollectJob`（`src/lib/collect-job.js:73`）里给每个阶段计时：读旧数据、抓取解析、LLM 润色、图片回填、分类过滤、写原始表、发布。

- 返回值加 `stage_timings: { fetch_ms, enrich_ms, ... }`。
- `scripts/collect-local.js` 的 Step Summary 加一行各阶段耗时。
- 计时用 `Date.now()` 差值，写一个小的 `timed(name, fn)` 辅助函数，不引依赖。

**D. 运行状态分级**

现在 `status` 只有 `success` 和 `partial`，且永远是 `partial`。改成三档，判定写成纯函数放在 `src/lib/collect-result.js`：

- `success`：守门通过，失败信源占比不超过 5%。
- `degraded`：守门通过，失败信源占比超过 5%。
- `blocked`：发布守门拦截，或者本轮回退到了旧数据。

`collection_runs.status` 是 text 列，不用改表。检查 `src/lib/alerting.js`、`scripts/source-health-check.js`、`scripts/canary.mjs` 里有没有按 `partial` 字符串判断的地方，一并改掉。历史行保留 `partial` 不回填。

**E. 过期文档**

数据库在 2026-10-24 前后迁到了新项目，下面三处还写着旧项目 ref `zvlnemhtzxtxaaxulodg`：

- `README.md:93`
- `.env.example:12`
- `docs/db-recovery.md:37`、`:112`、`:151`

改成占位写法 `<project-ref>`，并在 `docs/db-recovery.md` 里注明当前项目名是 `shanghai-collector`、区域是 `ap-northeast-1`。连接串里的 pooler 主机名跟区域有关，实现方不知道新值，留占位并在 PR 里请用户补。

`README.md` 的"微信小程序"一节还在讲云托管是主路径。按 `miniprogram/utils/config.js` 的注释，2026-10-31 起主路径是云函数，云托管保留作回滚。把这一节改成先讲云函数，云托管降为"回滚路径"小节。

### 4.3 测试

- `test/collect-result.test.js` 补状态分级的用例：0 失败、刚好 5%、超过 5%、守门拦截、回退旧数据。
- `scripts/migrate.mjs` 不需要单测，但要保证没有 `DATABASE_URL` 时不会静默成功。

### 4.4 验收

- 开一个 PR，能看到 test 工作流跑起来并通过。
- 合并后 deploy 工作流里"Apply schema"一步成功。
- 手动触发一次采集，Step Summary 里有各阶段耗时，`collection_runs` 新行的 `status` 是三档之一。

## 5. WP1：信源注册表拆分

### 5.1 目标

把信源数据和调度逻辑分开。停采、新增、打标记都变成只改数据文件。这是纯重构，采集结果必须和重构前一致。

### 5.2 目标结构

```
src/lib/sources/
  index.js            汇总、应用停采清单、算 tier，导出四个集合
  retired.js          RETIRED_SOURCE_NAMES 及其注释
  tier.js             resolveSourceTier 及 T1/T2 名单
  seeds/
    performance.js    演出音乐
    exhibition.js     展览
    offline.js        线下活动
    lectures.js       高校讲座
    ai-meetup.js      AI聚会
    dynamic.js        由环境变量生成的条目（X 时间线、微信公众号等）
```

- 每个 `seeds/*.js` 导出一个数组，条目写法和现在完全一样。条目上方的注释跟着条目走，不要丢。这些注释记录了每个源为什么这样配，是这个仓库最有价值的文档之一。
- `sources/index.js` 导出 `SOURCE_SEEDS_RAW`、`SOURCE_SEEDS`、`LAND_SOURCES`、`OFFSHORE_SOURCES`。
- `collector.js` 重新导出这四个名字和 `resolveSourceTier`，现有的 import 都不用改。`scripts/` 下有十来个脚本从 `collector.js` 取这些名字。
- 条目按 `category` 字段分文件。`SOURCE_SEEDS_RAW` 里靠环境变量展开的片段（例如第 2630 到 2648 行附近的 X 时间线）放进 `dynamic.js`。
- 合并顺序要和现在的数组顺序一致。顺序会影响同键合并时谁先到（`mergeDuplicateEvents` 里先到的当底），改了顺序结果就可能变。以"顺序不变"为准，文件怎么分是次要的。

2026-11-12 实测：原数组按 `category` 切开有 44 段，同一类目的条目散在各处（例如高校讲座出现了 18 段）。所以"按类目分文件再拼接"一定会改变顺序。两种可接受的做法：

1. 按原数组顺序切成若干段，每段一个文件（例如 `seeds/01-venues.js`、`seeds/02-lectures-a.js`），`index.js` 按文件编号拼接。文件里的类目可以混杂。
2. 按类目分文件，但每个条目带一个 `order` 字段（取原数组下标），`index.js` 拼接后按 `order` 排序。以后新增条目要自己挑 `order`，容易出错，不推荐。

推荐做法 1。

另外，原数组里有 4 个信源名出现了两次：`东华·通知公告`、`上理工·通知公告`、`上理工双创·通知公告`、`上海海事大学·讲座信息`。重名的后果：`source_configs.source_name` 是唯一键，后一条覆盖前一条；停采清单按名字匹配，会同时停掉两条；告警和体检按名字聚合，两个源的失败会算到一起。处理见 5.3 第 4 步。

### 5.3 步骤

1. 重构前先写快照测试 `test/source-registry.test.js`：把当前 `SOURCE_SEEDS` 映射成 `{name, url, category, locale, tier, offshore, parserName}` 的数组，存成 `test/fixtures/source-registry.snapshot.json`。`parserName` 通过在 `PARSERS` 里反查函数引用得到。
2. 搬文件。
3. 快照测试必须一字不差地通过。之后这个测试留着，以后改信源时更新快照，diff 一眼能看出改了什么。
4. 加两条不变量测试：信源名不重复；停采清单里的每个名字都能在原始表里找到（防止改名后停采失效）。
   - 名字不重复这一条在现有数据上不成立（见 5.2 的 4 个重名）。纯搬家的提交里先把这 4 个名字写进测试的已知例外表，让测试通过。
   - 另起一个提交给重名的第二条改名（例如加上栏目后缀），更新快照，删掉例外表。改名会让 `events.source_name` 和 `sources` 里的名字变化，不影响 `dedupe_key`，但告警的连续失败计数会从零开始。改名前先确认两条的 URL 确实不同；如果 URL 也相同，就是重复条目，删掉一条。
   - 停采清单那条如果不成立，把不成立的名字列在 PR 里，不要悄悄删。

### 5.4 验收

- `npm test` 全绿，快照无 diff。
- `collector.js` 降到 500 行以内。
- `node scripts/collect-simulate.js`（如果它不需要数据库）或 `npm run health` 的信源总数和重构前相同。

## 6. WP2：活动字段补齐

### 6.1 和旧方案的关系

`docs/plans/2026-10-12-event-facets-backfill.md` 已经把流程设计完了：四层补齐（信源级修正、详情页抓取、场馆字典加规则、LLM 兜底）、缓存表、测试清单、实现顺序。实现方以那份文档为主，本节只写需要修订和补充的地方。两份文档冲突时以本节为准。

### 6.2 修订

**修订 1：区名用短名，落库值优先于派生值**

旧方案写的是全称（"浦东新区"）。现在线上的 `district` 已经是短名（"浦东"），Web 和小程序的筛选面板、URL 参数 `?area=` 都按短名工作。

- `events.district` 存短名，取值必须在 `event-classify.js` 的 `DISTRICTS` 里。
- 场馆字典 `venue-profiles.js` 里的 `district` 也写短名。
- `filterPublishableEvents` 里改成 `district: event.district || detectDistrict(normalized)`。落库的值来自详情页地址或场馆字典，比标题里的地标词可靠，所以优先。
- 详情页抓到的地址里是"浦东新区""黄浦区"这种写法，入库前用一个 `normalizeDistrict()` 转成短名，转不出来就留空。这个函数放 `event-classify.js`，同步到云函数副本和小程序副本。

**修订 2：基线数字**

旧方案第 2 节和第 8 节的基线过期了，用本文 2.1 节的数字：场馆只写"上海"21%（65/315）。第 0 层信源级修正的重点对象换成：钛媒体·活动、意大利文化处·活动日历、上海市政府·赛事活动、格瓦拉。前三个都是整源写"上海"。

验收目标相应调整为：

| 指标 | 基线 | 目标 |
|---|---|---|
| 场馆只写"上海" | 21% | 8% 以下 |
| 有区域（落库或派生） | 实现第一步时先测 | 80% 以上 |
| 演出音乐类价格已知 | 约 0% | 50% 以上 |
| 没有封面图 | 62% | 40% 以下 |
| 有人群标签 | 未测 | 不设目标，如实报告 |

目标值仍然是估计，以探测脚本的结果为准。

**修订 3：详情页缓存同时服务图片回填**

旧方案要求图片回填和字段提取共用一次抓取，这一点保留，并且再进一步：`event_detail_cache` 里把提取到的封面图也存下来。

- 表结构：`source_url text primary key, extracted jsonb not null, fetched_at timestamptz not null, status text not null`。`extracted` 里放 `{address, venue, price_min, price_max, is_free, audience, image_url, text_excerpt}`。`status` 取 `ok`、`empty`、`error`。
- `text_excerpt` 存正文前 1500 字，给第 3 层 LLM 用，免得再抓一次。
- 有效期：`ok` 和 `empty` 7 天，`error` 1 天。
- `backfillEventImages` 的 30 条上限去掉，改为受本阶段的总预算约束（见修订 4）。
- 清理任务（`buildCleanupSql`）加一条：删除 `fetched_at` 超过 30 天的缓存行。

**修订 4：给详情页阶段设时间预算**

现在一轮采集 20 到 26 分钟，上限 55 分钟。首次上线时缓存是空的，要抓 300 多个详情页，同主机还有限速（`createHostThrottle`）。

- 这个阶段设总预算，默认 8 分钟，环境变量 `DETAIL_FETCH_BUDGET_MS` 可调。
- 超出预算就停，没抓到的留到下一轮。有缓存在，两三轮之后会收敛。
- 排队顺序：先抓没有缓存的，再抓缓存过期的；同等条件下 T1 信源优先。
- 返回值里报告：尝试数、命中缓存数、成功数、失败数、因预算跳过数。

**修订 5：软去重也要合并新字段**

旧方案只提了 `mergeDuplicateEvents`（`src/lib/events.js:257`）。`src/lib/dedupe.js:16` 的软去重在合并两条时只带了 `end_time`、`summary`、`image_url`，新字段也要在这里处理：取非空值；都非空时保留 `match` 的。

**修订 6：要同步的位置比旧方案多**

旧方案第 5 节写"小程序和网页前端这次不动"，界面确实不动，但接口输出要动。按本文 3.3 节的表逐项改，包括云函数和云托管的查询与白名单，然后重新复制云函数的 lib 副本。

对外新增的字段：`address`、`price_min`、`price_max`、`is_free`、`audience`。`district` 已经在白名单里。`facet_provenance` 只落库，不对外。

**修订 7：识别外地活动**

旧方案第 9 节把"详情页地址识别外地活动"列为范围外。现在纳入：详情页地址明确是外地（地址以非上海的省市名开头，且不含任何上海标记）时，这条活动不发布，计入补齐统计的 `rejected_non_shanghai`。判定复用 `events.js` 里 `isShanghaiRelevantEvent` 的词表，不要另写一套。

### 6.3 实现顺序

沿用旧方案第 6 节的 7 步。第 1 步探测脚本做完后先停下来，把结果交给用户：主要票务源（格瓦拉、票牛、豆瓣）的详情页能不能拿到价格，决定价格这一项做不做。

### 6.4 人工步骤

- 场馆字典首批覆盖窗口内出现次数最多的场馆（177 个场馆名里先做出现 2 次以上的），实现方起草，用户核对后再合并。
- 合并并部署后，上传云函数。
- `LLM_FACETS_ENABLED` 默认关。用户决定开启后在仓库 Variables 里加，并在 `collect.yml` 的 env 里透传。

## 7. WP3：稳定 ID 和 Web 详情页

### 7.1 目标

每条活动有一个不随采集变化的公开 ID 和一个固定网址。后面的分享直达、日历、埋点、搜索收录都靠它。

### 7.2 公开 ID

`events.id` 每轮都变，`dedupe_key` 是"标题|日期|场馆"的中文长串，都不适合放进网址。

- 新字段 `public_id`：对 `dedupe_key` 做 64 位 FNV-1a 哈希，输出小写 base36，左侧补零到 13 位。
- 实现放在 `src/lib/events.js`，函数名 `buildPublicId(dedupeKey)`。用 `BigInt` 写，不引 `node:crypto`。原因是 `events.js` 要原样复制进云函数，还会被客户端组件引用（`EventBrowser.js` 从它取 `CATEGORIES`），不能带 Node 专有模块。
- 先把字符串按 UTF-8 编码成字节再哈希（`TextEncoder`），不要直接用 `charCodeAt`。
- `filterPublishableEvents` 的返回对象里加 `public_id: buildPublicId(dedupeKey)`。它是发布和读取的共同收口，所以所有路径上的活动都会带这个字段。
- 落库：`events` 加列 `public_id text`，加索引 `events_public_id_idx`。不设唯一约束，哈希冲突的概率可以忽略，但没必要让一次冲突挡住整轮发布。`replaceWeekEvents` 写入这一列。
- `dedupe_key` 在采集阶段、LLM 润色之前就定了，润色改标题不会影响它。源站自己改了标题或日期时 ID 会变，旧链接失效，这一点可以接受。
- 对外：加进 3.3 节所有白名单。

### 7.3 按 ID 读取

`src/lib/repository.js` 加 `getEventByPublicId(publicId)`：

- 先校验格式 `/^[0-9a-z]{13}$/`，不合格直接返回 `null`，不查库。
- `select ... from events where public_id = $1 limit 1`，列和 `listEvents` 相同。不加窗口条件：活动结束后 7 天内行还在（`EVENT_RETENTION_DAYS`），这段时间链接继续可用。
- 结果过一遍 `filterPublishableEvents`，拿到派生字段，同时保证不可发布的行不会露出来。
- 没有数据库配置时从 `SAMPLE_EVENTS` 里找。

注意部署顺序：这个查询引用了新列，依赖 WP0 的部署前迁移。迁移后、下一轮采集前，老行的 `public_id` 是空的，按 ID 查不到。所以迁移语句里要带一次回填，但 FNV 没法用 SQL 写。做法：`scripts/migrate.mjs` 在 `ensureSchema()` 之后调用一个 `backfillPublicIds()`，读出 `public_id is null` 的行，用 JS 算好再批量 update。幂等，没有空行时什么都不做。

### 7.4 详情页

路由：`src/app/event/[id]/page.js`，服务端组件。

- `getEventByPublicId` 返回空时调 `notFound()`。
- 内容：封面、类目和二级分类、标题、时间（跨天活动显示档期，复用 `src/lib/agenda.js`）、场馆、区域、摘要、来源列表（`sources`，每个来源一个外链）、主按钮"查看活动链接"（指向 `signup_url`，走 `safeExternalUrl`）、"加入日历"、收藏按钮（复用 `useFavorites`，标识仍然是 `dedupe_key`）。
- WP2 的字段（价格、地址、人群）如果已经有了就显示，没有就不渲染对应的行。两个工作包谁先做都能跑。
- 视觉沿用 `docs/plans/2026-10-04-editorial-redesign-design.md` 的"素白"编辑风，样式写进 `src/app/styles.css`，复用现有的变量和类名，不新建样式体系。
- `generateMetadata`：`title` 用活动标题，`description` 用"日期 · 场馆 · 摘要前 80 字"，`openGraph.images` 用封面图（先过 `isUsableImage`），`alternates.canonical` 用 `${getSiteUrl()}/event/${id}`。
- 已经结束的活动：页面照常渲染，顶部加一行"活动已结束"，`robots` 元数据设 `noindex`。
- 页面底部放一个"同场馆的其他活动"或"同类目近期活动"列表（最多 6 条），取 `listEvents()` 的结果筛。这给页面之间加了内链。

结构化数据：页面里输出一段 `application/ld+json`，类型 `Event`。

- `name`、`startDate`、`endDate`（有才写）、`eventAttendanceMode` 固定线下、`location`（`Place`，`name` 用场馆，`address` 有 WP2 的地址就用地址，否则写"上海"）、`image`、`description`、`url`。
- 有价格时加 `offers`；`is_free` 为真时加 `isAccessibleForFree`。
- 生成逻辑写成纯函数 `buildEventJsonLd(event, siteUrl)` 放 `src/lib/event-jsonld.js`，便于测试。输出前对 `</script` 做转义。

### 7.5 首页怎么链过去

现在首页的活动行和推荐卡片直接外链到 `signup_url`（`src/app/page.js:64`、`EventBrowser.js`）。

默认做法：标题和卡片主体改为链到站内详情页，行尾保留一个明确的外链按钮直达 `signup_url`。这样多数点击先落在站内，详情页才有流量和内链。

这是产品取舍，会让"直达购票"多一次点击。实现方按默认做法做，在 PR 里单独说明，方便用户否决。

### 7.6 日历文件

路由：`src/app/event/[id]/calendar.ics/route.js`。

- 返回 `text/calendar; charset=utf-8`，`Content-Disposition: attachment; filename="event-<id>.ics"`。
- 生成逻辑写成纯函数 `buildIcs(event, siteUrl)` 放 `src/lib/ics.js`。
- 单日活动：`DTSTART`、`DTEND` 用 UTC 时间。没有 `end_time` 时结束时间取开始后 2 小时。
- 跨天活动（`isMultiDay`）：用全天事件，`DTSTART;VALUE=DATE` 和 `DTEND;VALUE=DATE`，日期按上海时区取，结束日加一天（iCalendar 的结束日不含当天）。
- `UID` 用 `<public_id>@<站点域名>`，`URL` 指向详情页，`LOCATION` 用场馆，`DESCRIPTION` 放摘要和活动链接。
- 文本字段按 RFC 5545 转义逗号、分号、反斜杠、换行，每行超过 75 字节要折行。中文是多字节，按字节数折，别把一个字符切开。
- 已知限制：不少解析器在源站没给具体时间时默认 10:00（`src/lib/parsers/shared.js:68`）。日历里的时间可能不准，`DESCRIPTION` 第一行写"时间以活动页面为准"。

### 7.7 站点地图和订阅源

- `src/app/sitemap.js` 改成 async，加上窗口内每条活动的详情页网址，`lastModified` 用 `updated_at`。取数失败时退回只有静态条目，不要让 sitemap 整个 500。
- `src/app/feed.xml/route.js`：`<link>` 和 `<guid>` 改用详情页网址。`guid` 变了会让订阅者把旧条目当成新的再收到一次，在 PR 里说明。
- `src/app/llms.txt/route.js`：补上详情页和日历文件的说明。

### 7.8 测试

- `buildPublicId`：固定输入对应固定输出（写死 3 个样本，含中文）；长度恒为 13；同一 `dedupe_key` 多次调用结果相同。
- `getEventByPublicId`：格式不合法不查库（注入的查询函数不应被调用）；查不到返回 `null`。
- `buildEventJsonLd`：最小字段集；带价格；免费；标题里有 `</script>` 时被转义。
- `buildIcs`：单日有结束时间；单日无结束时间；跨天全天；含逗号和换行的标题；长中文行折行后每行不超过 75 字节且能还原。
- 复制云函数副本后跑一致性测试。

### 7.9 验收

- 本地 `npm run dev`，从首页点进任意活动，详情页渲染正常，外链、加入日历、收藏可用。
- 把详情页网址贴进 Google 的富媒体结果测试工具，识别出 Event 且没有错误。这一步由用户做。
- 下载的 `.ics` 能导入系统日历，时间、地点正确。
- 等一轮采集之后，同一活动的网址不变。

## 8. WP4：小程序能力

依赖 WP3 的 `public_id`。

### 8.1 云函数加"按 ID 取单条"

`miniprogram/cloudfunctions/events/index.js`：

- 入参加 `id`。带 `id` 时走单条查询，返回 `{ event }` 或 `{ error: "not found", statusCode: 404 }`。不带时行为不变。
- 查询和校验对齐 Web 的 `getEventByPublicId`。
- `cloudrun/server.js` 同步加 `GET /api/events/:id`，保持两条读路径一致。

### 8.2 详情页支持直接打开

`miniprogram/pages/detail/detail.js`：

- `onLoad(options)`：有 `options.id` 时调云函数取单条；否则沿用现在的 `eventChannel`。
- 取数期间显示骨架或加载态，失败时给"活动不存在或已下线"和回首页的按钮。
- `onShareAppMessage` 的 `path` 改成 `/pages/detail/detail?id=<public_id>`。加上 `onShareTimeline`，`query` 带 `id`。
- 从列表进详情时也把 `id` 带在网址上（`eventChannel` 继续传整条数据，省一次请求），这样右上角菜单的转发也能拿到正确路径。

朋友圈单页模式下云函数调用受限。实现时在开发者工具的单页模式里验证；不行就让朋友圈分享退回首页带搜索词的做法（`home.js:440` 现有逻辑）。

### 8.3 加入手机日历

详情页加按钮，调 `wx.addPhoneCalendar`：

- `title`、`startTime`（秒级时间戳）、`endTime`、`location`、`description`。
- 跨天活动用 `allDay: true`。
- 没有 `end_time` 的单日活动，结束时间取开始后 2 小时，和 Web 的 `.ics` 一致。
- 用户拒绝授权时提示一句，不反复弹。

这个接口涉及日历权限。实现方先查微信官方文档确认当前对隐私声明的要求（`app.json` 里是否要声明、隐私保护指引里是否要勾选"日历"）。这类规定变得快，以官方文档当前版本为准，不要凭记忆写。需要改隐私指引的话列进人工步骤。

### 8.4 不在这次范围内

开场前提醒（一次性订阅消息）需要申请消息模板、存用户的订阅记录、加定时触发的云函数，还要考虑云开发环境 2027-04-30 到期后的去向。量不小，另起方案。

### 8.5 测试和验收

- 云函数的参数校验和单条查询逻辑抽成可注入的纯函数，放进 `test/`。
- 开发者工具里：从列表进详情正常；用编译模式直接打开 `pages/detail/detail?id=...` 正常；错误的 id 有兜底页；转发卡片点开落在对应活动；加入日历后系统日历里有这条。
- 人工步骤：上传云函数，上传并提审小程序。

## 9. WP5：场景筛选

依赖 WP2（"免费""亲子"要有字段）。"今天""今晚""本周末"不依赖，可以先上。

### 9.1 场景定义

新建 `src/lib/scenes.js`，纯函数、零依赖：

```js
export const SCENES = ["today", "tonight", "weekend", "free", "family"];
export function matchesScene(event, scene, now) { ... }
```

| 场景 | 显示名 | 规则 |
|---|---|---|
| `today` | 今天 | 活动在上海的今天进行中：开始日不晚于今天，结束日（无则同开始日）不早于今天 |
| `tonight` | 今晚 | 单日活动，开始日是今天，上海时间 17:00 及以后开始 |
| `weekend` | 本周末 | 活动和"本周六到周日"有交集。今天是周日时只算今天。今天是周一到周五时取本周的周六周日 |
| `free` | 免费 | `is_free === true` |
| `family` | 亲子 | `audience` 含"亲子"，或 `subcategory` 是"亲子" |

- 时区一律按上海算，写法参考 `src/lib/recommendations.js` 里的 `shanghaiHour` 和 `shanghaiDay`。运行环境可能是 UTC。
- 长期展览在"今天"和"本周末"下都会命中，数量可能很多。列表排序时把单日活动排在跨天活动前面。
- "今晚"排除跨天活动，原因见 7.6 节：长期展览的开始时间没有意义。
- 场景和类目、二级、区域是"与"的关系，场景之间互斥（单选）。

### 9.2 界面

- Web：`EventBrowser.js` 的类目标签下面加一行场景按钮。URL 参数 `?scene=`，白名单校验放进 `readClassificationParams` 旁边的新函数里，无效值忽略。
- 小程序：`miniprogram/utils/scenes.js` 是 CommonJS 副本，`home.js` 的筛选链（第 235 行附近）加一环。新增 `test/miniprogram-scenes-parity.test.js`，写法照抄 `test/miniprogram-classify-parity.test.js`：同一批样本活动、同一个 `now`，两边每个场景的输出必须相同。
- 某个场景命中 0 条时按钮置灰，不隐藏。位置固定，用户不用每次重新找。
- WP2 还没上线时，"免费"和"亲子"两个按钮不渲染，判断依据是数据里有没有任何一条带 `is_free` 或 `audience`。

### 9.3 测试

每个场景的边界：周日当天、周五晚上、跨周的展览、16:59 和 17:00、UTC 日期和上海日期不同的时刻（上海 0 点到 8 点）。

### 9.4 排序不动

`scoreEvent`（`src/lib/recommendations.js:35`）里写死的关键词权重这次不改。等 WP6 有了点击数据再调，现在改没有依据。

## 10. WP6：互动数据

依赖 WP3 的 `public_id`。

### 10.1 目标和边界

知道哪些活动、哪些信源、哪些类目有人看。用途是给"停采哪些源""排序怎么调"提供依据。

- 只存按天聚合的计数，不存任何用户标识、IP、设备信息。
- 计数可以被刷，不做防刷。它只用来做相对比较，不对外展示。

### 10.2 表

```sql
create table if not exists event_interactions (
  day date not null,
  public_id text not null,
  action text not null,
  surface text not null,
  source_name text not null,
  category text not null,
  count integer not null default 0,
  primary key (day, public_id, action, surface)
);
create index if not exists event_interactions_day_idx on event_interactions(day);
```

- `action`：`detail_view`、`outbound_click`、`favorite_add`、`calendar_add`、`share`。
- `surface`：`web`、`miniprogram`。
- `source_name` 和 `category` 冗余存一份，因为 `events` 的行在活动结束 7 天后会被清掉，之后就连不上了。
- 清理任务加一条：删除 180 天以前的行。

### 10.3 写入

一条语句完成校验、取冗余字段、累加：

```sql
insert into event_interactions (day, public_id, action, surface, source_name, category, count)
select (now() at time zone 'Asia/Shanghai')::date, public_id, $2, $3, source_name, category, 1
from events where public_id = $1 limit 1
on conflict (day, public_id, action, surface)
do update set count = event_interactions.count + 1
```

`public_id` 不存在时不会插入任何行，等于自带校验。

放在 `src/lib/repository.js` 的 `recordInteraction({ publicId, action, surface })`。`action` 和 `surface` 先过白名单，`publicId` 先过格式校验。

### 10.4 入口

**Web**：`src/app/api/track/route.js`，只接受 POST，请求体 `{ id, action }`，`surface` 固定为 `web`。

- 成功和失败都返回 204，不向客户端暴露任何信息。数据库报错只记日志。
- 不设缓存。
- 客户端用 `navigator.sendBeacon`，不可用时退回 `fetch(..., { keepalive: true })`。封装成 `src/app/components/track.js` 里的一个函数。
- 触发点：详情页挂载（`detail_view`）、点击活动链接（`outbound_click`）、点击加入日历（`calendar_add`）、新增收藏（`favorite_add`）。
- `src/app/robots.js` 里把 `/api/track` 设为不允许抓取。

**小程序**：云函数加 `action: "track"` 分支，`surface` 固定为 `miniprogram`。客户端调用不等待结果，失败静默。触发点同上，另加 `share`（`onShareAppMessage` 里）。

### 10.5 先确认写权限

Web 通过 Cloudflare Hyperdrive 连库，云函数用自己的 `DATABASE_URL`。现有代码在这两条路径上只读，仓库注释里写着"读账号无需 CREATE/ALTER 权限"，可能用的是受限账号。

实现方动手前先请用户确认：这两条路径的数据库账号对 `event_interactions` 有没有 `INSERT` 和 `UPDATE` 权限。没有的话由用户执行授权，授权语句写进 `docs/db-recovery.md`。权限只给这一张表。

### 10.6 进每周体检

`scripts/source-health-check.js` 的报告和飞书推送加一段"近 7 天互动"：

- 按类目汇总 `detail_view` 和 `outbound_click`。
- 外链点击最多的 10 个信源。
- 近 7 天有活动发布但零互动的信源数量（只报数量，明细写进报告文件）。
- 表不存在或没有数据时跳过这一段，不要让体检失败。

数据读取放在 `repository.js` 的 `listInteractionSummary({ days })`。

### 10.7 测试

- `recordInteraction`：非法 `action`、非法 `surface`、非法 `publicId` 都不发查询。
- 路由：非 POST 返回 405；请求体不是 JSON 返回 204 且不发查询；数据库抛错仍返回 204。
- 体检报告的汇总函数用假数据测。

### 10.8 人工步骤

- 确认或授予写权限。
- 上传云函数。
- 小程序隐私保护指引：本方案不收集个人信息，一般不需要改。实现方对照微信当前的规定确认一遍。

## 11. WP7：供给和时效

依赖 WP1（要在信源条目上加字段）。三个部分互相独立，可以分开做。

### 11.1 头部信源每日采

现在每两日一轮，"今晚有什么"最多滞后两天。全量跑一轮 20 多分钟，没必要每天全跑。

**信源分频**：信源条目加可选字段 `cadence: "daily"`，不写就是每两日。首批标记的依据是 2.1 节的贡献量，从贡献最多的境内信源里挑：格瓦拉、上海文化云·活动报名、iMuseum 上海展览、上海古典音乐会·上海乐历、上海市政府·区文化活动预告、互动吧上海、票牛。境外信源（`offshore: true`）不参与。

**增量发布**：难点在于发布是整窗替换，只采一部分信源会把其他信源的活动删掉。

- `runCollectJob` 加参数 `{ mode: "full" | "daily" }`。`full` 行为不变。
- `daily` 模式：
  1. 只采 `cadence === "daily"` 的境内信源。
  2. 从 `previousEvents` 里取出"延续集"：`sources` 里没有任何一个来源属于本轮信源的活动。
  3. 本轮新结果加延续集，一起走后面的流程（润色、图片、分类过滤、守门、发布）。
  4. 多信源合并的活动只要有一个来源在本轮信源里，就不进延续集，以本轮结果为准。本轮没采到它，它就消失，等下一次全量再回来。这是有意的简化，在代码注释里写明。
- 延续集里的活动已经润色和补图过，跳过这两步。做法：给延续集的活动打一个仅在内存里的标记，`enrichEventsForPublish` 和 `backfillEventImages` 见到就跳过。
- 境外活动来自上一次全量时的 artifact。`daily` 模式不读 artifact，境外活动靠延续集保留。
- 发布守门和分类下跌保护照常生效，比较对象是合并后的全集。
- `collection_runs` 需要区分两种运行：加列 `mode text not null default 'full'`。`computeConsecutiveFailures`（`src/lib/alerting.js:25`）只在同一种模式的运行之间数连续失败，否则每日运行里"没采的信源"会打断或虚增计数。

**工作流**：新建 `.github/workflows/collect-daily.yml`，照抄 `collect.yml` 的 runner 和镜像配置，去掉拉取境外 artifact 的步骤，`timeout-minutes: 15`。

- 时间和全量错开。全量是 `0 1 */2 * *`（UTC），每日的定在 `0 9 * * *`（上海 17:00），正好赶在晚间之前。
- 两个工作流用同一个 `concurrency.group`（例如 `collect-publish`），`cancel-in-progress: false`。两轮同时发布会互相覆盖。`collect.yml` 也要加上这个配置。
- 入口：`scripts/collect-local.js` 读环境变量 `COLLECT_MODE`。

**读路径缓存**：`/api/events` 现在缓存 1 小时、过期后可再用 6 小时（`route.js:59`）。每日更新后这个时长仍然合适，不改。页脚文案"数据每两日自动更新"（`src/app/page.js:92`）改成"数据每日更新"。

**测试**：延续集的划分（单来源在内、单来源在外、多来源部分重叠）；`daily` 模式下守门的比较基数是全集；连续失败只在同模式内计数。

### 11.2 解析器失效时 LLM 兜底

207 个信源共用一个 CMS 模板解析器，其余是手写解析器。站点一改版就归零，目前的处理方式是人工发现、人工停采。最近的提交里这样停掉了近 20 个。

通用 LLM 抽取（`src/lib/parsers/llm-extract.js`）已经有了，但只用在一个信源上。让它当兜底：

- 条件：信源的主解析器抓取成功、页面正文长度够（`extractPageText` 结果不少于 200 字），但解析出 0 条。
- 动作：同一份 HTML 交给 `parseWithLlmExtraction` 再试一次。
- 位置：`collectEventsFromSources` 的 `collectOne` 里（`src/lib/collector.js:2974`），主解析器返回空数组之后。不要改各个解析器。
- 开关：`LLM_FALLBACK_ENABLED`，默认关。要求 `LLM_EXTRACT_ENABLED` 同时为真。
- 限量：每轮最多兜底 `LLM_FALLBACK_MAX_SOURCES` 个信源（默认 40），并且受现有的 `LLM_BUDGET_MAX_CALLS` 熔断约束。很多信源返回 0 条是正常的（这两周确实没活动），所以不能无限兜底。
- 优先级：名额有限时，先给"上一轮有产出、这一轮归零"的信源。需要上一轮各信源的产出数，从 `previousEvents` 的 `sources` 里统计即可，不用查库。
- 标记：兜底得到的活动加 `extracted_by: "llm_fallback"`，随 `raw_payload` 落进 `raw_events`，不进 `events` 表。返回值里报告哪些信源走了兜底、各得到几条。
- 兜底成功的信源要进每周体检报告的单独一栏："主解析器归零、靠 LLM 兜底"。这是该修解析器的信号，兜底不能把问题盖住。
- 兜底结果不带 `defaultVenue` 以外的场馆兜底逻辑变更。提示词（`src/lib/parsers/prompts/llm-extract.md`）第 6 条"没有则填上海"保持不变，场馆质量由 WP2 处理。

先评估再开启：写 `scripts/llm-fallback-eval.js`，挑 20 个当前产出正常的信源，对比主解析器和 LLM 抽取的结果（条数、标题重合率、日期一致率），输出报告。重合率低于 70% 的话先调提示词，不要开开关。脚本需要 `SILICONFLOW_API_KEY`，由用户提供环境后运行。

**测试**：主解析器有结果时不调用 LLM；正文太短不调用；超过信源数上限后不再调用；开关关闭时不调用；兜底结果带标记。模型调用用注入的假实现。

### 11.3 AI 聚会排查

30 个信源，窗口内 2 条。这是调查任务，交付物是一份结论，不是代码。

- 写 `scripts/category-yield.js`（或给 `source-health-check.js` 加参数）：对指定类目的每个信源，输出抓取状态、解析出的原始条数、被 `isPublishableEvent` 各条件拦掉的条数、被窗口拦掉的条数、最后进入发布的条数。
- `isPublishableEvent`（`src/lib/events.js:204`）现在只返回布尔值。加一个 `explainUnpublishable(event)` 返回被哪一条拦下，供脚本用。`isPublishableEvent` 本身不改行为。
- 结论按信源分成四类：站点打不开、解析为 0、有条目但都在窗口外、有条目但被规则拦掉。写进 `docs/plans/` 下的新文档，附每类的处理建议。
- 注意其中一部分是境外信源（Meetup、Luma、Eventbrite），要在境外出口跑才有意义，参考 `docs/offshore-sources.md`。

## 12. 需要用户决定的事

这三件不属于任何工作包。实现方不要自行处理，在合适的时候提醒用户。

**A. `deep-research-reports/` 目录**

5.3 MB，占仓库 562 个文件里的大半，内容是和本项目无关的商汤研究缓存。建议移出仓库。是否删除、是否要先另存，由用户决定。

**B. `cloudrun/` 和根目录 `Dockerfile`**

`miniprogram/utils/config.js` 写明云托管是"保留回滚用"。只要它还留着，每次改接口字段都要多改一处（3.3 节）。建议在云函数稳定运行一段时间后删除，同时删掉 `test/cloudfunction-lib-parity.test.js` 里和云托管比对的部分。什么时候算稳定由用户判断。

**C. 数据库表没有开行级安全**

线上库 `public` 下的四张表（`events`、`raw_events`、`collection_runs`、`source_configs`）都没有启用 RLS。Supabase 会给 `public` 下的表自动开放 REST 接口，没有 RLS 时，拿到项目的 anon key 就能读写这些表。本项目的代码没有用到 anon key，全部走 Postgres 直连，但 anon key 按设计不算机密。

建议：四张表都启用 RLS 且不加任何策略。直连用的是表的所有者角色，不受 RLS 影响，现有读写不会变。WP2 的 `event_detail_cache` 和 WP6 的 `event_interactions` 建表时一并启用。

操作前先确认 Web 和云函数用的数据库账号是不是表的所有者。如果用的是另建的只读角色，启用 RLS 后它会读不到数据，需要给它加一条只读策略。这一步有让线上读不到数据的风险，要用户确认后再做，并且先在 Supabase 后台看一眼安全顾问（Advisors）的提示。

## 13. 每个工作包的交付清单

实现方在 PR 描述里逐项回应：

1. 改了哪些文件，对应本方案哪一节。
2. `npm test` 的结果。
3. 加了哪些环境变量，是否已写进 `.env.example` 和 `README.md`。
4. 加了哪些表或列，是否幂等，是否已放进 `ensureSchema`。
5. 是否改了 3.4 节的四个共享文件，副本是否已同步。
6. 需要用户做的人工步骤，按执行顺序列出。
7. 和本方案不一致的地方，以及原因。
8. 没有验证过的假设。本方案里凡是写"估计""先确认""以官方文档为准"的地方，都要在这里交代实际情况。

## 附录 A：WP0 和 WP1 的审查清单

2026-11-12 对照仓库 `c8f181c` 的代码整理。审查 WP0、WP1 的实现时逐条核对，每条写明了怎么查。

### WP1

1. **顺序没变。** 快照测试必须比对有序数组，不能先排序再比。查法：在快照测试里故意交换两个相邻条目，测试应当失败。
2. **重名处理。** 见 5.3 第 4 步。纯搬家的提交里不应该出现改名。
3. **重新导出齐全。** `collector.js` 至少要继续导出这些名字，下列文件在用：

   | 名字 | 使用方 |
   |---|---|
   | `SOURCE_SEEDS` | `collect-job.js`、`scripts/collect-local.js`、`scripts/collect-simulate.js`、测试 |
   | `LAND_SOURCES` | `collect-job.js`、`scripts/source-health-check.js` |
   | `OFFSHORE_SOURCES` | `scripts/collect-offshore.js` |
   | `SOURCE_SEEDS_RAW`、`resolveSourceTier` | 测试 |
   | `collectEventsFromSources` | `collect-job.js` 和 4 个脚本 |
   | `createHostThrottle`、`classifyFailure`、`describeError` | `scripts/source-health-check.js`、测试 |
   | `defaultFetchHtml`、`parseJsonLdEvents` | 现有的重新导出，保留 |

   查法：`npm test` 通过，再对 `scripts/` 下每个脚本跑一次 `node --check`。`--check` 不解析 import 的名字，所以还要跑 `node -e 'import("./scripts/collect-simulate.js")'` 这类实际加载（不需要数据库的那几个）。
4. **没有循环依赖。** `seeds/*.js` 会 import `parsers/index.js` 和 `parsers/rockbund.js`。这两个文件目前不 import `collector.js`（只在注释里提到），保持这样。如果 `sources/` 里有文件反过来 import `collector.js`，会形成循环，加载时某些导出是 `undefined`。
5. **注释跟着条目走。** 抽查 `RETIRED_SOURCE_NAMES` 上方的长注释、"上海外滩美术馆"和"秀动上海"条目的注释是否还在。
6. **环境变量展开的条目。** X 时间线等条目在模块加载时按环境变量生成，搬到 `dynamic.js` 后仍然要在加载时求值，不能改成函数调用后才生效。
7. **`scripts/cleanup-dirty-events.mjs:31` 的注释**说停采集合"未导出"。拆分后 `retired.js` 可以导出它，这个脚本可以改成直接引用，删掉手抄的两条。

### WP0

8. **哨兵判断。** `collect-job.js` 里有 7 处 `result.events === previousEvents`，靠引用相等判断"本轮回退到了旧数据"。给阶段加计时时，如果包装函数复制了返回值（例如 `{ ...result }`），这些判断会全部变成假，程序会把旧数据当新数据重新润色、写原始表、再发布一遍。查法：看 `timed()` 是否原样返回 `fn()` 的结果。更稳的改法是让 `collectEventsFromSources` 在回退时返回 `fallback: true`，`collect-job.js` 改判这个字段。
9. **三档状态的下游。** 只有 `collect-job.js:131` 写 `partial`。读状态的是 `scripts/source-health-check.js:119` 起的历史统计，它把"不是 success"都算作"部分失败"。三档上线后这里要分别统计 `degraded` 和 `blocked`，历史上的 `partial` 单独算一类或并入 `degraded`。`src/lib/collect-result.js` 的 `shouldFailCollectProcess` 不读状态，不受影响。
10. **`migrate.mjs` 不能静默成功。** `ensureSchema()` 在没有 `DATABASE_URL` 时直接返回，不报错。`migrate.mjs` 要自己先检查环境变量并以非零码退出。查法：`env -u DATABASE_URL node scripts/migrate.mjs; echo $?`，应当不是 0。
11. **`migrate.mjs` 在普通 Node 下能跑。** `db-pool.js` 顶部 import 了 `@opennextjs/cloudflare`，只在函数内部调用 `getCloudflareContext()`。采集脚本在普通 Node 下已经这样跑过，所以没问题；但 `migrate.mjs` 不要用 `--env-file` 之外的方式改变加载路径。
12. **deploy 的步骤顺序。** "Apply schema"要在 `npm test` 之后、构建之前。测试失败时不应该改库。
13. **test.yml 的触发。** 同时写 `pull_request` 和"推送到非 main 分支"时，PR 分支每次推送会跑两遍。可以接受；想省一遍就只留 `pull_request` 加 `workflow_dispatch`。不要写成推送到所有分支，否则合并进 `main` 时和 deploy 重复跑测试。
14. **`docs/db-recovery.md`。** 新项目的 pooler 主机名和区域有关，实现方不知道。文档里应当是占位符，不能留旧的 `aws-1-us-west-2`。

## 附录 B：WP0、WP1 完成记录（2026-11-14）

合并方式：squash 合并进 `main`（提交 `8b56f68`）。合并后部署成功，部署前迁移在线上库执行用时约 3 秒。

### 和方案不一致的地方

- WP1 用的是 5.2 节的做法 2（每条带 `order`，排序后去掉），没有用推荐的做法 1。附录 A 第 1 条的风险已用测试兜住：order 必须是整数且不重号，快照比对有序数组。新增信源时 order 取全局最大值 + 1。
- 4 组重名的处理：东华 5 个子站、上理工 2 个子站按子域名加后缀；海事讲座信息的 http/https 重复条目删掉一条（信源从 322 条变为 321 条，境内 261 变为 260）；上理工双创第二条改名为「（t2377）」，疑似与第一条是同一列表，需要在境内网络确认后删除。
- 部署前迁移加了锁等待上限（默认 3 秒，`MIGRATE_LOCK_TIMEOUT_MS`）和重试，手动部署可勾选 `skip_migrate`。原因：`alter table ... add column if not exists` 即使列已存在也要拿排他锁，排队时会堵住首页读查询。后续工作包加 DDL 时沿用 `ensureSchema`，不要绕过它直接在 `migrate.mjs` 里写语句。

### 上线后第一轮采集（run 102）

- 状态 `success`：260 个境内信源失败 6 个（2.3%）。
- 发布 227 条。守门比较基数是当时已发布的 257 条（比上一轮的 301 少，是窗口滚动后已结束的活动退出了窗口），本轮采到 234 条，主要差额来自格瓦拉超时。
- 各阶段耗时（总计约 20 分钟）：

  | 阶段 | 耗时 |
  |---|---|
  | 抓取解析（含读境外 artifact） | 861 秒 |
  | 写原始表 | 136 秒 |
  | LLM 润色 | 94 秒 |
  | 图片回填 | 68 秒 |
  | 同步信源配置 | 20 秒 |
  | 发布 | 19 秒 |
  | 读旧数据 | 1.5 秒 |

### 留给后续的事

- **写原始表和同步信源配置是逐行写库。** `insertRawEvents` 对 2374 行各发一次 insert，`upsertSourceConfigs` 对 260 个信源各发一次 upsert，跨境往返合计约 156 秒。改成批量写（例如每 200 行一条多值 insert）可以省下 2 分钟以上。WP7 做每日采集前值得先做。
- **`collect.yml` 的 55 分钟上限可以收紧。** 实测总耗时约 20 分钟，建议再观察两三轮后降到 35 分钟。
- **`docs/db-recovery.md` 里东京项目的 pooler 前缀待复核**，判定方法已写在文档里，需要在能解析 `*.pooler.supabase.com` 的网络环境里做。
