# Yang 抢课脚本 v1.0.0 使用与维护说明

## 模块

| 模块 | 作用 |
|---|---|
| `src/time_scheduler.js` | 北京时间转换、三个窗口、阶段判定和随机轮询边界 |
| `src/clock_sync.js` | BNBU 同源 HTTP Date 中点校时与本机回退 |
| `src/course_parser.js` | 精确解析课程、状态与动作入口 |
| `src/decision_engine.js` | 为每个目标独立决定 Select、Join 或不动作 |
| `src/action_queue.js` | 跨标签 FIFO、动作锁及 1.2 秒提交间隔 |
| `src/action_executor.js` | 重验目标/函数并调用 MIS 页面函数、接管一次 confirm |
| `src/runtime_state.js` | v3 手动/预约模式、窗口切换、worker、队列和课程状态 |
| `src/ui_panel.js` | Yang 品牌面板、双启动按钮、时间状态、课程与窗口编辑器 |
| `src/assistant_runtime.js` | 校时、tick、扫描、刷新、执行、通知和跨标签协调 |

## 启动语义

- `Test`：只识别，不执行。
- `立即启动`：无视预约窗口，马上 MANUAL/RUNNING/FAST。
- `预约启动`：保存窗口；窗口内马上 RUNNING，窗口外 SCHEDULED。
- `Stop`/`Esc`：取消运行、预约、队列、锁和待验证动作。
- `设置`：编辑目标与三个北京时间窗口，保存后自动 Stop。

## 调度

时间统一按 UTC+8 解析成 epoch。启动时及每五分钟通过当前 BNBU 同源选课页面的 HEAD/Date 校时；HTTP Date 秒级精度计入 UI 的估计误差。远期不刷新，10 分钟内 15–25 秒，1 分钟内 4–7 秒，10 秒内和窗口中 1.5–2.5 秒，FE 再错峰 0–350ms。

每次加载和 3 秒本地 heartbeat 都会重新评估时间，因此休眠后不依赖错过的旧 timer。SUBMITTING 时刷新暂停。最后窗口结束自动停止；所有目标 Registered 时提前停止。

## 动作边界

目标代码、标准化完整名称和班号必须一致且唯一。`WAITLIST_AVAILABLE` 直接 Join，不查询人数或学分。允许函数只有 `selectItem`、`selectItemFromWaiting`、`joinWaiting`；执行前复核参数并仅自动接受一次匹配确认框。

## 公开默认配置

仓库只提供三条不会匹配真实 MIS 课程的虚构示例。使用者必须在面板的`设置`中删除示例并填写自己的课程代码、完整名称、四位班号和 ME/FE 类别。

## 构建与发布

`npm run build` 生成无 CDN、无外部运行时依赖的 `dist/yang-bnbu-course-assistant.user.js`。`npm run check` 依次执行 ESLint、Node 测试、构建和 dist 安全检查。`npm run package` 生成 GitHub Release 安装脚本、源码 ZIP 和 `SHA256SUMS.txt`。
