# 清除本设备本地数据

入口位于设置 → 学习数据保护底部。确认范围后点击「继续清除」，准确输入「清除本地数据」才能执行。打开确认区域、取消或输入错误均不修改存储。

## 清除范围

只通过 `PocketEnvironment.requireStorage()` 删除当前环境的以下键：

- `cognivex-pocket-state`
- `pocket-listening-start-v1`
- `pocket-training-sop-model-v1`
- `pocket-last-view-v1`
- `pocket-view-history-v1`
- `pocket-offline-backup-meta-v1`
- `pocket-daily-review-test-date-v1`
- `pocket-data-deletion-v1`
- `pocket-cloud-emergency-<UUID>`：仅严格匹配已核实的 UUID 格式。

开发环境实际键带 `pocket-development-v1:` 前缀；正式环境不带前缀。环境依据 URL 白名单，不依据设备类型。其他环境、未知键、Firebase 认证持久化、IndexedDB 和浏览器缓存均不处理。

保留 `pocket-local-reset-v1`、`pocket-cloud-control-v1`、`pocket-data-epoch-v1` 等安全元数据，阻止清除后空数据上传。已有云端重启、同步清空、未完成恢复流程会阻止本次清除；不擅自移除这些保护。容量监控统计安全元数据，因此清除后通常不为零。

## 云端隔离和异常恢复

复用现有会话锁和本机暂停机制。其他 Pocket 标签页仍打开、安全锁缺失、云端上传/恢复/后台维护仍在进行时拒绝清除。成功取得独占锁后，持久写入暂停标记、取消排队任务并使旧任务令牌失效；不调用 Firebase 适配器。

刷新后的账号初始化、定时重试和保存通知均继续受原有暂停标记保护，不自动恢复云端旧数据。JSON 恢复继续使用原流程，恢复后仍暂停自动备份。重新积累本机数据不会自动覆盖旧云端备份；云端重新开启必须通过原有显式安全检查。

删除前将原始白名单值写入并读回 `pocket-device-clear-journal-v1`。空间不足或日志无法保存时不开始删除。删除异常时回滚并保持备份暂停；回滚无法完成时保留日志并报告失败。页面异常关闭后，只有取得独占锁才会恢复未完成清除的本机原记录；已成功提交的清除不恢复旧记录。清除成功后刷新页面，丢弃旧的内存学习状态。

容量按实际键名和值的 UTF-16 长度乘以 2 估算，仅扫描当前环境的已核实 Pocket 键。5 MiB 是参考值，不是实测配额；检测不写入数据、不触发备份。

## 本地验证

在 `D:\Pocket` 下运行：

```text
node tests/device-local-clear.test.cjs
node tests/device-local-clear-environment.test.cjs
```

测试仅使用内存存储和模拟适配器，覆盖双重确认、白名单、localhost 隔离、零云端上传/删除、跨设备保留、任务和安全锁拒绝、删除/日志异常、刷新暂停、崩溃恢复以及 JSON 恢复。不连接真实 Firebase，不清除真实学习记录，不部署。

尚需在真实浏览器使用专门创建的 localhost 测试数据验证布局和安全锁支持；不应为验收操作正式学习数据。永久存储故障导致回滚失败时必须保留页面和保护日志，不能误报成功。
