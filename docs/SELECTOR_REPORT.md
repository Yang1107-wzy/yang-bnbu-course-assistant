# MIS DOM 选择器与动作报告

## 已适配页面

- 状态页：`/mis/student/es/elective.do`
- 详情页：`/mis/student/es/eleDetail.do`

## 识别策略

- 遍历 `table`，先找包含 `Course Code / 课程编码` 的表头行。
- 由中英文表头动态映射课程代码、名称、类别、教师、时间和操作列，不使用固定 `nth-child`。
- 从课程名称末尾的 `(1001)` / `(1002)` 提取班号。
- 目标必须同时精确匹配课程代码、标准化完整名称与班号；唯一匹配失败即禁止动作。

## 已验证入口格式

- `javascript:selectItem('...')`
- `javascript:selectItemFromWaiting('...')`
- `javascript:joinWaiting('...')`
- 轮候信息搜索：`javascript:viewElective('...')`

拒绝集合：`replaceItem`、`dropItem`、`exitWaiting`。解析出的函数名和参数会随 FIFO 候选保存；执行前必须与当前页面重新扫描结果一致，然后通过 `Reflect.apply` 调用主页面函数，不再使用 DOM `click()`。链接参数不写入日志。

## 页面变化时

正式页面是运行时权威来源。若表头、课程名称、班号格式、确认文本或轮候弹层变化，解析结果应降级为 UNKNOWN/NOTIFY。先按 `DOM_CAPTURE_GUIDE.md` 获取脱敏诊断，再新增 fixture 和测试；不得直接放宽匹配条件。
