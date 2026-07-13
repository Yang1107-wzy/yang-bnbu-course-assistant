# Yang 抢课脚本

[![CI](https://github.com/Yang1107-wzy/yang-bnbu-course-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/Yang1107-wzy/yang-bnbu-course-assistant/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Yang1107-wzy/yang-bnbu-course-assistant)](https://github.com/Yang1107-wzy/yang-bnbu-course-assistant/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

面向 BNBU MIS 的 Chrome + Tampermonkey 可视化选课与轮候助手。支持立即启动、北京时间预约、自动识别 Select、Select from Waiting 和 Join Waiting List。

> **English:** A guarded, visual Tampermonkey userscript for BNBU MIS course selection and waiting-list actions. It works only in an already authenticated browser session and never handles credentials or CAPTCHA.

![Yang 抢课脚本界面](./docs/ui-preview.png)

## 重要说明

- 本项目不是 BNBU 官方产品，使用者必须自行遵守学校选课和系统使用规则。
- 软件不保证课程名额或最终选课结果。正式页面可能随时变化，应先使用 `Test` 检查。
- `v1.1.0` 已通过自动化 DOM、页面函数和面板布局测试，但在 2026 年 7 月 20 日正式窗口前尚未完成真实选课提交验收。
- 公开版默认预填 AI3133、COMP4213 和 EBIS3113；其他使用者安装后必须先在 `设置` 中替换为自己的目标。

## 功能

- `Test`：扫描当前页面并显示课程、状态和页面函数，不执行选课。
- `立即启动`：不受预约窗口限制，马上进入自动监控。
- `预约启动`：根据可编辑的北京时间窗口自动开始、跨轮次暂停和恢复。
- `Stop` / `Esc`：停止刷新、清空待提交动作并同步所有 worker 标签。
- 三门或更多目标独立扫描，通过跨标签 FIFO 串行提交。
- 只允许 `selectItem`、`selectItemFromWaiting`、`joinWaiting`。
- 不检查本地学分或轮候人数；是否成功以 MIS 返回结果为准。
- 面板可拖动、右下角自由缩放，并可收起成可拖动的 `Yang` 悬浮按钮。

## 安装

### 一键安装

1. 在 Chrome 安装并启用 [Tampermonkey](https://www.tampermonkey.net/)。
2. 打开 [`yang-bnbu-course-assistant.user.js`](https://raw.githubusercontent.com/Yang1107-wzy/yang-bnbu-course-assistant/main/dist/yang-bnbu-course-assistant.user.js)。
3. Tampermonkey 显示安装页面后，确认名称为“Yang 抢课脚本”、版本为 `1.1.0`，再点击安装。

### 手动安装

1. 打开 Tampermonkey 管理面板并新建脚本。
2. 将 [`dist/yang-bnbu-course-assistant.user.js`](./dist/yang-bnbu-course-assistant.user.js) 的完整内容粘贴进去并保存。
3. 只启用一个版本，避免旧脚本和新脚本同时运行。

## 首次使用

1. 登录 [BNBU MIS](https://mis.bnbu.edu.cn/mis/login.jsp)，进入选课状态页。
2. 打开面板的 `设置`，确认默认目标是否正是 AI3133 (1001)、COMP4213 (1001) 和 EBIS3113 (1002)。
3. 如目标不同，逐门填写：课程代码、MIS 页面显示的完整名称、四位班号、类别 `ME` 或 `FE`。
4. 保存后刷新页面，点击 `Test`。
5. 只有课程唯一匹配且状态显示 `READY` 时，才使用立即启动或预约启动。

课程代码、完整名称和班号必须同时精确匹配。相似名称、重复行或未知函数一律不会执行。

## 面板布局

- 按住标题栏空白位置拖动面板；按钮和输入框不会触发拖动。
- 拖动右下角斜线手柄可同时调整宽度和高度。
- 点击标题栏的 `—` 收起，面板会变成小型 `Yang` 悬浮按钮；点击 `↗` 展开。
- 位置、尺寸和收起状态会跨页面、刷新和浏览器重启保存。
- 若面板位置异常，可在 Tampermonkey 菜单选择 `显示/展开 Yang 面板` 或 `重置 Yang 面板位置`。
- 收起面板不会停止正在运行的监控、预约或自动选课；只有 `Stop` 或 `Esc` 会停止。

## 两种启动方式

### 立即启动

点击 `立即启动` 后马上进入 `RUNNING`。脚本自动打开或复用 ME/FE 详情标签，在开放阶段按约 1.5–2.5 秒随机间隔扫描；出现允许入口后加入全局 FIFO。

### 预约启动

默认北京时间窗口：

| 轮次 | 开始 | 结束 |
|---|---|---|
| 第一轮 | 2026-07-20 10:00:00 | 2026-07-20 13:00:00 |
| 第二轮 | 2026-07-20 15:00:00 | 2026-07-20 18:00:00 |
| 第三轮 | 2026-07-21 10:00:00 | 2026-07-22 18:00:00 |

点击 `预约启动` 后进入 `SCHEDULED`。脚本在远离窗口时停止刷新，临近开始逐步加速，窗口开放后进入快速轮询。预约期间仍可点击 `立即启动` 提前开始。

校时优先读取 BNBU 同源页面的 HTTP `Date`；若服务器不提供，则明确显示本机北京时间兜底，不连接第三方时间服务。

## 更新与卸载

- Tampermonkey 会根据 GitHub Raw 地址检查版本更新。
- 更新后应刷新所有 MIS 标签，并再次运行 `Test`。
- 卸载时在 Tampermonkey 管理面板删除“Yang 抢课脚本”；它不会删除或修改 MIS 中已经完成的选课记录。

## 常见问题

### 页面没有面板

确认网址是 `https://mis.bnbu.edu.cn/mis/student/es/elective.do` 或 `eleDetail.do`，脚本已启用，并强制刷新页面。也可从 Tampermonkey 菜单选择 `显示/展开 Yang 面板` 或重置面板位置。

### 显示未找到或 UNKNOWN

重新核对完整课程名称与班号。若 MIS 页面结构变化，保持 `STOPPED`，按照 [`docs/DOM_CAPTURE_GUIDE.md`](./docs/DOM_CAPTURE_GUIDE.md) 获取脱敏诊断。

### 点击启动后没有提交

先看目标是否显示 `READY`。登录过期、确认文字变化、页面函数不存在或目标不唯一时，脚本会停止而不是盲目操作。

## 安全边界

- 不保存登录信息、Cookie、Token、姓名、学号或隐藏表单值。
- 不自动登录、不处理验证码、不调用隐藏选课 API、不使用 `GM_xmlhttpRequest`。
- 永不执行 Replace、Drop、Exit Waiting 或未知函数。
- 随机抖动只用于标签错峰，不用于规避限流或反检测。

更多细节见 [`docs/SECURITY_BOUNDARIES.md`](./docs/SECURITY_BOUNDARIES.md) 和 [`SECURITY.md`](./SECURITY.md)。

## 开发与验证

需要 Node.js 20 或更新版本：

```bash
npm ci
npm run check
npm run package
```

测试、ESLint、单文件构建、安全审计和 Release 打包均由 GitHub Actions 重复执行。贡献前请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。

## License

[MIT](./LICENSE) © 2026 Yang1107-wzy
