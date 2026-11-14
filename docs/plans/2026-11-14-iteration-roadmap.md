# 迭代路线图：25 个工作日覆盖 17 条完善建议

日期：2026-11-14
状态：待评审
范围：数据层、Web 前端、小程序、内容分发、工程。每天的产出都能单独合并上线，不依赖后一天的工作。

## 0. 怎么读这份文档

- 按天排，一天对应一个人一个工作日的量，每天都写了**做什么**、**改哪些文件**、**完成标准**。
- 17 条建议的编号沿用上一轮讨论（见文末「附录 A：建议清单」），每天标注它推进的是哪一条。
- 有三个**决策点**（第 5、10、15 天结束时），按当时的数据决定后面的天数是否调整。
- 小程序提审要排队几天，所以小程序改动集中在第 18–21 天，一次提审。

### 依赖关系

```text
D1 稳定标识 slug ──┬─> D2-3 详情页 ─> D4 ICS ─> D5 收藏分享
                   └─> D16-17 期刊归档 / 海报
D1 字段探测 ──> 决策点① ──> D6-10 字段补齐 ──┬─> D13 场景入口（免费 / 带娃 / 室内）
                                             ├─> D14-15 地图
                                             └─> D24 MCP（字段更全）
D5 云函数同步脚本 ──> D18-21 小程序（订阅提醒、报名直达、分享）
```

### 需要提前办的外部事项（第 1 天就发起，有等待期）

| 事项 | 用于 | 预计等待 |
|---|---|---|
| 小程序后台申请一次性订阅消息模板（「活动开始提醒」类） | D18-19 订阅提醒 | 模板审核 1–3 天；类目不符要先补类目 |
| 查大麦 / 活动行 / 秀动小程序的 appId，并在小程序后台确认跳转是否需要关联 | D20 报名直达 | 不定，可能部分拿不到 |
| 选地理编码服务（高德 Web 服务 API 个人认证免费额度即可），申请 key | D15 地图坐标 | 实名认证当天到一天 |
| 确认周报推送渠道（飞书群 / 公众号草稿箱 / Telegram 频道，选一个先做） | D23 周报 | 无 |

---

## 第一周：Web 端快赢 + 数据摸底

本周不依赖新字段，做完站点就从一页变成几百页可分享、可收录的页面。

### 第 1 天：稳定活动标识 + 字段探测　〔#5 前置、#1〕

**为什么先做标识**：现在活动的唯一键 `dedupe_key` 是「标题|上海日期|场馆」（`src/lib/events.js:59`），带中文、很长，而且 LLM 富化改写标题后会变（`src/lib/event-enrichment.js:144`）。它不适合放进 URL，也撑不起「收藏跨两轮采集还认得」。Web 收藏（`src/app/components/useFavorites.js`）和小程序收藏（`miniprogram/utils/favorites.js`）现在都靠它，标题一改，收藏就丢了。

上午：`slug`
- `events` 表加列 `slug text unique`，写法沿用 `repository.js` 的 `alter table ... add column if not exists`。
- 生成规则：`sha1(规范化后的首个 source_url + "|" + 上海开始日期)` 取前 10 位，base32。不用标题，标题会被富化改写。
- `replaceWeekEvents` 的插入和冲突更新带上 `slug`；`listEvents` 返回 `slug`；`/api/events` 的字段白名单和 `page.js` 的 `CLIENT_FIELDS` 加上 `slug`。
- 收藏迁移：Web 和小程序读到旧格式（`dedupe_key`）时按 `dedupe_key` 匹配一次换成 `slug` 存回去，匹配不上的保留原样，不删。
- 云函数 `cloudfunctions/events/lib/*.mjs` 同步复制（第 5 天会把这一步脚本化）。

下午：`scripts/facets-probe.js`（字段补齐方案 `2026-10-12-event-facets-backfill.md` 的第 1 步）
- 每个信源取 5 个详情页，统计 JSON-LD Event、街道地址、票价、「免费」字样各能提取到多少。
- 重点看格瓦拉、豆瓣、票牛：详情页是不是脚本渲染、正文里有没有票价。
- 输出 `scripts/facets-probe-report.md`，按信源一行。

**完成标准**：`npm test` 通过，新增 slug 生成和收藏迁移的单测；跑一轮采集后库里每条活动都有 slug，并且同一活动两轮采集 slug 不变；探测报告提交。

