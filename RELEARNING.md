# 批量选做重学

## 入口与完成次数

「查看资料 → 全部学习资料」复用原资料复选框；底部左侧仍为原删除按钮，右侧新增「重学」。无选择时不可启动。列表显示「已选做学习 X 次」，旧资料默认 0。

每次启动生成唯一批次 ID。一轮全部资料的组内学习、组间复习，以及规定的资料间倒序复习全部完成后，才在同一次原有 `PocketStorage.updateState` 写入中给每条选中资料各加 1，并保存批次完成标记。中途退出不计次，重复点击、刷新、重进完成页均不会重复计数。最终结算写入失败时，所有次数和任务断点一起保持原状态，可重试。

## 排序与真实调度

使用 `dailyReverseReview.saveOrder` 的正式保存顺序；尚无顺序记录的旧资料按 `state.materials` 的稳定追加顺序回退。不采用可能属于草稿创建时间的 `createdAt`，不伪造时间，也不按名称或勾选顺序排序。

直接调用原 `PocketScheduler`、`PocketExecutor` 和 `PocketMaterialReview`。实际三组内部顺序是：1新学 → 2新学 → 1复习 → 2复习 → 3新学 → 1复习 → 2复习 → 3复习；没有硬编码示例顺序。

当前原系统要求每学完一份资料后，对已学完的集合做资料间倒序复习，因此 A/B/C 的批次流程为：

- 学完 A 的全部内部步骤 → 倒序复习 A。
- 学完 B 的全部内部步骤 → 倒序复习 B → A。
- 学完 C 的全部内部步骤 → 倒序复习 C → B → A。
- 全部真实完成后，A/B/C 各计 1 次。

`material-review.js` 只增加一个隔离引擎专用的范围判断：使用该引擎中的已完成资料，不受跨日筛选影响。排序、激活、Group 完成校验、整轮完成校验继续执行原函数。原正常学习与复习状态不会设置此标记，算法不变。

## 隔离与保存

- `state.relearning`：独立批次 ID、所选资料 ID/分组签名、当前主学习位置、阶段、隔离执行器断点，以及完成后的资料间复习轮次摘要。
- `state.relearning.engine`：仅包含所选资料的有效分组定义及本轮新执行记录。直接运行原学习执行器与倒序执行器；不会把新 Run 加入原资料的 `groups[].runs`。
- `materials[].relearningCount`：累计整轮完成次数。
- `materials[].relearningHistory`：每个批次的独立 Group 执行记录，含该轮实际填写的成绩和实际复习记录。
- `state.relearningArchives`：用户明确结束任务或删除本轮选中资料时，保留未完成任务的历史快照，不计完成次数。

重学不覆盖原资料、Group、原完成时间、原始 Run、最新成绩、每日正序任务、原资料间倒序任务、重点题或解锁状态。学习档案既有统计和内容保持不变。

返回首页/退出只隐藏页面，断点按原本机完整状态保存。再次点击重学优先继续现存任务，不覆盖；刷新和跨日继续原批次。进入重学中的教学法、做题或知识点后，返回及刷新仍能恢复重学上下文。

若来源分组或有效题号改变，暂停不匹配的重学执行并保留断点，可明确结束该轮后重新选择；不推测完成。删除本轮选中资料仍走原删除流程，独立未完成批次停止、不计次，取消快照明确作为历史保留，不再作为当前任务。

## JSON 与 Firebase

没有新增存储键、JSON 格式版本或云端备份机制。新字段通过原完整状态保存与原 `PocketCloudSignal.saved` 通知进入现有备份流程。原 JSON 校验/恢复及 Firebase 原有备份条件、路径、冲突处理、保护规则均未修改。Firebase 只用内存 mock 验证，未访问真实项目。

## 修改文件

- `js/relearning.js`：独立重学协调器与页面，复用原执行器和 OUTPUT 组件。
- `js/app.js`、`css/style.css`：弹窗按钮、次数及保存适配。
- `js/material-review.js`：隔离批次范围适配。
- `js/navigation.js`、`index.html`：新页面与子页面恢复、模块加载。
- `js/material-deletion.js`：删除时处理独立重学任务，原删除算法不变。
- `tests/relearning.test.cjs`、`tests/relearning.browser.cjs`：模型、备份 mock 与浏览器验收。

## localhost 模拟验证

专项通过：稳定保存顺序与旧数据回退、同名资料 ID 隔离、原三组调度、A/B/C 倒序范围、整轮统一计次、连续新轮次、重复事件、启动/推进/最终结算保存失败、跨日刷新、取消、删除、范围变化防护、原记录与 Markdown 不变、JSON 完整恢复、原自动备份时机的 Firebase mock。

浏览器通过：390/768/1440 CSS px 下的多选、按钮位置和次数显示、删除取消、存储失败、重复点击、视频链接、OUTPUT/教学法子页面刷新返回、继续旧任务、倒序断点恢复和完成后刷新不重复计数。所有浏览器使用隔离资料，外部请求全部阻断。

全套 `.test.cjs`：83 项通过，6 项既有失败；已只读加载 Git HEAD 源码到内存复现同样的失败，未为本次功能修改无关模块：

- `automatic-backup-resume.test.cjs`：旧按钮文字断言。
- `backup-safety.test.cjs`：暂停状态文案断言。
- `firebase-ui.test.cjs`：导出按钮旧 DOM 包装断言。
- `focus-review.test.cjs`：旧重点题输入界面断言。
- `learned-material-ui.test.cjs`：旧焦点定位断言。
- `manual-cloud-deletion.test.cjs`：旧链接断言。

尚未进行 iPhone/iPad Safari 实机验证；当前为隔离 Edge 的手机、平板、桌面尺寸测试。未部署、未推送、未修改 Firestore Rules，未清除真实学习数据。
