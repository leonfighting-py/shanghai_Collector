# sn-deep-research 生态系统改进建议

## 主线一：确定性 Runner

### 问题
当前 `sn-deep-research` 的控制流完全依赖 LLM Controller（即运行 Agent 的模型）理解和记忆阶段顺序、Validator 门禁和重试规则。在长链路（scout → plan → 5 维度 research → review → outline → 5 writer → stitcher → render = 20+ 步骤）中，模型可能因上下文压力而绕过门禁。

### 建议
引入 `scripts/runner.py`——一个确定性 Python 脚本，负责：

- 阶段顺序管理（`next` 命令返回下一个待运行阶段）
- Validator 执行和门禁（`complete` 命令自动跑 Validator，仅 `ok:true` 才标记 passed）
- 重试计数（达到上限后标记 `retry_exhausted`，阻断整个流水线）
- 状态持久化（`run_state.json`，原子写入，进程退出后可恢复）

### 收益
- Validator 失败时 100% 阻断，不依赖模型记忆
- 重试次数有明确上限，不会无限循环
- 控制器代码从「靠模型理解」变为「靠脚本执行」

---

## 主线二：可恢复任务状态机

### 问题
当前研究任务无状态。模型上下文中断、API 限流或进程退出后，无法从检查点继续。已完成的阶段（如 research:d1~d3）可能重复执行，浪费时间和 API 调用。

### 建议
`run_state.json` 维护每个阶段的状态（pending/running/passed/failed/retrying/retry_exhausted/stale/skipped/completed），`resume` 命令从第一个未完成阶段继续。

关键特性：
- **原子写入**：先写临时文件再 rename，进程崩溃不会产生半截 JSON
- **产物哈希**：记录每个阶段的文件 SHA-256，恢复时比对
- **上游失效**：修改 `d4.evidence.json` → 自动标记相关 content_units、stitched、report 为 stale

### 收益
- 进程退出后可无缝恢复，已完成的阶段不重复执行
- 修改上游证据后，下游自动失效而非产生过期报告

---

## 主线三：Skill 正文瘦身与渐进式加载

### 问题
主 `SKILL.md` 585 行，包含档位选择、失败路由、全部 Payload 和命令模板。在 Claude Code 等轻量模型环境下，长上下文会导致：
- 指令遵守率下降
- Token 成本增加
- 模型注意力分散

### 建议
将 Payload 和详细命令模板从主 SKILL.md 移至按需加载的 `references/stage-*.md` 文件：

- 主 SKILL.md 保留：触发条件、Controller 职责、档位选择、阶段路由表、Validator 门禁（173 行，-59%）
- References 包含：各阶段完整 Payload、Command 模板、失败路由（8 个文件）
- Controller 只在即将进入某阶段时加载对应 Reference

### 收益
- 主 Skill 缩短 59%，降低上下文压力
- 渐进式加载：模型只加载当前阶段需要的信息
- 保持原有能力：所有 Payload 和模板均未删除，只是位置改变

---

## 补充建议

### 4. 产物依赖失效
- 当前：无。修改 evidence 后下游产物不会自动失效
- 建议：建立 `evidence → subset → unit → stitched → report` 依赖链，上游哈希变化时下游自动标记 stale

### 5. PDF 来源验证
- 当前：证据文件的来源 URL 依赖模型提供
- 建议：Validator 检查 PDF 来源的 HTTP 状态码（200/404），拒绝 404 来源

### 6. 定量 Claim 校验
- 当前：增长率、占比等派生指标由模型计算
- 建议：Runner 提供 `compute_derived` 工具，由确定性脚本计算增长率、占比等指标，与证据中的原始数据比对
