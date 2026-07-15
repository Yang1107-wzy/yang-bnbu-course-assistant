# Yang 抢课脚本目标课程迁移设计

日期：2026-07-15

## 目标

仅修改脚本的默认监控目标和对应迁移逻辑，不执行真实教务系统中的退课或换课操作。

新的默认目标为：

| 课程代码 | 完整名称 | 班号 | 类别 |
|---|---|---:|---|
| COMP3073 | Introduction to Robotics | 1002 | ME |
| COMP4213 | Wireless Communication and Mobile Computing | 1001 | ME |
| EBIS3113 | Business Forecasting and Machine Learning | 1002 | FE |

`COMP4213-1001` 和 `EBIS3113-1002` 保持不变；旧默认目标 `AI3133-1001` 被 `COMP3073-1002` 替换。

## 配置迁移

采用保守的精确默认集迁移：

1. 如果已保存目标完整、逐项匹配旧默认三门课程，则迁移为新的三门默认目标。
2. 如果用户修改、新增、删除或重排过任意目标，则完整保留其自定义配置。
3. 课程设置以代码、标准化完整名称、四位班号和类别共同识别，避免相似课程误迁移。
4. 迁移只改变目标配置，不改变时间窗口、面板布局、合规确认或其他运行状态。

## 运行边界

- 不增加或启用 `Drop`、`Replace`、`Exit Waiting`。
- 不自动移除 MIS 中已经选中的 `AI3133`。
- 不保证 `COMP3073` 在真实系统中被选中。
- 不引入学分或课表写入逻辑。
- 不修改轮询、Worker、确认框桥接和动作白名单。
- 项目继续遵循 `Yang-NCEL-1.0`，仅供学习交流和受控测试。

## 受影响组件

- `src/config_manager.js`：新默认目标和旧默认集迁移。
- 默认配置、迁移、品牌与 Worker 测试：更新预期课程。
- `tools/check-dist.mjs`：要求发布脚本包含新目标且不再把 AI3133 作为默认目标。
- `tools/dom_diagnostic.user.js`、`tools/ui_preview.html`：同步示例目标。
- README、手工测试清单和当前版本说明：同步用户可见课程列表。
- 历史版本文档保留原始课程记录，不回写历史事实。

## 验证标准

1. 新安装默认显示 COMP3073、COMP4213、EBIS3113。
2. 精确旧默认配置自动迁移，且只替换 AI3133。
3. 任意自定义配置保持不变。
4. 构建产物不再把 AI3133 作为当前默认目标。
5. `Drop`、`Replace`、`Exit Waiting` 仍不可执行。
6. `npm run check` 和 `npm run package` 全部通过。