### 第 2 天：活动详情页 `/e/[slug]`　〔#5〕

- 新增 `src/app/e/[slug]/page.js`，服务端按 slug 查单条（`repository.js` 新增 `getEventBySlug`，只查发布表）。
- 内容：封面、标题、时间（复用 `src/lib/agenda.js` 的格式化）、场馆、区域、分类、来源列表（`sources` jsonb，多源合并时都列出来）、摘要、「去报名」外链按钮。
- 首页的推荐卡（`page.js` 的 `.pick`）和日程行（`EventBrowser.js` 的 `AgendaRow`）改成先进站内详情页，原来的外链放到详情页按钮上。日程行保留一个小的「直达」图标，给只想跳走的用户。
- **已结束和已清理的活动**：数据保留到结束后 7 天（`repository.js` 的 `EVENT_RETENTION_DAYS`）。slug 查不到时返回 410 并显示「活动已结束」，同时列出同类目近期活动，不出空白 404。
- 样式沿用 `styles.css` 的「素白」token，深浅色都要验。

**完成标准**：本地 `npm run dev` 能从首页点进详情页再点出去报名；不存在的 slug 返回 410 页面；手机宽度无横向滚动。

### 第 3 天：详情页的分享与收录　〔#5〕

- `generateMetadata`：标题、描述、canonical。
- OG 图：`src/app/e/[slug]/opengraph-image.js`，用 `next/og` 生成 1200×630 图，排版为封面裁切加标题、日期、场馆。先确认 OpenNext Cloudflare 构建下 `next/og` 能跑，不能跑就退回直接用活动封面图。
- 页面内嵌 JSON-LD `Event`（`name`、`startDate`、`endDate`、`location`、`url`、`image`），有利于搜索结果出富卡片。
- `src/app/sitemap.js`：把发布窗口内每条活动的 `/e/[slug]` 加进去。
- 详情页底部「同场馆 / 同一周末」的其他活动各 3 条，用现有的 `listEvents` 结果在内存里筛，不加查询。
- `feed.xml` 的 `<link>` 改成指向站内详情页。

**完成标准**：用 opengraph.xyz 一类的工具检查分享卡片；Google Rich Results Test 认出 Event；sitemap 条数等于窗口内活动数加固定页。

### 第 4 天：加入日历（ICS / webcal）　〔#6〕

- 新增 `src/lib/ical.js`：纯函数，事件数组转 RFC 5545 文本。处理好这几点：`TZID=Asia/Shanghai` 加 `VTIMEZONE`、行折叠（75 字节）、逗号分号转义、长档期展览用全天事件（`VALUE=DATE`）、没有结束时间的单场活动默认 2 小时。`UID` 用 `slug@站点域名`。
- 路由：
  - `/e/[slug]/event.ics`：单条下载，详情页放「加入日历」按钮。
  - `/calendar.ics?category=&district=`：订阅源，页面给 `webcal://` 链接。白名单校验参数，和 `feed.xml` 一样拒绝非法类目。
  - `/calendar.ics?slugs=a,b,c`：收藏导出，最多 100 个。
- 缓存头：订阅源 `Cache-Control: public, max-age=3600`。

**完成标准**：`test/ical.test.js` 覆盖时区、折叠、转义、全天事件；导入 iOS 日历、Google 日历、macOS 日历各验一次，时间不偏 8 小时。

### 第 5 天：收藏可分享 + 云函数副本同步脚本　〔#10、#16〕

上午：收藏清单分享（#10）
- 收藏视图加「分享清单」：把 slug 列表编码进 URL（`/?list=slug1.slug2...`），打开后显示「朋友分享的清单」，可以一键全部加入自己的收藏。
- 同一个清单可以「导出到日历」，复用第 4 天的 `/calendar.ics?slugs=`。
- 不做登录，不做服务端存储。

下午：`npm run sync:cloudfn`（#16）
- 新增 `scripts/sync-cloudfn-lib.mjs`：把 `src/lib` 里云函数依赖的 4 个文件复制到 `miniprogram/cloudfunctions/events/lib/*.mjs`，处理好 import 路径后缀。
- `test/cloudfunction-lib-parity.test.js` 失败时的报错信息改成「请运行 npm run sync:cloudfn」。
- README 小程序一节把「必须重新复制」改成运行这个脚本。

