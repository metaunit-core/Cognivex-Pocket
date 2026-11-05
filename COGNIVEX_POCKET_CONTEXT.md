以下内容根据 Cognivex Pocket 当前本地代码生成。后续开发以实际代码为最终依据。若用户提出新需求，默认不改变已有文字、功能和数据，并主动优化视觉布局与跨设备兼容性。

# Cognivex Pocket｜新窗口快速上下文

生成日期：2026-11-06（Asia/Shanghai）。项目：`D:\Pocket`。完整交接见同目录 `COGNIVEX_POCKET_HANDOFF.md`，包含完整 VIDEO、教学法、做题/知识点方法论及可操作版、五层卡片、双阶段实战原文和逐文件函数索引。本地未提交/未跟踪文件也是当前实现，不能只看远程仓库或历史聊天。

## 1｜项目是什么

移动优先的学习执行导航器：管理资料与题号分组、记录当前任务和真实 Run、执行正常组内循环/当天资料间复习/每日正序/重点题/选做重学，并提供学习方法指导。不是内置题库、自动判题器、视频播放器或 AI 教师服务。

## 2｜技术栈与文件

原生 HTML/CSS/JavaScript，无根目录 package.json、构建框架或打包步骤。`index.html` 按依赖顺序加载 IIFE 模块，Firebase部分使用浏览器 ES module。

- `js/app.js`：页面协调、资料录入/编辑/dialog、当前任务与提醒。
- `js/storage.js`：主状态校验、克隆/CAS原子保存、笔记安全更新。
- `js/grouping.js`、`scheduler.js`、`executor.js`、`history.js`：分组、正常内部循环、Run转换、完成证据。
- `js/material-review.js`：当天之前新资料的倒序一遍过及下一资料保护。
- `js/daily-reverse-review.js`：名称旧，**新轮次实际每日正序 oldest-first**；`review-admission.js` 管理当天准入。
- `js/relearning.js`：独立重学v3；`focus-review.js`/`focus-review-ui.js`：独立重点题系统。
- `js/review-ui.js`：所有模式共享OUTPUT/独立VIDEO/VIDEO七状态。
- `js/output-sop*.js`、`output-operational*.js`：教学法、做题、知识点方法论/操作版/当前情况导航。
- `js/summary-cards.js`、`independent-practice.js`：两个核心指导页；`guide-roadmap.js`为静态SVG底层。
- `js/navigation.js`：SPA显示、underlying任务上下文、返回/滚动/折叠恢复。
- `js/environment.js`、`cloud-backup.js`、`firebase-adapter.js`/`firebase-ui.js`、`learning-backup.js`：环境隔离与备份恢复。
- `css/style.css`：全局与页面局部样式；多处同名覆盖，须看最终级联。

本地用Live Server或已有localhost静态服务器，例如 `http://127.0.0.1:5500/`。必须看到“测试环境｜不会连接 Firebase”。`manifest.json`、`sw.js`目前均0字节，index未接入manifest/service worker；不可声称完整PWA安装/离线已实现。

## 3｜页面与导航

首页已学内容区：查看资料dialog、学习训练总纲、设备分工、当天新学资料复习、今日复习三入口。三入口顺序：**自主选择复习组合 → 正序复习全部 → 重点复习系统**。

新自主入口和原“查看资料 →”共用 `openMaterialsDialog`，打开同一资料列表/多选/重学/删除功能。原查看资料不跳动；其动画迁移到新自主入口，触发条件未另建。

资料列表→资料详情→更改资料：改学科/名称；追加分组、改分组情况、重点题号总结三块独立折叠。另有一键连续输入已学资料、选择性移除已熟练题目。正常新资料走basic→grouping→任务；未满足准入可预填但不能确认创建。

当前任务OUTPUT四入口：**视频模仿、训练内化、构建解题体系、自主刷题与实战**。第一个真实名称不是“模仿学路”。训练内化→教学法/做题/知识点；做题/知识点→方法论版/可操作版/当前情况导航。两核心指导页都是独立阅读视图，返回恢复原任务，不新增完成门槛。

