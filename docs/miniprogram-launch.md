# 小程序上线手册（沪上双周活动）

配套 README 第「微信小程序」章节。本文只讲**怎么从 0 走到线上**，以及上线前必须补的缺口。

## 0. 链路评估结论

链路设计成立，不是空架子：

- `cloudrun/server.js` 本地直连 Supabase 实测通过，`/api/events` 返回真实数据（评估当天 157 条，补图过滤后复测 199 条，随每两日采集变动）；
- 响应字段与 Web 端 `src/app/api/events/route.js` 完全一致（11 个公开字段，无内部字段泄漏）；
- `week / category / search` 三个参数与参数校验全部生效（非法分类返回 400）；
- `src/lib/events.js`、`src/lib/dedupe.js` 是零外部依赖的纯函数，`Dockerfile` 只 COPY 这两个文件即可，逻辑复用成立；
- `wx.cloud.callContainer` 走微信内网，**不需要服务器域名、不需要 ICP 备案**，个人主体可用。

采集层完全不用动：GitHub Actions 每两日写 Supabase，小程序与 Web 端读同一份数据。

## 1. 上线前必补（阻塞项）

| # | 位置 | 状态 | 说明 |
| - | ---- | ---- | ---- |
| 1 | `miniprogram/project.config.json` | 已填 `wx9fbcd7833ef0590c` | 换 AppID 后才能真机预览、上传 |
| 2 | `miniprogram/utils/config.js` | 已填 `prod-d2gcdfycq884b1e6b` | 云托管环境 ID。留空的话 `utils/api.js` 会直接 reject，页面永远显示「请配置云托管环境 ID」 |
| 3 | `.dockerignore`（仓库根） | 已添加 | 云托管构建上下文是仓库根目录，不加会把 `node_modules`、`.next` 全量上传——实测上下文 **1818 MB → 1.1 MB** |
| 4 | `Dockerfile`（仓库根） | 已添加 | 云托管「绑定 GitHub 仓库」只在**仓库根目录**找 Dockerfile，报 `代码仓库中没有找到Dockerfile` 就是这个原因。根目录这份与 `cloudrun/Dockerfile` 内容一致 |
| 5 | `miniprogram/app.json` | 待办 | 一旦在 `utils/registration.js` 填了大麦/活动行/秀动的 appId，必须加 `navigateToMiniProgramAppIdList` 声明白名单，否则 `wx.navigateToMiniProgram` 直接失败 |

`config.js` 里的两个值（均已在仓库中填好）：

```js
CLOUD_ENV: "prod-d2gcdfycq884b1e6b",  // 云托管控制台「全局设置 - 环境信息」的环境 ID
SERVICE: "events-api",                // 必须与控制台创建的服务名逐字一致，写错就是 404
```

**改完这些代码必须 push 到 GitHub**——云托管绑定仓库是从**远端仓库**拉代码构建的，本地改了不 push 等于没改。

## 2. 非阻塞但建议修

- ~~封面图相对路径~~ **已修**：`cloudrun/server.js` 的 `toPublicEvent()` 现在会把非 http(s) 的 `image_url` 置为 `null`（当前 199 条里 126 条无封面，73 条正常）。小程序 `<image wx:if>` 直接不渲染，走无图样式，不会有裂图。这是与 Web 端 DTO 的**有意差异**——Web 端把相对路径交给 `src/lib/image-url.js` 在前端过滤。
- **报名直达未启用**：`utils/registration.js` 的 `REGISTRY` 三个 appId 都是空的，当前所有报名都走「复制链接」降级。填 appId 后记得同步改 `app.json`（见上表第 4 项）。
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
6. **首次进入如果停在「免费快速部署 / 选择模板」页**：随便选 **Express.js** 走完即可——这一步的唯一目的是把环境创建出来（本项目本身就是 Express，选它后续对照最直观）。但**不要把这个示例服务当正式服务**，环境建好后回「服务管理」另建 `events-api`，示例服务可以直接删掉。

关联关系：环境是按所选小程序主体创建的，因此**天然与该 AppID 关联**，`callContainer` 默认只能访问本小程序已关联的环境。跨主体共享要另走「资源复用」，本项目不需要。

## 5. 部署 events-api 服务

1. 云托管控制台 → **服务管理 → 新建服务**，服务名填 **`events-api`**（必须与 `config.js` 里的 `SERVICE` 一致，写错就是 404）。
2. 代码来源选 **绑定 GitHub 仓库** → 仓库 `leonfighting-py/shanghai_Collector` → 分支 `main` → 端口 `80`。
   - 云托管**只在仓库根目录查找 Dockerfile**，仓库根已放了一份（与 `cloudrun/Dockerfile` 内容一致），所以直接点发布即可
   - 构建目录保持默认（仓库根），**不要填 `cloudrun`**——Dockerfile 里要 `COPY src/lib/*`，改成子目录会找不到
   - 想用「指定 Dockerfile 路径」（新建版本 → 高级设置）也行，填 `cloudrun/Dockerfile`，效果等价
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
3. `miniprogram/utils/config.js` 的两个值仓库里已填好（`prod-d2gcdfycq884b1e6b` + `events-api`），正常不用改。换环境时才需要动。
4. `project.config.json` 的 `appid` 已填 `wx9fbcd7833ef0590c`。
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
| 发布时报 `代码仓库中没有找到Dockerfile` | 云托管只在**仓库根目录**找 Dockerfile，放子目录不认（或改用高级设置指定路径） |
| 页面提示「请先在 config.js 中配置云托管环境 ID」 | `CLOUD_ENV` 为空 |
| `callContainer` 返回 404 / 服务不存在 | `X-WX-SERVICE` 与控制台服务名不一致 |
| `callContainer` 报无权访问 | 云托管环境未与该 AppID 关联（换环境了 / 选错小程序） |
| 列表一直「加载中」或 0 条 | `DATABASE_URL` 没填或填错，先 curl `/api/health` |
| 图片大面积裂图 | 相对路径 / 图床防盗链，见第 2 节 |
| 开发者工具正常、真机空白 | 真机用的是线上云托管服务，确认服务已发布版本且公网访问开启 |

## 9. 已知边界

- 个人主体不能用 `web-view`，第三方报名页任何主体都无法内嵌，报名统一走复制链接（已实现）。
- 收藏存在本地 Storage，换设备不同步；需要跨设备时再上云托管用户态（`X-WX-OPENID` 由平台自动注入）。