**决策点①（第 5 天收尾）**：看第 1 天的探测报告。
- 主要票务源拿得到票价：第二周按原方案做全部四层。
- 拿不到票价：价格只做 JSON-LD 和正文正则两条路，不追；第 9 天的 LLM 兜底只补区域和人群；省下的时间并入第 11–12 天加信源。
- 结论写进 `2026-10-12-event-facets-backfill.md` 末尾。

---

## 第二周：字段补齐（区域 / 地址 / 价格 / 免费 / 人群）

完整设计见 `docs/plans/2026-10-12-event-facets-backfill.md`，这里只排日程。

### 第 6 天：加列、读写、合并、接口 + 第 0 层　〔#1〕

- 加列：`address`、`price_min`、`price_max`、`is_free`、`audience`（jsonb，默认 `[]`）、`facet_provenance`（jsonb，默认 `{}`）。`district` 已有。
- 同步：`replaceWeekEvents`、`listEvents`、`events.js` 的 `mergeDuplicateEvents`（取非空值，冲突时取信源等级高的一方，等级见 `src/lib/sources/tier.js`）、`/api/events` 白名单、`llms.txt` 字段说明、云函数副本（用第 5 天的脚本）。
- 第 0 层：单场馆信源在 `src/lib/sources/seeds/*.js` 里写死 `venue`，逐个核对。
- 注意：分类下跌保护会从 `listEvents` 读旧数据顶替（`collect-job.js`），所以查询必须带新字段。

**完成标准**：仓库层写入读出一致的单测；合并的两种情况各有单测；快照测试 `test/fixtures/source-registry.snapshot.json` 更新。

### 第 7 天：详情页共用抓取 + 缓存表 + 第 1 层提取　〔#1〕

- 把「抓详情页」从 `src/lib/image-backfill.js` 里抽成 `src/lib/detail-fetch.js`：本轮采集内存缓存加 `event_detail_cache` 表（主键 `source_url`，有效期 7 天），图片回填和字段提取都从它取。
- 并发 4，单域名 2，遵守 `src/lib/robots.js`。
- 新增 `src/lib/facet-extract.js`：JSON-LD Event 优先，其次是地址、票价、免费字样的正则。带「儿童免费」「会员免费」限定的不算免费。
- 接进 `collect-job.js`：分类过滤之后、分类下跌保护之前。阶段耗时进 `collect-result.js` 的计时。

**完成标准**：每种价格写法、地址写法、免费限定各一个 fixture 用例；缓存有效期内不重抓的单测；本地 `collect-simulate.js` 跑通。

### 第 8 天：场馆字典 + 第 2 层规则　〔#2、#1〕

- 新建 `src/lib/venue-profiles.js`。字段：`name`、`aliases`、`district`、`address`、`lat`、`lng`、`metro`（最近地铁站，可空）、`indoor`（布尔，给第 13 天「雨天室内」用）、`hours`（可空）。
- 首批覆盖窗口内出现过的场馆名（方案里统计是 66 个）。由实现方起草，**交用户人工核对后再合入**。经纬度这天先留空，第 15 天批量地理编码。
- 匹配：先归一化，再按别名做子串匹配，长别名优先（「上海博物馆东馆」不能落到「上海博物馆」）。
- 互补规则按方案第 4 节的表实现，每行一个单测。
- 和 `src/lib/event-classify.js` 现有的区域地标规则（`DISTRICT_LANDMARKS`）合并：字典命中优先，规则兜底，避免两套来源打架。

**完成标准**：长别名优先、场次名不命中、每条互补规则都有单测；字典草稿发给用户核对。

### 第 9 天：外地活动守门 + 第 3 层 LLM 兜底　〔#4、#1〕

上午：外地活动识别（#4）
- `src/lib/publish-guard.js` 加一条：地址或场馆明确落在上海以外（命中「苏州 / 杭州 / 南京 / 无锡…」加「市 / 区」结构，或地址不含「上海」而含其他城市名）时拦截，计入告警的「发布守门拦截」。
- 先只记录不拦截跑一轮（`OFFSITE_GUARD_MODE=report`），看误伤后再改成拦截。

下午：LLM 兜底
- 新增 `src/lib/facet-llm.js`，复用 `siliconflow.js` 的调用和预算熔断，写法参照 `event-enrichment.js`。
- 校验不过的字段丢弃：区名必须在 16 区内、人群标签必须在四个之内、价格数字必须能在正文里原样找到、`is_free=true` 时正文必须有免费的同义词。
- 开关 `LLM_FACETS_ENABLED`，默认关；补进 `.env.example` 和 README。