其他实际视图：60分钟泛听；学习训练总纲overview/model/prompt/detection；大量刷题资格/分流；重点学科/列表/分组/逐题执行/历史；每日复习；资料间复习；选做重学；设备原则；空间清理指引；设置中的容量/JSON与Markdown导出/JSON或云端恢复/冲突诊断/登录/设备本地清除。

导航值以 `navigation.js` 的pages白名单为准。VIDEO是依附原任务outputPage的独立main，不是单独URL路由。不要以硬显示首页代替 `PocketNavigation.back()`。

## 4｜VIDEO与OUTPUT

VIDEO三个独立外层折叠阶段；第一阶段七环节：自己尝试、标注问题（课前）、看视频、边看边速记、关视频主动回忆、对标补漏、循环复习。原文详见完整文档或review-ui.js，不自行润色。

七环节标题右侧状态：idle/doing/done/stuck，对应未开始/进行中/已完成/卡住了。前六项只改自身；手动将第七项从非done设done时，**同次持久化七项全idle、cycles+1、revision+1**。按Material/Group分别记录到主状态videoStageProgress；重点复习采用特殊@focus+重点Group/题ID。防重复事件/保存失败保护存在；不计原学习次数。

重要：执行器当前 `startRun` 直接进入output、videoSkipped=true，旧video断点会升级。看视频、七环节状态及其循环次数都**不强制作为任务完成门槛**。真正推进由原“输出达标 → 下一步”及当前状态机控制。

教学法有0、1、2、3、5、6原编号，不应自动纠号；“本步已完成”为临时手动导航。可操作版有详细/简短/独立三模式和内存Map状态，不具备VIDEO的持久循环机制。AI、语音、截图、OneNote、全真模考等多数是操作说明，无自动AI/录音/考试接口。

构建解题体系：路线“单题 → 组题 → 章节 → 复现 → 验收”；六步诊断；五张独立默认收起卡。第四卡已改为“章节复现卡｜每次复现”，表格相应行为“复现”；心得原文仍用“复习”，不要全局替换。独立金色原则卡、蓝灰心得卡、移动表格内部滚动。

自主刷题与实战：最新顶部路线卡为#141D2B，横向01/02蓝、03金，SVG viewBox 500×160、圆r40、虚线只在圆之间。A自主刷题/B全真模考独立折叠；五步骤、三种题目分流、四条标准、模考四阶段和持续闭环均只是指导。最新“逐步过渡”长句以independent-practice.js原文为准，勿回退旧文案。

## 5｜三套核心调度与每日准入

1. **正常新学**：scheduler动态组内循环；三组是新1→新2→复1→复2→新3→复1→复2→复3，保留末轮。真实Run证据齐备才标Material完成。
2. **正常资料间复习**：完成后建立requiredAfterLearning；点“开始下一份资料”先复习同保存日此前真正新学完成的资料，排除当前、历史及快速录入。资料按saveOrder倒序，每资料组号正序连续一遍。A完成无跨资料；B后A；C后B→A；D后C→B→A。冻结队列跨天保持原日期/进度。
3. **每日正序全部**：用户主动开启，按正式保存顺序旧到新，冻结每Group独立task；Run不混入原Group.runs。同日续原队列，次日旧round归档建新轮；旧倒序轮次兼容继续，不强制重排。
4. **选择重学v3**：选中资料按正式保存顺序旧到新，所有有效组正序各复习一次；不插新学循环，不追加倒序。复制隔离engine，sourceStamp/布局版本与checkpoint防错；全轮完成才每份Material计一次relearningCount/history，并原子记录完成日准入。v1/v2旧批次保留旧兼容路径。
5. **重点题**：真实原Group题号收集、稳定来源、按学科分组/严格OR成绩筛选、逐题或全部模式；无效/熟练移除不伪造OUTPUT，真实有效整轮才可准入。

当日新增资料准入是有效每日完成 **或** 重点完成 **或** 全轮重学成功计数。它不会取消未完成主任务、资料间义务及generation/collectionKey等第二道保护。仅点入口/勾选/开始任务不解锁；新一天按本地日期重新判断。

## 6｜数据、分组、笔记与备份

