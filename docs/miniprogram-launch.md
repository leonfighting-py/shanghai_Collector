# 小程序上线手册（沪上双周活动）

配套 README 第「微信小程序」章节。本文只讲**怎么从 0 走到线上**，以及上线前必须补的缺口。

## 0. 链路评估结论

链路设计成立，不是空架子：

- `cloudrun/server.js` 本地直连 Supabase 实测通过，`/api/events` 返回 **157 条**真实数据；
- 响应字段与 Web 端 `src/app/api/events/route.js` 完全一致（11 个公开字段，无内部字段泄漏）；
- `week / category / search` 三个参数与参数校验全部生效（非法分类返回 400）；
- `src/lib/events.js`、`src/lib/dedupe.js` 是零外部依赖的纯函数，`Dockerfile` 只 COPY 这两个文件即可，逻辑复用成立；
- `wx.cloud.callContainer` 走微信内网，**不需要服务器域名、不需要 ICP 备案**，个人主体可用。

采集层完全不用动：GitHub Actions 每两日写 Supabase，小程序与 Web 端读同一份数据。

## 1. 上线前必补（阻塞项）

| # | 位置 | 现状 | 要做什么 |
| - | ---- | ---- | -------- |
| 1 | `miniprogram/project.config.json` | `"appid": "touristappid"` | 换成你自己的 AppID，否则无法真机预览、无法上传 |
| 2 | `miniprogram/utils/config.js` | `CLOUD_ENV: ""` | 填云托管环境 ID。不填的话 `utils/api.js` 会直接 reject，页面永远显示「请配置云托管环境 ID」 |
| 3 | 仓库根目录 | 无 `.dockerignore` | 必须加。云托管构建上下文是仓库根目录，会把 `node_modules`（2.5 万文件）、`.next`、`.git` 全量上传，构建极慢甚至超时 |
| 4 | `miniprogram/app.json` | 无 `navigateToMiniProgramAppIdList` | 一旦在 `utils/registration.js` 填了大麦/活动行/秀动的 appId，必须在此声明白名单，否则 `wx.navigateToMiniProgram` 直接失败 |

建议的 `.dockerignore`：

```text
node_modules
.next
.open-next
.wrangler
.worktrees
.git
.github
deep-research-reports
test
cloudrun/node_modules
```

## 2. 非阻塞但建议修

- **封面图相对路径**：157 条里有 26 条 `image_url` 是 `/xxx.jpg`、`../../images/fx300.jpg` 这类相对路径（全部来自高校讲座源）。小程序 `<image>` 必然加载失败，虽然有 `binderror` 降级隐藏，但等于白丢 26 张图。Web 端靠 `src/lib/image-url.js` 的 `isUsableImage()` 过滤，小程序侧没有这套逻辑。要么在 `cloudrun/server.js` 的 `toPublicEvent()` 里过滤掉非 http(s) 的图，要么在采集侧按 `source_url` 补全绝对地址。
- **报名直达未启用**：`utils/registration.js` 的 `REGISTRY` 三个 appId 都是空的，当前所有报名都走「复制链接」降级。填 appId 后记得同步改 `app.json`。
- **小程序名称**：`沪上双周活动` 含地名，个人主体提交时可能被要求说明。准备一个备选名（如「双周活动雷达」）备用。
- **订阅消息**：个人主体只能用一次性订阅，活动开始前提醒可以后续再接。

## 3. 注册小程序，拿 AppID

1. 打开 <https://mp.weixin.qq.com> → 右上角 **立即注册** → 选 **小程序**。
2. 填一个**从未注册过公众平台**的邮箱 → 去邮箱点激活链接。
3. 主体类型选 **个人** → 填身份证姓名 + 号码 → 管理员微信扫码（管理员本人需微信实名）。
4. 填小程序名称、简介 → 提交，注册完成。
5. 进入后台 → **开发管理 → 开发设置** → 复制 **AppID（小程序 ID）**，形如 `wx` 开头 18 位。这一步的产物就是它。
6. （强烈建议）**设置 → 微信认证 → 个人认证，30 元**。个人主体不认证也能跑，但云托管环境创建、审核通过率都会更顺。

## 4. 开通微信云托管，创建环境