**完成标准**：编造价格、名单外的区、名单外的标签都被丢弃的单测；守门的 report 模式输出被拦条目清单。

### 第 10 天：覆盖率与验收　〔#1〕

- `scripts/facets-coverage.mjs`：输出方案第 2 节那张表的新数字，外加各字段覆盖率、各层贡献。
- 在自建 runner 上触发一轮完整采集（`collect.yml` 手动 Run workflow），看新阶段耗时，确认总时长离 55 分钟上限还有余量。
- 人工抽查 30 条：区域和价格错误不超过 2 条，超了就关掉出错最多的那一层再查。

**决策点②**：
- 「有区域」低于 60%：第 11 天先补场馆字典，加信源顺延半天。
- 「价格已知」低于 20%：第 13 天的场景入口去掉「免费」卡，等数据。
- 采集时长超过 45 分钟：给 `event_detail_cache` 的命中率出数，必要时把详情页抓取挪到发布后异步做。

---

## 第三周：供给扩充 + 前端场景化

### 第 11 天：加信源（线下活动）　〔#3〕

- 用 `scripts/source-discovery.js` 和 `scripts/candidate-score.js` 定向找：市集、读书会、城市漫步、公益志愿、社区图书馆活动。
- 候选先过 `scripts/candidate-verify.js`，再过 robots 闸门，合格的写进 `src/lib/sources/seeds/offline.js`。
- 每个新源要有解析器单测或 fixture；能用通用的 `listing` / `json-ld` / `llmExtract` 就不写专用解析器。

**完成标准**：新增至少 8 个通过体检的线下活动源；`npm run health` 报告里新源全部可用。

### 第 12 天：加信源（高校讲座）　〔#3〕

- `src/lib/sources/seeds/lectures.js` 已经 1900 多行，先按学校分组拆成几个文件，再加源。
- 方向：复旦、交大、同济、华师大、上外的学术报告和公开课栏目里还没收录的；各区图书馆讲座；上图东馆。
- 讲座类信源多是 `.edu.cn`，必须跑在境内 runner 上，确认路由正确。

**完成标准**：窗口内高校讲座条数比第 10 天翻倍（基线约 4 条）；快照测试更新。

### 第 13 天：场景入口　〔#7〕

- 首页类目 Tab 上方加一排场景卡：「今晚」「这个周末」「免费」「雨天室内」「带娃」。
- 筛选逻辑放 `src/lib/scenes.js`，纯函数加单测：
  - 今晚、周末：复用 `src/lib/recommendations.js` 里的上海时区判断（`shanghaiHour` 等），抽成公共函数。
  - 免费：只出 `is_free === true`。
  - 雨天室内：场馆字典 `indoor === true`，或类目是展览且场馆命中字典。
  - 带娃：`audience` 含「亲子」。
- 某个场景筛出少于 3 条时，卡片不显示，不放空入口。
- URL 参数 `?scene=tonight`，可以分享、可以收录；sitemap 加上场景页。

**完成标准**：每个场景的筛选规则有单测；数据不足时卡片自动隐藏。

### 第 14 天：区域热度视图　〔#8〕

- 不依赖坐标的第一版：日程表旁边加「按区看」切换，16 区示意图（SVG 简化区块，不要求真实边界）加每区活动数，点区块等于选中区域筛选（`EventBrowser.js` 已有 `district` 状态）。
- 色阶用单色深浅，深浅色模式下都要看得清。

**完成标准**：点击区块和筛选面板里的区域选项结果一致；手机宽度能用。

### 第 15 天：场馆坐标 + 地图视图　〔#8、#2〕

- `scripts/geocode-venues.mjs`：对 `venue-profiles.js` 里缺 `lat/lng` 的场馆批量地理编码，结果写回文件并人工抽查。这是一次性脚本，不进采集流程。
- 前端地图：用 Leaflet 加高德或 OSM 瓦片，在「按区看」里多一个「地图」选项，同场馆的活动合成一个点。地图组件按需加载，不拖慢首屏。
- 坐标用 GCJ-02 还是 WGS-84 要和瓦片一致，写清楚。

**决策点③**：地图上线一周后看点击数据（第 22 天的 `/status` 页可以顺带统计）。没人用就收回成「按区看」，不再维护坐标。

---

## 第四周：期刊归档 + 小程序

