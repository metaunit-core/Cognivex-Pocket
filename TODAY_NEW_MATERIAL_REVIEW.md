# 当天新学资料复习：本地检查与验证

## 原因与最小修改

原 `PocketMaterialReview.start()` 直接使用 `groups(state)`，后者枚举全部已学资料，因此新建倒序队列也包含历史资料。每日正序复习同样使用这个公共函数取得资料内部的 Group 顺序，不能直接缩小该函数的范围。

保留公共 `groups()` 的全部资料范围，`todayGroups()` 只选择当天原流程新学资料。后续解锁修正用 `reviewGroups()` 在存在未完成义务时保留其完成日范围，否则使用当天集合。每日正序仍读取全部资料。入口为「当天新学资料复习」；进行中的旧队列仍可继续。

## 日期与来源依据

- 新的原流程首次真实完成时，保留 `completedAt`，同时记录 `originalLearningDay`，使用 `PocketDailyReverse.day()` 的原有自然日口径，包括原有本地模拟日期工具，避免模拟日与真实执行时间不同导致空集合。
- 没有该兼容元数据的旧资料，仍检查首次完成时间及原始（非追加）Group 在该时间前的真实 `new` 和 `review` 记录；不推测缺失日期。
- 快捷录入虽有 `completedAt`，但该时刻没有原学习流程的完整执行记录，因此不进入当天队列。其保存及连续录入代码未修改。
- 缺少可靠首次完成时间或完整原学习证据的旧资料不推测为今天新学。不批量迁移或改写真实历史。
- 首次真实完成还保存 `review.requiredAfterLearning`，只有匹配当前范围、代次及真实逐 Group 完成记录的整轮倒序复习才能清除。旧版已完成学习断点通过原记录只读识别，不能因为当天集合为空而绕过。
- 保持原保存顺序及倒序算法。只对新建队列筛选；既有进行中队列不因刷新、跨日被重建或裁剪。
- 每日正序复习仍使用全部符合原规则的资料与原 `saveOrder`。准入先检查每日正序或有效重点复习；原倒序完成凭据、一次使用及自愿追加复习规则保留。跨日空集合不会让进行中的旧队列丢失继续入口。

最新的入口、轮次锁定及浏览器验证详见 `MATERIAL_REVIEW_UNLOCK_FIX.md`。下方为首次缩小范围时的文件及测试记录。

## 修改文件

业务仅 `js/material-review.js`、`js/app.js`、`index.html`。

新增测试：`tests/today-new-material-review.test.cjs`、`tests/helpers/original-learning-fixture.cjs`。

更新相关测试的当天原流程模拟证据、队列范围或按钮文案：

- `tests/daily-reverse-review.test.cjs`
- `tests/daily-review-completion-navigation.test.cjs`
- `tests/executor.test.cjs`
- `tests/focus-review-metrics-sync.test.cjs`
- `tests/material-deletion.test.cjs`
- `tests/navigation.test.cjs`
- `tests/output-entry-key-questions.test.cjs`
- `tests/quick-material-order.test.cjs`
- `tests/quick-material.test.cjs`
- `tests/review-admission.test.cjs`
- `tests/review-order-directions.test.cjs`
- `tests/review-policy.test.cjs`

## 模拟结果

localhost 隔离数据通过原页面操作完成逐组学习、组内复习：

| 情况 | 新倒序队列 |
| --- | --- |
| 历史 A、B、C，尚未完成今天学习 | 空 |
| 原流程完成 D | D |
| 再完成 E | E → D |
| 再完成 F | F → E → D |
| 随后快捷录入 Q | 仍为 F → E → D，Q 正常保存 |
| 次日新集合 | 空；进行中的昨天队列仍原样恢复 |
| 次日正序复习 | A → B → C → D → E → F → Q |

验证了每日准入、原 Group 调度、成绩与用时持久化、复习历史、改名/旧资料复习不改变首次完成日期、刷新与跨日恢复、快捷连续保存、重点复习、资料删除、Markdown/JSON 以及内存 Firebase mock 完整快照。

85 个测试文件中 80 个通过。以下 5 个在修改前 HEAD 业务源码下复测也失败，未为它们改动无关功能：

- `automatic-backup-resume.test.cjs`：旧按钮文字静态断言。
- `backup-safety.test.cjs`：旧暂停状态文字断言。
- `focus-review.test.cjs`：旧自由文本重点题输入方式。
- `learned-material-ui.test.cjs`：旧入口焦点断言。
- `manual-cloud-deletion.test.cjs`：旧 Firebase 控制台链接静态断言。

Chromium localhost 浏览器回归在 390×844、768×1024、1024×768、1440×900 全部通过，使用临时浏览器配置和模拟资料，并阻断外部请求。

没有访问真实 Firebase、删除真实学习数据、修改 Firestore Rules、部署或推送。
