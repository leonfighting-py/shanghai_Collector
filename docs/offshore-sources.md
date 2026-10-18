# 境外源怎么救（出口 IP 被拦）

> 结论先说：**拦的是出口 IP，不是页面、不是 UA、不是缺少 Referer。** 所以改 parser、加 cookie、换 UA 都没用；
> 要么换出口（代理 / 境外 runner），要么放弃这些源。

## 1. 证据（2026-10 实测，逐条可复现）

| 源 | 本机（住宅 IP） | 腾讯云 runner | 判定 |
|---|---|---|---|
| Eventbrite 全站（20+ 类目） | 200 + 有数据 | 405 | A 类：出口被拦 |
| 活动行（含 18 个标签频道） | 200 + 有数据（本机 6 路并发也 200） | 403 | A 类 |
| Lu.ma / AllEvents / Meetup | 200 | 403/405 | A 类 |
| 豆瓣同城 / 票牛 / 上海图书馆 | 200 | 200 | 正常，不必代理 |

`RETIRED_SOURCE_NAMES` 里那 58 个停采源中，42 个就是这张表的产物 —— 恢复它们的唯一前提是「让请求从别的 IP 出去」。

## 2. 代码已经准备好的开关

`src/lib/outbound-proxy.js` + `src/lib/proxy-registry.js` + `fetch-html.js`：

```bash
# 只给境外域名走代理，国内源继续直连（推荐；不设白名单则全部走代理）
OUTBOUND_PROXY=http://127.0.0.1:7890
OUTBOUND_PROXY_HOSTS=eventbrite.com,meetup.com,lu.ma,allevents.in,huodongxing.com
```

- 只在 `scripts/collect-local.js` 启动时初始化；**没设 `OUTBOUND_PROXY` 时行为与改造前完全一致**（不建 dispatcher、不改任何请求）。
- 配了却加载失败（缺 `undici`、代理地址写错）→ 走致命告警通道硬失败，不会静默退化成直连。
- 白名单按「域名或子域」精确匹配：`noteventbrite.com` 不会命中 `eventbrite.com`。
- 已用本机 Clash（`127.0.0.1:7892`）实测：Eventbrite 走代理 5.0s / 788 KB 拿到内容，豆瓣仍直连 2.6s。
- ⚠️ 不要读 `HTTP_PROXY`/`HTTPS_PROXY`：WorkBuddy 沙箱会把它们预置成内网代理，连不上外网。

## 3. 三条可选路线（按性价比排序）

### 方案 A：境外 runner 单独跑「境外源」（✅ 2026-10-18 已落地）

GitHub 托管 runner 本身就在境外（Azure），不需要任何代理。
难点不在抓取，而在**发布是全量替换**（`replaceWeekEvents` 先按窗口删再插）—— 两个 job 各自发布会互相清空。
所以这条链路里**只有主采集写库**，境外 job 只产出一个 JSON 文件：

```
offshore.yml（ubuntu-latest，cron 00:20 UTC）
  └─ node scripts/collect-offshore.js → offshore-events.json → artifact「offshore-events」
collect.yml（self-hosted china，cron 01:00 UTC）
  └─ 步骤 Fetch offshore events artifact → 解出 offshore-events.json
  └─ OFFSHORE_EVENTS_FILE=offshore-events.json node scripts/collect-local.js
       └─ loadOffshoreEvents() → collectEventsFromSources({ sources: LAND_SOURCES, extraEvents })
            └─ 与境内源一起走 窗口 → filterPublishableEvents → mergeDuplicateEvents → 发布
```

代码落点：

| 文件 | 作用 |
|---|---|
| `src/lib/collector.js` | `offshore: true` 标记；导出 `OFFSHORE_SOURCES` / `LAND_SOURCES`；`collectEventsFromSources({ extraEvents })` |
| `scripts/collect-offshore.js` | 只跑 offshore 源，不读库、不发布，写 `offshore-events.json` |
| `src/lib/offshore-events.js` | 产物校验：schemaVersion、48h 新鲜度、条目结构（坏条目丢弃并计数） |
| `src/lib/collect-job.js` | 读 `OFFSHORE_EVENTS_FILE` 并合并；`sourceCount` 只算境内源 |
| `.github/workflows/offshore.yml` | 境外侧采集 + 上传 artifact（保留 7 天） |
| `.github/workflows/collect.yml` | 下载最近一次成功的 artifact（任何一步失败只 warning、不阻断） |

当前标记为 offshore 的 10 个源（2026-10-18 实测条数 / 窗口内）：
Eventbrite 上海·展览 19/5、·免费 13/7、·工作坊 14/4、·读书 11/4、·设计 12/1、·艺术 7/3、
Eventbrite Shanghai AI 18/2、Shanghai Business 8/3、活动行上海 10/7、AllEvents Shanghai 27/7。

实测（用本机 Clash 模拟境外出口）：10 个源一轮 **53.8s，原始 133 条 → 窗口内 20 条**；
AllEvents 偶发 403（Cloudflare 对同 IP 限流），失败只记进产物的 `failures`，不影响其余 9 个源。