1. 打开 <https://cloud.weixin.qq.com/cloudrun>，微信扫码登录（用管理员微信）。
2. 首次进入会让你选「小程序 / 公众号」——**选刚注册的那个小程序**，系统随之创建第一个环境。
3. 付费模式必须是 **按量付费**（云托管只支持按量环境；预付费环境需先切换）。
4. 进入 **全局设置 → 环境信息**，复制 **环境 ID**，形如 `prod-8g0xxxxxxxxx`。这就是 `CLOUD_ENV`。
5. 注意：云托管环境和「云开发环境」是两套体系，**只能在云托管控制台看到**，微信开发者工具的云开发控制台里找不到它。

关联关系：环境是按所选小程序主体创建的，因此**天然与该 AppID 关联**，`callContainer` 默认只能访问本小程序已关联的环境。跨主体共享要另走「资源复用」，本项目不需要。

## 5. 部署 events-api 服务

1. 云托管控制台 → **服务管理 → 新建服务**，服务名填 **`events-api`**（必须与 `config.js` 里的 `SERVICE` 一致，写错就是 404）。
2. 代码来源选「代码库 / 本地代码」，指向本仓库。构建配置是成败关键：
   - **构建目录：仓库根目录**（不能填 `cloudrun`，因为 Dockerfile 要 `COPY src/lib/*`）
   - **Dockerfile 路径：`cloudrun/Dockerfile`**
   - **监听端口：80**（Dockerfile 里已写死 `PORT=80`）
3. 环境变量：`DATABASE_URL` = Supabase **Transaction pooler（6543）** 连接串。
4. 部署完成后，**服务设置 → 公网访问**先保持开启，用于验证；验证通过后可关闭，只留 `callContainer` 内网链路更安全。
5. 验证：

   ```bash
   curl https://<服务默认域名>/api/health   # 期望 {"status":"ok"}
   curl "https://<服务默认域名>/api/events" # 期望 events 数组非空
   ```

   本地不部署也能验证：`cd cloudrun && npm install && PORT=8787 node --env-file=../.env server.js`

## 6. 开发者工具导入与关联

1. 装微信开发者工具（稳定版即可），用管理员微信登录。
2. **导入项目** → 目录选仓库里的 **`miniprogram/`** → 填第 3 步拿到的 AppID → 后端服务选「不使用云服务」（云托管不需要勾选云开发）。
3. 打开 `miniprogram/utils/config.js`，填两个值：

   ```js
   CLOUD_ENV: "prod-8g0xxxxxxxxx",  // 第 4 步的环境 ID
   SERVICE: "events-api",           // 第 5 步的服务名
   ```

4. `project.config.json` 的 `appid` 同步改成同一个 AppID。
5. 点编译。首页应直接出现活动列表（14 天窗口全量，客户端分批上屏）。

## 7. 预览、上传、审核、发布

1. **真机预览**：开发者工具点「预览」，管理员/体验成员扫码。真机才走真实 `callContainer` 链路，模拟器不算数。
2. **上传**：点「上传」填版本号与备注，后台「版本管理」里出现体验版。
3. **类目**：个人主体别选「资讯」类目（个人不可选），建议 **工具 → 信息查询** 或 **生活服务**。功能与类目不符是最常见的驳回原因。
4. **提交审核**：后台「版本管理 → 提交审核」，备好功能页面截图和类目。个人主体一般 1–3 天。
5. **发布**：审核通过后点「发布」。此后数据由 GitHub Actions 每两日更新，小程序无需重新发版。

## 8. 排障速查

| 现象 | 原因 |
| ---- | ---- |
| 页面提示「请先在 config.js 中配置云托管环境 ID」 | `CLOUD_ENV` 为空 |
| `callContainer` 返回 404 / 服务不存在 | `X-WX-SERVICE` 与控制台服务名不一致 |
| `callContainer` 报无权访问 | 云托管环境未与该 AppID 关联（换环境了 / 选错小程序） |
| 列表一直「加载中」或 0 条 | `DATABASE_URL` 没填或填错，先 curl `/api/health` |
| 图片大面积裂图 | 相对路径 / 图床防盗链，见第 2 节 |
| 开发者工具正常、真机空白 | 真机用的是线上云托管服务，确认服务已发布版本且公网访问开启 |

## 9. 已知边界

- 个人主体不能用 `web-view`，第三方报名页任何主体都无法内嵌，报名统一走复制链接（已实现）。
- 收藏存在本地 Storage，换设备不同步；需要跨设备时再上云托管用户态（`X-WX-OPENID` 由平台自动注入）。
