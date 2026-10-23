# 原学习资料题目移除：实现与本地验证

## 操作

首页「一键输入学习资料」右侧新增独立的「已熟练，可移除」。两者共用紧凑的响应式按钮行，快捷录入及连续保存逻辑未改。

选择资料后读取真实 Group 题号，展开勾选框。勾选、取消不写学习状态；只有二次确认才通过原 `PocketStorage.updateState()` 原子保存。保存失败保留选择并提示失败；过期确认、重复点击和已失效题号不能重复提交。

## 身份与范围

- 资料按稳定 ID 选择、按原 `saveOrder` 显示，使用最新名称。同名资料互不影响。
- 复用 `PocketFocusReview.groupNumbers()` 对连续、不连续题号解析及组内去重。
- 每个选择绑定原 Group 稳定身份和题号；没有 ID 的旧 Group 沿用原位置和原数字边界的身份规则。同一题号若存在于不同 Group，分别注明原 Group，不跨组误删。
- 当前有效成员写入原有 `group.questionRange`，资料总体 `questionRange` 同步更新。不重新分组，不移动数组，不改变 Group ID 或资料顺序。
- 原数字 `start/end` 保留用于历史边界及旧身份关联。与既有不连续题号结构一致，当前成员以明确的 `questionRange` 为准。
- 整组移空时置 `questionsInactive`，范围为空字符串，保留原 Group 和所有 Run；排除当前执行任务。整份资料移空在写入前阻止，并提示使用「查看资料」的整份资料删除功能。
- `questionRemovalHistory` 保存移除前题号、所选题号、时间及成绩来源。历史 Run 不删、不重算。新训练仅在涉及变动的 Group 上保存题号快照。

## 成绩、队列及重点题

原正确率和用时保持原数值，并分别保留其题号范围。在档案五列表格相应成绩单元格中注明「历史成绩，题号：…」，不会把它们当成剩余题目的新成绩。用户重新填写一个字段，只更新该字段的成绩范围。没有新增次数字段或逐次训练列表。

组内调度保留原学习/复习循环，使用原 Group 索引跳过空 Group。正序、当天新学倒序的新队列排除空 Group，保留原排序。进行中的现代队列仅调整需要变化的有效执行范围，旧队列快照留存；不会给被取消的空任务伪造完成 Run。剩余任务已真实完成时不强制重复训练。

重点题记录、重点 Group 成员快照及历史保持不变。来源查询逐题校验有效范围；移除题目变成「来源不可用」，不再筛选、分组或执行。同一重点 Group 的其他有效题目保留，进行中的无效题沿用原 `skipInactive` 处理。档案末尾沿用原来源不可用状态及去重表格。

如果旧版正序任务没有可安全调整的逐 Group 断点，或旧版倒序任务需要移空 Group，操作会原子失败并提示先完成该复习，不静默清除或猜测历史。

## 文件

新增：

- `js/learning-question-removal.js`：选择、确认、题目级变更、活动任务协调。
- `tests/learning-question-removal.test.cjs`：localhost 模拟回归。
- 本说明文件。

本次更新：

- `index.html`、`css/style.css`：相邻按钮及简洁选择页面样式。
- `js/app.js`、`js/navigation.js`：原保存桥接、入口/返回、资料详情及历史成绩说明。
- `js/focus-review.js`：复用题号解析，校验来源当前有效成员。
- `js/grouping.js`：追加题号检查忽略已空的历史 Group。
- `js/scheduler.js`、`js/executor.js`：按原索引跳过空 Group，保存变动后的训练范围快照。
- `js/material-review.js`、`js/daily-reverse-review.js`：新队列过滤及进行中队列安全调整。
- `js/learning-archive.js`：最新有效题号、分别标注历史成绩、逐题来源有效性。
- `tests/helpers/pocket-learning-ui.cjs`、`tests/material-modal.browser.cjs`：加载新模块及浏览器验证。

前一项「当天新学资料复习」的未提交修改保持原样；没有回退这些文件的既有变更。

## 验证结果

全程使用 localhost 合成资料及内存 Firebase adapter，没有访问真实资料或真实 Firebase。

- 第3题单独移除后，第2组仍保留第4题；其他 Group、资料、ID、顺序、Run、正确率及用时原值不变。
- 批量选择、同名资料、跨 Group 重复题号、无选择、取消、失败回滚及重复确认通过。
- 整组移空不生成执行任务；整份资料移空被阻止。
- 进行中的正序、倒序、原学习及混合重点 Group 均验证了范围调整与来源失效处理。
- 已学内容不用重复全量训练；旧的未完成 Run、队列快照及重点来源快照保留。
- 查看资料详情、Markdown 五列表格/重点四列表格、历史成绩区分、刷新、JSON 校验和原恢复路径通过。
- Firebase mock 使用原保存信号及备份调度，最新完整快照包含题号更新，无新增云端删除、按钮、路径或机制。
- 86 个测试文件：81 通过，5 项为此前已核实的既有失败，分别为 `automatic-backup-resume`、`backup-safety`、`focus-review`、`learned-material-ui`、`manual-cloud-deletion` 的旧按钮/状态文字、旧文本输入、焦点或链接断言。
- Chromium 在 390×844、768×1024、1024×768、1440×900 验证两按钮同一行、可选题、取消不变、确认只移除所选、无横向溢出、混合重点来源有效性及刷新持久化。

iPad Safari/Chrome 和手机的软键盘、原生选择框及触摸行为仍需实机验证。未修改 JSON/Firebase 备份机制、Firestore Rules，未清除真实数据、部署或推送。