### 第 16 天：期刊归档 `/issue/[date]`　〔#9〕

- 新表 `issues`：`issue_date`（主键）、`label`、`highlights`（jsonb，存当期推荐的 slug 和快照字段）、`stats`、`created_at`。
- 采集发布成功后写入一期（`collect-job.js` 末尾），快照字段直接存，不依赖活动表，所以活动被清理后归档仍然完整。
- 页面 `/issue/[date]` 和归档列表 `/issues`，复用首页「本期推荐」的样式；首页 `issue-strip` 加「往期」入口。

**完成标准**：活动被 cleanup 删掉后，往期页面仍能完整显示；sitemap 收录往期。

### 第 17 天：期刊分享海报　〔#9〕

- `/issue/[date]/poster.png`：用 `next/og` 生成竖版长图（1080×1920），排版为期号、5 条推荐、二维码（指向本期页面）。
- 首页和往期页加「保存海报」按钮。
- 如果 `next/og` 在 Cloudflare 上遇到字体体积问题，改成在 GitHub Actions 里用 `scripts/render-shanghai-cover.mjs` 同样的方式预渲染，放进 Release 或对象存储。

**完成标准**：海报中文不缺字、二维码能扫；单张小于 1 MB。

### 第 18 天：订阅提醒（前端 + 存储）　〔#11〕

- 前提：模板已在第 1 天申请通过。
- 详情页和收藏按钮点击时调用 `wx.requestSubscribeMessage`，用户同意后调用新云函数 `subscribe`，写入云开发数据库集合 `reminders`：`openid`、`slug`、`remind_at`（开始前 1 天的 10:00，长档期展览改成闭展前 3 天）、`sent`。
- 同一用户同一活动只存一条；取消收藏时删除。
- 一次性订阅每次同意只能发一条，文案上说清楚「会在开始前一天提醒你一次」。

**完成标准**：开发者工具里同意订阅后数据库有记录；取消收藏后记录消失。

### 第 19 天：订阅提醒（定时发送）　〔#11〕

- 新云函数 `remind-sender`，配置定时触发器（每小时一次）：取 `remind_at <= now and sent = false` 的记录，按 slug 去 Supabase 查最新信息（时间改了就按新时间算，活动没了就标记跳过），调用 `subscribeMessage.send`。
- 发送失败（用户拒收、额度用完）记录原因，不重试。
- 消息点击跳转小程序详情页 `pages/detail/detail?slug=`；详情页改成支持按 slug 拉单条（云函数 `events` 加 `action: "get"`）。

**完成标准**：把一条记录的 `remind_at` 改成过去时间，下一个整点收到消息；点击能打开对应详情。

### 第 20 天：报名直达 + 分享卡片　〔#12、#13〕

上午：报名直达（#12）
- 把第 1 天查到的 appId 填进 `miniprogram/utils/registration.js` 的 `REGISTRY`，按链接域名匹配，用 `wx.navigateToMiniProgram` 跳转并带上活动页路径（拿不到路径就跳首页）。
- 拿不到 appId 的平台保持「复制链接」。
- README 待办里这一条勾掉。

下午：分享卡片（#13）
- `detail.js` 的 `onShareAppMessage` 带上活动封面（`imageUrl`），路径带 slug；首页的 `onShareTimeline` 带期号。
- 封面图走 `src/lib/image-url.js` 现有的尺寸处理，确保 5:4 且小于 128 KB。

**完成标准**：真机分享给好友，卡片显示封面；对方点开直接到对应活动。

### 第 21 天：小程序海报 + 提审　〔#13〕

- 详情页加「生成海报」：canvas 2d 绘制封面、标题、时间、场馆、小程序码（云函数调用 `wxacode.getUnlimited`，`scene=slug`），然后 `wx.saveImageToPhotosAlbum`。
- 首页入口改成读取 `scene` 参数跳详情。
- 第 18–21 天的改动一起上传、提审。提审前对照 `docs/miniprogram-launch.md` 补隐私指引（订阅消息和保存相册都要声明）。

**完成标准**：真机生成的海报扫码能进对应活动；提交审核。

---

## 第五周：运营看板 + 内容分发 + agent 接入

### 第 22 天：内部看板 `/status`　〔#17〕

