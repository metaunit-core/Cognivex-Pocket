最新配置与实现见 [FIREBASE_GENERATION_SETUP.md](FIREBASE_GENERATION_SETUP.md)。已新增协议 2 的周期保护及完整规则；以下旧说明描述原始阻塞，生产规则仍须手动部署和验证，现有暂停不会自动解除。

# 自动备份重启：当前阻塞与最小保护改动

## 三项检查分开

- 云端索引检查：服务器读取当前 UID 的 `backup/head`，查询 `snapshots` 和 `uploads` 是否存在任意记录。三处均明确为空才显示通过。
- 历史数据销毁验证：本客户端无法枚举已删除父文档下的全部孤立 `chunks`。结果始终为未验证，不能把索引为空称作全部历史已销毁。
- 新自动备份周期安全性：不要求先证明孤立历史分片全部删除；要求有服务器端强制的旧写入隔离。当前规则没有这项保护，所以仍不能启用。

## 已实现的入口

第四步的「重新开始自动备份」读取当前账号 UID、核对清空时 UID，检查本机尚未结束的备份/恢复任务、服务器索引、当前本机完整数据校验与 Material/Group/Run 统计。完全没有本机数据时也能报告零数量，不创建虚假学习记录。

索引为空时显示「云端当前备份为空。历史残留分片无法完全验证。」并展示新周期使用的本机统计预览。不会静默覆盖旧有效备份，也不会自动恢复旧记录。最终确认按钮因缺少服务器端保护而明确禁用；点击链接、完成索引检查、刷新或旧的重新绑定入口均不能解除暂停。

## 具体风险

现有 head 只用 `revision + 1` 递增，Firebase 事务只比较 expectedRevision。手动删除 head 后，新设备从 revision 1 开始。另一设备此前准备的 expectedRevision=1 请求可能在新 revision 1 出现后继续提交 revision 2，重新发布旧学习数据。只生成一个本地 UUID、重置 revision、换一个上传 UUID、清除本地暂停标记或要求关闭当前设备窗口，都无法约束另一设备的旧请求。

`tests/backup-restart.test.cjs` 用内存云端复现这个覆盖风险，并确认当前产品重启入口对此仍保持暂停。该测试不连接 Firebase。

## 最小可行的规则和协议改动（未应用、未部署）

1. 新增 `users/{uid}/backup/cycle` 持久控制文档，保存当前 `generation` 与单调提交序号。不得随 head/快照手动清理而删除；普通客户端不得删除或回退 generation/提交序号。只允许已登录的当前 UID 读取、按严格校验的事务创建或推进该文档。
2. 在 head、快照 manifest、上传索引和 chunks 的受限字段列表中加入 generation。所有新写入的 generation 必须匹配持久控制文档；chunks 还必须匹配所属 uploads 的 generation。已有不可变历史仍可由所属 UID 读取，不能因此开放覆盖或删除历史。
3. 修改现有 `validHead`、head create/update、uploads create、snapshots create、chunks create 的条件：存在周期控制文档时，缺少 generation 或 generation 过期的旧客户端请求一律拒绝。head 与 manifest 的 generation、revision 和提交序号必须通过 `getAfter` 与本次事务结果保持一致。head 消失也不能让提交序号退回到 1。周期不存在时的兼容策略需单独验证，不能在已启用周期后退回旧协议。
4. 新周期必须通过事务比较此前 generation，确认没有旧有效 head，再推进 generation。每次备份提交都同时验证本地原先持有的 generation、expectedRevision、expectedSnapshotId 与服务器记录，而不是自动采用服务器的新 generation。旧设备读到新周期后进入明确冲突状态，不能自行重新绑定旧资料。
5. 重启的前端确认绑定当前 UID、当前本地数据 hash 和检查结果；用户确认后重新检查条件，隔离当前设备旧异步任务，再建立并读回新周期。首个备份继续使用现有完整 JSON/SHA-256、分片读回和事务发布机制。仅当首个提交读回成功，才报告自动备份恢复；权限、断网、账号变化、部分提交或不确定结果保持暂停并支持安全重试。
6. 部署前使用 Firebase Emulator 验证：旧版无 generation 客户端、旧代际客户端、延迟事务和延迟分片写入、并发开启周期、手动删 head 后的序号回退、跨 UID、未登录、失败重试、新代际正常上传及刷新恢复。保留当前 UID 隔离、严格字段校验和不可变快照约束，不增加公开读写权限。

本次没有修改 `firestore.rules`、没有创建真实周期文档、没有部署后端，也没有假装周期协议已实现。仅添加一个 cycle 文档或配置开关仍不够；需要上述规则和客户端写入协议一起实现、验证和部署，之后才能启用恢复入口。