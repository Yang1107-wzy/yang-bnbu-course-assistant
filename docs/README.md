# Yang 抢课脚本 v1.2.1 使用与维护说明

## 模块

| 模块 | 作用 |
|---|---|
| `src/time_scheduler.js` | 北京时间转换、三个窗口、阶段判定和随机轮询边界 |
| `src/clock_sync.js` | BNBU 同源 HTTP Date 中点校时与本机回退 |
| `src/course_parser.js` | 精确解析课程、状态与动作入口 |
| `src/decision_engine.js` | 为每个目标独立决定 Select、Join 或不动作 |
| `src/action_queue.js` | 跨标签优先 FIFO、动作锁及 250 ms 提交间隔 |
| `src/action_executor.js` | 重验目标/函数并调用 MIS 页面函数、接管一次 confirm |
| `src/runtime_state.js` | v3 手动/预约模式、窗口切换、worker、队列和课程状态 |
| `src/ui_panel.js` | Yang 品牌面板、双启动按钮、时间状态、课程与窗口编辑器 |
| `src/panel_layout.js` | 拖动、缩放、收起、视口约束和布局生命周期 |
| `src/assistant_runtime.js` | 校时、tick、扫描、刷新、执行、通知和跨标签协调 |

## 启动语义

- `Test`：先返回当前页面识别结果，后台异步预热缺失 Worker，不执行动作。
- `立即启动`：无视预约窗口，先进入 MANUAL/RUNNING/BURST 并扫描当前页；校时和 Worker 创建不阻塞动作。
- `预约启动`：保存窗口；窗口内马上 RUNNING，窗口外 SCHEDULED。
- `Stop`/`Esc`：取消运行、预约、队列、锁和待验证动作。
- `设置`：编辑目标与三个北京时间窗口，保存后自动 Stop。

## 面板布局

标题栏空白区域负责拖动，右下角手柄负责宽高缩放。收起后只显示可拖动的 `Yang` 悬浮按钮，监控与动作调度继续运行。布局通过 `bnbu.courseAssistant.panelLayout.v1` 持久化；跨标签更新不会覆盖正在拖动或缩放的面板。Tampermonkey 菜单可强制展开或重置位置。

验收预览：[`完整面板`](./ui-preview.png)、[`缩小面板`](./ui-preview-compact.png)、[`收起按钮`](./ui-preview-collapsed.png)。

## 调度

时间统一按 UTC+8 解析成 epoch。启动时及每五分钟通过当前 BNBU 同源选课页面的 HEAD/Date 校时；HTTP Date 秒级精度计入 UI 的估计误差。普通阶段每 3 秒刷新，开放前 30 秒至开放后 2 分钟每 1 秒刷新；发现操作入口后立即冻结该 Worker 的刷新。

手动打开的详情页作为前台优先页，一次扫描本类别所有目标；默认三门课程的三个专用 Worker 负责兜底。目标更多时由最多 6 个 Worker 按类别均匀覆盖。多门同时可选时进入全局优先 FIFO，动作间隔至少 250 ms。

每次加载和 3 秒本地 heartbeat 都会重新评估时间，因此休眠后不依赖错过的旧 timer。SUBMITTING 时刷新暂停。最后窗口结束自动停止；所有目标 Registered 时提前停止。

## 动作边界

目标代码、标准化完整名称和班号必须一致且唯一。`WAITLIST_AVAILABLE` 直接 Join，不查询人数或学分。允许函数只有 `selectItem`、`selectItemFromWaiting`、`joinWaiting`；执行前复核参数并仅自动接受一次匹配确认框。

## 公开默认配置

仓库默认预填 AI3133 (1001)、COMP4213 (1001) 和 EBIS3113 (1002)。升级时只有完全未经修改的三条旧 DEMO 会自动迁移；任何自定义目标都原样保留。其他使用者必须在面板的`设置`中填写自己的课程代码、完整名称、四位班号和 ME/FE 类别。

## 构建与发布

`npm run build` 生成无 CDN、无外部运行时依赖的 `dist/yang-bnbu-course-assistant.user.js`。`npm run check` 依次执行 ESLint、Node 测试、构建和 dist 安全检查。`npm run package` 生成 GitHub Release 安装脚本、源码 ZIP 和 `SHA256SUMS.txt`。
