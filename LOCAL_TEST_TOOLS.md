# 两套复习顺序与本地测试清空

新建的每日正序复习轮次按首次保存顺序从最早到最新；新建的原有复习轮次按最新到最早。资料内部仍使用原有 Group 时间及稳定索引排序，共用完整题目复习页面。

兼容性：保留内部字段 `dailyReverseReview`、旧存储键及原有历史。已经开始的旧轮次不重排，继续其保存清单；每日旧轮次会显示说明，下一轮使用正序。当天已经完成的旧每日轮次不被重置。两套完成状态分别保存在 `dailyReverseReview` 和 `materialReviewSession`／`review`，不会互相完成。

## 本地测试清空入口

在 VS Code 本地电脑预览 `http://127.0.0.1:端口`，展开「每日正序复习｜测试工具」，点击「清空全部测试数据」并确认。取消不产生读写改变。

仅已成功初始化、Firebase 禁用、固定测试前缀的环境允许操作；还必须通过本地地址、桌面平台、非移动设备、精确指针与悬停检查。手机／iPad、正式 GitHub Pages、未知 HTTPS 和局域网地址不开放此清空功能。设备特征只是附加限制，保护正式数据的边界是严格环境验证和固定命名空间加键白名单。

需要支持 Web Locks 的浏览器；若其他 Pocket 标签页占用会话锁，先关闭它们。清空会更新测试数据 epoch，使未更新的旧标签页不能把旧测试状态重新保存回来。不会调用 Firebase、刷新页面、清空整域存储或发送网络请求。

## 允许删除的键

以下每个键都通过测试存储适配器访问，实际键名前必须带 `pocket-development-v1:`。绝不删除相同名称的无前缀正式键。

| 键（省略上述固定前缀） | 内容 |
| --- | --- |
| `cognivex-pocket-state` | 测试资料、分组、学习进度、两套复习队列及完成状态 |
| `pocket-listening-start-v1` | 测试泛听状态 |
| `pocket-training-sop-model-v1` | 测试训练输入 |
| `pocket-last-view-v1` | 测试页面位置 |
| `pocket-view-history-v1` | 测试导航历史 |
| `pocket-offline-backup-meta-v1` | 测试导出提醒记录 |
| `pocket-cloud-control-v1` | 仅测试命名空间下的本地备份控制记录 |
| `pocket-cloud-restore-journal-v1` | 仅测试本地恢复日志 |
| `pocket-local-reset-v1` | 仅测试本地重置标记 |
| `pocket-fresh-start-v1` | 仅测试清空标记 |
| `pocket-cloud-new-start-v1` | 仅测试初始化标记 |
| `pocket-offline-restore-pause-v1` | 仅测试 JSON 恢复标记 |
| `pocket-data-deletion-v1` | 测试删除记录 |
| `pocket-daily-review-test-date-v1` | 模拟日期 |
| `pocket-cloud-emergency-{UUID}` | 仅测试本地应急副本，限标准 UUID 键 |

`pocket-development-v1:pocket-data-epoch-v1` 更新为新的安全标识，不包含学习资料。清空后应用在内存中回到初始页，并按原流程保存干净状态和新导航位置，所以这些测试键可能立即重新出现，但不含旧资料。

生产学习键、生产备份控制键、Firebase Auth、IndexedDB、Cookie、其他应用键及不在白名单中的键均保留。不会删除 Firebase 文档。

## 本次文件

- 页面与复习：`index.html`、`js/app.js`、`js/daily-reverse-review.js`、`js/material-review.js`。
- 测试清空及内存重置：新增 `js/local-test-tools.js`，调整 `js/data-deletion.js`、`js/navigation.js`、`js/training-sop.js`。
- 新增 `tests/review-order-directions.test.cjs`、`tests/local-test-clear.test.cjs`。
- 调整 `tests/helpers/pocket-learning-ui.cjs`、`tests/daily-reverse-review.test.cjs`、`tests/daily-review-completion-navigation.test.cjs`、`tests/daily-review-navigation-isolation.test.cjs`、`tests/daily-review-test-date.test.cjs`、`tests/daily-review-groups.test.cjs`、`tests/learned-material-ui.test.cjs`、`tests/executor.test.cjs`，适配新顺序并保留原保护验证。

本次本地测试共 38 个文件，35 个通过。已有的 `automatic-backup-resume.test.cjs`、`backup-safety.test.cjs`、`manual-cloud-deletion.test.cjs` 仍因旧按钮／旧文案断言失败。真实手机、真实浏览器硬件识别及线上部署尚未验证；未执行真实 Firebase 操作或部署。
