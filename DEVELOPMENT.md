# Pocket 本地测试与正式学习环境

在 VS Code 打开 **D:\Pocket**，使用 Live Server 的 **Open with Live Server**，访问
`http://127.0.0.1:5500`（端口以插件实际显示为准）。也可以使用已有静态服务器，绑定 localhost。
页面必须显示 **测试环境｜不会连接 Firebase**，再开始测试。

环境由最早加载的 `js/environment.js` 按实际页面地址判断：

- 只有 `https://metaunit-core.github.io/Cognivex-Pocket/` 及该路径下的内部页面使用正式环境，电脑和手机行为一致。正常查询参数和片段不改变环境。
- URL 解析并规范化后严格匹配 origin 和路径边界；相似域名、相似路径、其他 GitHub Pages 路径、未知 HTTPS 预览及本地地址均使用测试环境。
- 非法地址、环境脚本缺失或初始化失败时安全停止；不会退回无前缀存储，不处理恢复日志，不连接 Firebase。页面保留“安全阻断”提示。
- 没有设备、屏幕、URL 参数或可残留的构建测试开关；本仓库无需构建，部署同一套静态文件。

测试键统一加 `pocket-development-v1:` 前缀，正式键保持原样。资料、每日复习、导航、训练、听力、导出记录及 JSON 恢复日志均走同一个存储适配层。刷新和重开同一地址、同一浏览器会保留测试数据；换端口、浏览器或隐私模式是另一份浏览器存储。

测试环境不创建 Firebase 备份引擎、不导入远程 Firebase SDK、不初始化认证、不监听账号，也不读取或恢复云端。UI、连接器、备份引擎均设入口保护。缺少环境配置时 Firebase 连接也会被拒绝。正式环境保留原 Firebase 行为、安全协议及存储键。

可以在浏览器开发者工具 Network 中刷新并测试新增、修改：不应出现 `gstatic.com/firebasejs`、`identitytoolkit.googleapis.com`、`securetoken.googleapis.com` 或 `firestore.googleapis.com` 请求；Application → Local Storage 中新增的 Pocket 键应带上述测试前缀。先关闭旧代码页面及旧标签页再测试；本次更新不能终止其他已打开旧页面的脚本。

本次不读取、迁移或清理无前缀旧数据及 Firebase 登录持久化。旧本地预览页面可能曾登录正式账号并上传测试资料，仅检查代码不能判断是否发生；请先在正式网站导出最新 JSON 与 Markdown，再人工比较资料，单独决定如何处理。本地测试隔离不会自动清理已经上传的数据。测试 JSON 也不要导入正式环境，除非明确希望恢复其内容。

更新手机正式网站需要之后按原流程部署这些静态文件，本次没有执行部署。不需要修改或部署 Firestore Rules。

## 本次环境隔离涉及的文件

- 环境入口 `js/environment.js`、隔离回归 `tests/environment-isolation.test.cjs`、本说明文件。
- 启动与 Firebase 入口：`index.html`、`js/firebase-ui.js`、`js/firebase-adapter.js`、`js/backup-safety.js`。
- 接入存储适配层：`js/storage.js`、`js/navigation.js`、`js/data-deletion.js`、`js/cloud-backup.js`、`js/listening-start.js`、`js/training-sop.js`、`js/learning-backup.js`、`js/learning-archive.js`、`js/local-reset-ui.js`、`js/fresh-start-ui.js`。这些模块的学习调度及云端版本协议未改变。
- 测试适配：`tests/helpers/environment.cjs`、`tests/helpers/pocket-cloud-fixture.cjs`、`tests/helpers/pocket-learning-ui.cjs`、`tests/firebase-ui.test.cjs`、`tests/firebase-local-confirm.test.cjs`、`tests/cloud-backup.test.cjs`、`tests/executor.test.cjs`、`tests/navigation.test.cjs`、`tests/learning-backup.test.cjs`、`tests/learning-archive.test.cjs`、`tests/fresh-start-ui.test.cjs`。模拟正式环境也通过真实白名单初始化，不跳过环境检查。

仓库中此前已有的重命名和每日倒序复习改动保留，本次未重写这些功能。

模拟回归共 32 个测试文件，29 个通过。已有 3 个失败：`automatic-backup-resume.test.cjs` 和 `manual-cloud-deletion.test.cjs` 仍断言已移除的旧按钮/链接；`backup-safety.test.cjs` 仍期望旧文案“自动备份已暂停”，实际为“已暂停”。环境隔离、正式备份协议、读回校验、版本冲突、学习/复习及导出相关测试通过。没有连接真实 Firebase，也未验证实际 iPhone 浏览器或线上部署。