**已知边界**：
- 产物过期（>48h）会被 `loadOffshoreEvents` 拒绝合并，Step Summary 里会写原因 —— 不要调大这个值，
  拿旧文件合并等于发布过期活动。
- 境内外两个 job 的 cron 都是 `*/2`（按月的奇偶日对齐），改其中一个的频率必须同步改另一个。
- 复活/新增 offshore 源的步骤：在 `SOURCE_SEEDS_RAW` 里给条目加 `offshore: true`，并从
  `RETIRED_SOURCE_NAMES` 里删掉同名项（否则 `SOURCE_SEEDS` 直接把它过滤掉）。

### 方案 B：把家里的代理搬上云（你问的那条）

技术上完全可行，两种做法：

- **在腾讯云 runner 上跑 mihomo/Clash，加载你现有的机场订阅**，只监听 `127.0.0.1:7890`，
  然后给 `collect.yml` 加两条 env（见下）。国内域名由 Clash 规则直连，或干脆用 `OUTBOUND_PROXY_HOSTS` 限定。
- 或者 **在境外 VPS 上跑 mihomo 做 relay**（$2~5/月），runner 指向它。比在 runner 上装客户端更干净：一台机器一个用途。

⚠️ 三个坑，先想清楚再动：

1. **机场对机房 IP 的态度**：很多订阅禁止/风控数据中心 IP，搬家后可能直接被限速或封号；先用 `curl -x` 从 runner 试通再说。
2. **别把代理端口暴露到公网**：只绑 `127.0.0.1`；要跨机就上 SSH 隧道或 WireGuard，别开 `0.0.0.0:7890` + 裸密码。
3. **代理线路抖动会变成采集失败**：现在采集已经贴着 35 min 上限，境外源走代理后每次多几百毫秒到几秒；
   建议只对白名单域名走代理，并且把境外源单独放一轮（或单独 job），别拖累国内源。

### 方案 C：不用代理，改用「境外源的镜像站」

Eventbrite 类目页在 `allevents.in` 等聚合站有镜像，但这些站同样拦数据中心 IP；
实际可用的只有「本地住宅 IP 的机器」（例如你的 Mac 定时跑一次）。代价是采集只能一处跑这条铁律会被打破
（发布是全量替换），所以不推荐。

## 4. `collect.yml` 要加的两行（方案 B）

```yaml
    env:
      OUTBOUND_PROXY: ${{ secrets.OUTBOUND_PROXY }}
      OUTBOUND_PROXY_HOSTS: eventbrite.com,meetup.com,lu.ma,allevents.in,huodongxing.com
```

Secret 未配置时 `OUTBOUND_PROXY` 为空 → 自动 disabled，不会影响现有采集。

## 5. 验收清单（改完必须逐条过）

1. 在目标机器上：`curl -x http://127.0.0.1:7890 -o /dev/null -w "%{http_code}\n" https://www.eventbrite.com/d/china--shanghai/` → 期望 200。
2. 项目内：`OUTBOUND_PROXY=... OUTBOUND_PROXY_HOSTS=... node -e 'import("./src/lib/outbound-proxy.js").then(m=>m.initOutboundProxy().then(console.log))'` → 打印 `enabled(...)`。
3. 抓一个境外源：`node scripts/candidate-verify.js`（带一个 Eventbrite 候选）→ `可解析` 且条数 > 0。
4. 跑一轮体检，看「A 类出口被拦」是否消失；再从 `RETIRED_SOURCE_NAMES` 里删掉对应名字复活。
5. **反向验证**：把 `OUTBOUND_PROXY` 清空再跑同一源 → 必须重新变回 403/405，证明「是代理在起作用」而不是源站自己好了。
6. 走方案 A 时的专项：手动 `gh workflow run offshore.yml` → 下载 artifact 看 `events` 条数；
   再 `gh workflow run collect.yml` → Step Summary 里应出现「境外源：合并 N 条（生成于 …）」。
   把 artifact 的 `generatedAt` 改成 3 天前重跑 → 摘要必须变成「stale：境外源结果已过期」。

## 6. 现状

- 方案 A 已实现并本地验证（2026-10-18）：`src/lib/collector.js` 的 `offshore` 标记与 `extraEvents`、
  `scripts/collect-offshore.js`、`src/lib/offshore-events.js`、`.github/workflows/offshore.yml`、
  `collect.yml` 的下载步骤。测试：`test/offshore-events.test.js`（8 例，含 48h 过期与坏条目丢弃）。
- 代理开关（方案 B/C 的基础设施）也已实现：`OUTBOUND_PROXY` / `OUTBOUND_PROXY_HOSTS`，
  `test/proxy-registry.test.js`（7 例）。
- **尚未推送到远端**：`offshore.yml` 需要第一次 `gh workflow run offshore.yml` 才会产生 artifact，
  在此之前 `collect.yml` 的下载步骤只会打一条 warning，不影响境内采集。
