# 一键输入学习资料

新增入口位于首页「正式开始学习新资料／继续上次学习」按钮附近。它是独立输入页，支持取消返回、实时分组预览及一次保存，不替换原入口。

## 保存与兼容

- 资料仍写入原 `materials` 数组，无快速资料类型、独立列表或第二套数据库。
- `PocketHistory.markCompleted()` 是从原资料完成流程提取的公共最终状态逻辑：普通完成流程与快捷入口共用 `completed`、`completedAt`、`totalGroups` 和原有 `admit()` 入队／Group 身份规则。原完成流程的 Scheduler 判断、任务推进及 VIDEO／OUTPUT 要求没有改变。
- 快捷资料的 `createdAt`、`completedAt`、`addedToReviewAt` 是本次创建／主动赋予完成状态的时间，不声称是以前实际学习发生的时间。
- Group 使用原结构及稳定 ID；`executionCompleted: true` 表示用户快捷赋予的已完成状态。`videoCompleted`、`outputCompleted` 为 false，`firstLearningCompletedAt` 为 null，`runs` 为空，不生成训练日志。
- 成绩字段为 null，重点题文本为空，VIDEO／OUTPUT 链接为空数组，后续通过原页面真实填写。
- 调用原 `recordSavedMaterial()` 记录保存顺序，并和原正式新增资料一样增加资料集合 generation。不会伪造点击、每日完成、重点完成或复习解锁记录；不替换／删除当前学习、每日或倒序会话。快捷入口不要求先补做训练，原新增入口的门槛和规则不变。
- 本地事务仍用 `PocketStorage.updateState()`，并保留原过期状态校验、CloudSignal 和失败处理。保存前验证全部输入，原子写入所有 Group；保存成功的同一个表单无法再次提交，失败可重试，同名资料使用不同 ID。

## 题号与预览

复用现有追加资料解析器对连续／不连续范围进行校验，保持原输入顺序、重叠拒绝和整数规则。快捷入口把真实题号按每组题数打包，因此 `1-10,13,15-18`、每组5题产生三组：`1-5`、`6-10`、`13,15-18`。

连续 Group 仍用 start/end；跨间隔 Group 复用已支持的 `group.questionRange`，以同一种范围字符串明确列出真实成员，绝不生成第14题。预览和保存共用 `previewCompleted()`。现有勾选控件及页面直接识别该字段；档案仅补充读取真实范围，模板与成绩取值不变。原追加资料的重叠检查对明确范围逐段判断，因此后续追加空缺的第14题不会误判为已存在。

为沿用原解析器的批量保护，单次快捷输入最多10,000题，超限明确报错且不写入任何资料。原连续新增分组方式和追加分组打包方式不变。

## 备份与后续功能

原正序、倒序、重点复习、链接编辑、资料编辑／删除、Markdown、JSON 和 Firebase 都读取同一份普通资料对象。正在进行的冻结复习队列不被改写，新资料按原队列创建规则进入后续快照。

JSON 格式、校验、恢复入口和 Firebase 路径／调度／冲突处理均未改动。资料保存只发出原保存信号；现有完整状态备份在其原有条件下捕获最新集合。备份失败不表示已上传成功。

## 修改文件

业务：`index.html`、`css/style.css`、`js/app.js`、`js/navigation.js`、`js/grouping.js`、`js/history.js`、`js/learning-archive.js`；新增 `js/quick-material.js`。

测试：新增 `tests/quick-material.test.cjs`、`tests/quick-material-cloud.test.cjs`；更新测试加载器 `tests/helpers/pocket-learning-ui.cjs` 及 localhost 浏览器测试 `tests/material-modal.browser.cjs`。

## 验证

全部数据均为合成 localhost 数据或内存 Firebase mock。覆盖创建／预览、连续与不连续范围、稳定 ID、空成绩／空历史、刷新、同名资料、重复提交、无效输入、写入失败重试、旧断点保留、正序／倒序、成绩、勾选与重点复习、Markdown、JSON 校验／原恢复流程、自动备份 mock、上传中新增、选择性删除。

全套模拟测试81项，79通过。两项此前已有失败保留：`learned-material-ui.test.cjs` 的旧新增资料引导焦点断言，以及 `manual-cloud-deletion.test.cjs` 的旧云端删除入口静态断言。未为这些断言修改业务规则。

独立 Chromium 临时配置在390×844、768×1024、1024×768、1440×900验证快捷页面、无横向溢出、实时三组预览、保存、已完成状态、空训练历史、旧任务不变及刷新。所有外部网络请求均被阻断。截图为 `tests/artifacts/quick-material-*.png`。

仍需 iPad Chrome／Safari 和手机实机检查软键盘、安全区域及触摸交互；桌面尺寸模拟不等于 WebKit 或实机验证。没有访问真实学习数据或 Firebase，没有部署、推送或修改 Rules。
