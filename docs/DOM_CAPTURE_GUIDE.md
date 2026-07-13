# DOM 抓取与适配指南

当正式阶段页面与测试期不同，先使用只读诊断脚本并保持 STOPPED。

1. 在 Tampermonkey 单独安装 `tools/dom_diagnostic.user.js`。
2. 安装前把诊断脚本顶部的三条 `DEMO` 目标改成需要诊断的课程代码和班号。
3. 分别打开状态页、ME 详情页和 FE 详情页。
4. 点击左下角蓝色“Yang 只读诊断”按钮。
5. 保存复制出的 JSON。它只含当前路径、页面标题、目标行脱敏文本和 JavaScript 函数名，不含 query、Cookie、Token 或隐藏表单值。
6. 对比目标是否各自唯一出现，动作函数是否只属于：
   - `selectItem`
   - `selectItemFromWaiting`
   - `joinWaiting`
7. 如果出现新函数名、重复目标或未知确认框，保持 STOPPED，并更新 fixture/解析器/测试后重新构建。

不要把完整网页源码、Cookie、Network 请求头或包含学号姓名的截图提交到日志或仓库。
