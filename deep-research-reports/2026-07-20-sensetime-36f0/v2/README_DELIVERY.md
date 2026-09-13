# v2 交付物 README

## 如何打开最终 Demo

直接打开 `report_v2.html`（PC 浏览器）。页面采用双决策入口设计：
- **执行摘要**：首屏展示采购合作和投资观察的判断、关键事实和下一步行动
- **采购合作**：产品推荐、竞品比较、90 天 POC 计划、供应商稳定性
- **投资观察**：财务拐点、Bull/Base/Bear 情景、催化剂和退出条件
- **风险触发器**：每项风险的当前状态、监测指标、时间窗口和管理层动作
- **附录**：指标口径、参考来源、证据缺口、声明

## 如何运行 Runner

```bash
# 初始化新研究任务
python3 scripts/runner.py init --report-dir <absolute_report_dir> --mode normal

# 获取下一个待运行阶段
python3 scripts/runner.py next --report-dir <report_dir>

# 提交产物并运行 Validator
python3 scripts/runner.py complete --report-dir <report_dir> --stage <stage_id> --artifact <artifact_path>

# 手动标记失败
python3 scripts/runner.py fail --report-dir <report_dir> --stage <stage_id> --reason <reason>

# 查看当前状态
python3 scripts/runner.py status --report_dir <report_dir>
```

## 如何恢复任务

任务在进程退出后可从中断点恢复：

```bash
# 恢复（从第一个未完成阶段继续，已完成阶段不重复执行）
python3 scripts/runner.py resume --report-dir <report_dir>
```

## 如何重新生成 v2

1. 运行 Runner 初始化：`python3 scripts/runner.py init --report-dir v2/ --mode normal`
2. 按 `next` → Agent 执行 → `complete` 的循环推进各阶段
3. 全部 Validator 通过后生成 `report_v2.md`
4. 基于 `report_v2.md` 开发 `report_v2.html`

## 当前仍存在的真实缺口

| 缺口 | 状态 | 说明 |
|---|---|---|
| 券商评级和目标价 | ❌ 未解决 | 东方财富 HSF10 显示无覆盖 |
| SLA 服务等级协议 | ❌ 未解决 | 公测期未公开，付费版待上线 |
| 第三方客户满意度 | ❌ 未解决 | 仅定性描述，无量化数据 |
| IDC 精确市场份额 | ❌ 未解决 | 仅有定性梯队描述 |
| 产品付费档位定价 | ❌ 未解决 | 尚未上线 |
| 2025 年度经审计年报 | ⏳ 已发布 | 2026 年 3 月发布，本报告引用新闻稿口径 |

## 产物说明

| 文件 | 说明 |
|---|---|
| `report_v2.md` | 管理层决策型报告（Markdown） |
| `report_v2.html` | 管理层决策型 Demo（单文件 HTML） |
| `run_state.json` | Runner 状态文件（由 runner.py 管理） |
| `run_events.jsonl` | 运行事件日志 |
| `validator_results.json` | 全部 Validator 结果 |
| `model_calls.jsonl` | 模型调用元数据（脱敏） |
| `source_manifest.json` | 来源清单和验证状态 |
| `upgrade_notes.md` | 2.1 → v2 升级说明 |
| `skills_ecosystem_recommendations.md` | Skill 生态系统改进建议 |
| `README_DELIVERY.md` | 本文件 |