- 页面放在 Web 端，用 `COLLECT_SECRET` 做简单鉴权（Basic Auth 或带 token 的 URL），`robots` 禁止收录。
- 数据来自 `collection_runs`（`repository.js` 已有 `listRecentCollectionRuns`）：最近 20 轮的状态（success / degraded / blocked）、各阶段耗时堆叠条、发布条数趋势、失败最多的 10 个信源、字段覆盖率（复用第 10 天的统计函数）。
- 画图前先过一遍 dataviz 规范，避免一页十几种颜色。

**完成标准**：在浏览器里能一眼看出最近一轮慢在哪个阶段、哪些源持续失败。

### 第 23 天：每周精选自动生成与推送　〔#14〕

- `scripts/weekly-digest.mjs`：取下周五到周日的活动，按 `recommendations.js` 的评分选 8–10 条，交给 SiliconFlow 写一段 150 字以内的编辑导语和每条一句推荐语（复用 `event-enrichment.js` 的校验思路：推荐语不能出现输入里没有的时间、价格）。
- 输出两份：Markdown（可直接贴公众号）和飞书卡片 JSON。
- `.github/workflows/digest.yml`：每周四 12:00（上海时间）运行，推到第 1 天选定的渠道。飞书复用 `src/lib/alerting.js` 的 webhook 发送，但用另一个 webhook 变量（`FEISHU_DIGEST_WEBHOOK_URL`），别和告警混在一个群。
- 精选链接指向第 3 天的站内详情页，带 `?utm_source=digest`。

**完成标准**：手动运行 workflow，渠道里收到精选；导语里没有编造的信息（人工看三期）。

### 第 24 天：MCP server　〔#15〕

- 新目录 `mcp/`，一个独立的小包，用官方 MCP SDK，只读，数据走公开的 `/api/events`，不连数据库。
- 工具：
  - `search_events(query?, category?, district?, date_from?, date_to?, free_only?)`
  - `get_event(slug)`
  - `list_categories()`
- 两种运行方式：本地 stdio（`npx`）；远程 Streamable HTTP，作为 Worker 上的一个路由 `/mcp`（确认 OpenNext 能挂就挂，挂不了就单独一个 Worker）。
- `llms.txt` 加 MCP 接入说明；README 加一节。

**完成标准**：在 Claude Desktop 里接入后能回答「这周末浦东有什么免费展览」，返回的链接是站内详情页。

### 第 25 天：缓冲与回顾

- 处理小程序审核意见。
- 把第 15 天的决策点③、第 10 天的覆盖率、第 22 天看板上的数据汇总成一页回顾，决定下一轮方向。
- 更新 README：新路由（`/e/`、`/issue/`、`/calendar.ics`、`/status`、`/mcp`）、新环境变量、新 workflow。

---

## 附录 A：建议清单与对应日期

| # | 建议 | 安排在 |
|---|---|---|
| 1 | 字段补齐（价格 / 免费 / 人群 / 地址） | D1 探测，D6–D10 |
| 2 | 场馆字典（区域、坐标、地铁、室内） | D8，D15 坐标 |
| 3 | 补线下活动和讲座供给 | D11–D12 |
| 4 | 外地活动识别 | D9 |
| 5 | 站内活动详情页 + OG + SEO | D1 前置，D2–D3 |
| 6 | 加入日历（.ics / webcal） | D4 |
| 7 | 场景入口 | D13 |
| 8 | 地图视图 | D14–D15 |
| 9 | 期刊归档与分享海报 | D16–D17 |
| 10 | 收藏导出 / 分享清单 | D5 |
| 11 | 小程序订阅提醒 | D18–D19 |
| 12 | 小程序报名直达 | D20 |
| 13 | 小程序分享卡片与海报 | D20–D21 |
| 14 | 每周精选自动推送 | D23 |
| 15 | MCP server | D24 |
| 16 | 云函数副本同步脚本 | D5 |
| 17 | 采集状态看板 | D22 |

## 附录 B：贯穿全程的约定

- 每天一个 PR，`npm test` 必须通过（`.github/workflows/test.yml`）。
- 改了表结构的 PR，合并后先等 `deploy.yml` 的迁移跑完，再上传云函数，顺序不能反（README 小程序一节有说明）。
- 动了 `src/lib` 里云函数依赖的文件，跑 `npm run sync:cloudfn`（第 5 天以后）。
- 新信源一律过 robots 闸门；新的外部请求一律有超时和并发上限。
- 新增的 LLM 调用都带独立开关，默认关，并计入 `LLM_BUDGET_MAX_CALLS` 预算。