主状态key `cognivex-pocket-state`、根version=1。核心：materials[].groups[].runs、currentSession、materialReviewSession、review、dailyReverseReview、reviewAdmission、relearning、focusReview、videoStageProgress。

`Storage.updateState`检查最新本机字节与内存快照一致后深克隆、保存完整JSON；旧窗口拒绝覆盖。读失败保护原字节。启动会按兼容规则迁移字段/旧断点，不是纯只读。

重新分组方案B：保留原学习GroupID/Run，用reviewGrouping.activeId/layouts新建今后复习布局。读取用 `Grouping.reviewMaterial` 有效视图；不要把所有历史版本合并，也不要直接假设active raw layout含所有追加题。

每Material自由笔记为 `questionSummary`。input即时同步保存，updateMaterialSummary重新读取最新主状态、检查expected笔记并只改该字段；缺字段按空串读。与真实重点题库完全隔离，无题号自动解析。

JSON v2备份固定五key：主状态、泛听、训练输入、最近页面、返回历史；保留原始字符串、SHA-256及未知主状态字段；v1只恢复主状态。恢复有预览/应急副本/双确认/锁/日志/回滚，之后自动备份暂停。Markdown仅阅读不可恢复，包含最新笔记、布局、成绩及重点/移除记录。

正式环境仅白名单GitHub Pages origin/path；其他地址key前缀 `pocket-development-v1:` 且Firebase硬禁用。Firebase是完整快照备份，15秒防抖，分片/摘要/服务端读回、generation/protocol/revision防旧设备写入；不是跨设备实时同步。已发布历史不自动删除；只清理废弃上传。配置值不要复制到交接或聊天。

## 7｜视觉风格

黑底#0B0E13、灰卡#171B22/#202631、白字#F4F6FA、灰字#A5AFBE、边框#343A44、柔蓝#9DBBE8、柔金#E8BF62；系统字体、10/14/20px圆角、长文舒适行高、手机safe-area。核心方法金色、核心目标蓝色；局部样式优先限定页面ID，禁止误伤入口和其他模块。

## 8｜最重要保护要求

默认保留全部文字、功能、调度、数据；最小范围修改。AI主动优化视觉，但明确截图/范围优先。手机/桌面/PWA兼容性优先，复用原组件。不要随意改Firebase、存储key或JSON结构；不清空真实数据、不强清异常任务、不伪造完成或Run；未经要求不部署、不推送、不重置现有Git修改。完成后说明实际验证及未验证项。

## 9｜本轮测试与已知问题

- 当前98个内存隔离根目录单元测试：**79通过，19失败，0超时**。48个JS原生`node --check`全部通过。完整失败表在交接文档第10节，不能说全绿。
- 9项失败因各自旧DOM夹具缺createElementNS；部分重点UI测试仍找旧“视频/输出”按钮；旧备份按钮/链接/状态/wrapper断言不符；focus-review.test的questions未定义、learned-material-ui焦点预期、material-deletion-cloud缺Grouping依赖需按具体原因复核。不要反向改真实UI来迎合旧断言。
- 确定缺口：追加保护未检查活动重学，本资料追加会改变sourceStamp并阻断旧批次；本轮仅记录，未修复。
- 确定边界：追加后的新题由reviewMaterial动态补入，未物化进raw active布局；追加页显示的是原学习组号/题量，不是新复习布局。
- 空间清理静态指引“删除全部”与备份页“保留generation/backupCycles”安全说明存在张力，不能照简短指引删除安全元数据。
- 本轮没有运行会写截图的16个浏览器脚本、Firestore模拟器、真实云、真机或PWA安装/离线检查；均待验证。不能借用历史聊天测试结果充当本轮结果。

## 10｜新窗口如何继续

先读本文件→完整HANDOFF对应章节→实际源码与测试→git status及适用AGENTS.md。确认用户最新范围，区分静态学习说明与真实状态机。只改必要文件，在localhost隔离数据验证；记录原文完整性、点击返回、保存/恢复/重复事件与旧数据兼容。涉及真实云规则、清除、迁移或部署先说明风险并取得明确授权。

本次交接只新增这两份Markdown；244个已有文件前后SHA-256一致，0个内容变化、0个删除，原有未提交修改保持原样。
