# Contributing

感谢你帮助改进 Yang 抢课脚本。提交内容必须保持默认安全失败：页面结构、课程匹配或确认文字不明确时不执行动作。

所有贡献均受 [`Yang-NCEL-1.0`](./LICENSE) 约束：仅允许非商业学习、研究和同许可再分发；不得添加学校正式选课、代操作、规避限流或其他违反学校规定的用途。

## 开发流程

1. Fork 仓库并从 `main` 创建功能分支。
2. 使用 Node.js 20 或更新版本运行 `npm ci`。
3. 对行为变更先补失败测试，再做最小实现。
4. 运行 `npm run check` 和 `npm run package`。
5. Pull Request 说明修改原因、用户影响、验证命令和剩余风险。

## 数据与隐私

- fixtures 必须使用虚构课程、教师、学号和函数参数。
- 不提交登录后的完整 HTML、Network 请求头、Cookie、Token、姓名或学号。
- 不放宽课程代码、完整名称和班号的精确匹配。
- 不增加自动登录、验证码处理、隐藏 API、Drop、Replace 或 Exit Waiting。
- 不移除或弱化首次合规确认、持续免责声明或 `Yang-NCEL-1.0` 许可证限制。

## Commit 与 Pull Request

使用简洁的英文 Conventional Commit，例如 `fix: reject ambiguous course rows`。一个 Pull Request 只解决一个明确问题，并确保 CI 通过。
