(function () {
  'use strict';
  // Independent static guidance; no learning records or original OUTPUT content.
  window.PocketOutputOperationalData = {
  "problems": {
    "title": "做题 OUTPUT｜可操作版",
    "stages": [
      {
        "id": "problems-1",
        "title": "自探｜自己找路",
        "memory": "先不看老师，自己找路，看看哪里会卡。",
        "nodes": [
          {
            "id": "problems-1-1",
            "stageId": "problems-1",
            "name": "读题",
            "trigger": "刚拿到一道题。",
            "question": "它到底让我求什么、证明什么或判断什么？",
            "action": "圈出设问，读完条件，用自己的话复述题目任务。",
            "standard": "能够说清最终要求。",
            "shortQuestion": "它要我干什么？",
            "shortAction": "圈设问，复述任务。",
            "shortStandard": "说清目标。"
          },
          {
            "id": "problems-1-2",
            "stageId": "problems-1",
            "name": "拆题",
            "trigger": "已经明确题目目标。",
            "question": "解决最终目标以前，需要先解决哪个小问题？",
            "action": "将最终目标拆成一两个需要先解决的小目标，再整理相关已知条件和限制。",
            "standard": "明确接下来应先解决什么。",
            "shortQuestion": "先解决什么？",
            "shortAction": "拆目标，找小问题。",
            "shortStandard": "知道第一步要解决什么。"
          },
          {
            "id": "problems-1-3",
            "stageId": "problems-1",
            "name": "找口",
            "trigger": "已经知道条件和目标，但还没有突破口。",
            "question": "题目里有什么特别的信号？图 A 里是否见过类似结构？",
            "action": "圈出关键表达式、数字、图形或条件，尝试将它和图 A 的知识或核心处理思想对应起来。",
            "standard": "找到一个值得尝试的突破口；找不到则明确标记卡点。",
            "shortQuestion": "什么信号提示我？",
            "shortAction": "圈信号，对照图 A。",
            "shortStandard": "找到入口或明确卡点。"
          },
          {
            "id": "problems-1-4",
            "stageId": "problems-1",
            "name": "调路",
            "trigger": "发现可能的题目信号。",
            "question": "图 A 中哪条路径能连接已知和目标？",
            "action": "回忆并写下相关公式、知识联系或候选解题路径，检查其适用条件。",
            "standard": "至少提出一种可尝试的路径，或明确缺少什么知识。",
            "shortQuestion": "图 A 里哪条路能用？",
            "shortAction": "回忆候选路径。",
            "shortStandard": "找到候选解法。"
          },
          {
            "id": "problems-1-5",
            "stageId": "problems-1",
            "name": "选路",
            "trigger": "存在一个或多个候选方法。",
            "question": "哪个方法更快、更稳、更不容易错？",
            "action": "比较路径步骤、计算量、条件适配及出错风险，选定一条。",
            "standard": "知道准备使用什么方法，以及为什么。",
            "shortQuestion": "哪条更快、更稳？",
            "shortAction": "比较后选一条。",
            "shortStandard": "确定路径。"
          },
          {
            "id": "problems-1-6",
            "stageId": "problems-1",
            "name": "执行",
            "trigger": "已经选好方法。",
            "question": "现在第一步具体写什么？",
            "action": "真正画图、列式、推导或计算；将熟练的基础操作逐渐练到快速准确。",
            "standard": "得到结果，或准确定位第一处做不下去的地方。",
            "shortQuestion": "第一步写什么？",
            "shortAction": "动手推导、计算。",
            "shortStandard": "做出结果或找到卡点。"
          },
          {
            "id": "problems-1-7",
            "stageId": "problems-1",
            "name": "监控",
            "trigger": "正在执行解题路径。",
            "question": "这一步正确吗？我是否越来越接近目标？",
            "action": "检查关键推理、题目条件、符号、运算和结果合理性。",
            "standard": "能够发现并纠正明显错误。",
            "shortQuestion": "这一步对吗？",
            "shortAction": "查条件、逻辑和计算。",
            "shortStandard": "及时纠错。"
          },
          {
            "id": "problems-1-8",
            "stageId": "problems-1",
            "name": "换路",
            "trigger": "当前方法走不通或明显过于复杂。",
            "question": "具体卡在哪里？还能从哪个条件重新找路？",
            "action": "标出第一处障碍，重新观察题目信号、图 A 和其他路径，再尝试。",
            "standard": "找到新的尝试方向；仍不会则留下明确卡点进入学路。",
            "shortQuestion": "卡在哪？还能怎么走？",
            "shortAction": "定位卡点，换入口。",
            "shortStandard": "找到新路径或明确困难。"
          }
        ],
        "methods": []
      },
      {
        "id": "problems-2",
        "title": "学路｜研究高手为什么能找到路",
        "memory": "看老师为什么想到，而不是只看老师怎么做。",
        "nodes": [
          {
            "id": "problems-2-1",
            "stageId": "problems-2",
            "name": "学范",
            "trigger": "自己已经独立尝试。",
            "question": "老师从哪里入手，为什么这样做？",
            "action": "看老师讲解，在选择突破口或关键方法的位置暂停，标记思路转折。",
            "standard": "能复述老师的主要解题路径。",
            "shortQuestion": "老师从哪开始？",
            "shortAction": "暂停并标记关键步骤。",
            "shortStandard": "说出老师路径。"
          },
          {
            "id": "problems-2-2",
            "stageId": "problems-2",
            "name": "对比",
            "trigger": "看懂老师解法。",
            "question": "我和老师从哪一步开始不一样？",
            "action": "对照自己的草稿与老师解法，圈出第一次关键差异。需要时截图或用语音向 AI 说明。",
            "standard": "能指出具体差异。",
            "shortQuestion": "第一处差异在哪？",
            "shortAction": "并排比较，圈出差别。",
            "shortStandard": "找到差异。"
          },
          {
            "id": "problems-2-3",
            "stageId": "problems-2",
            "name": "析因",
            "trigger": "找到了路径差异。",
            "question": "为什么老师能想到，我没有想到？",
            "action": "判断是没认出题目信号、没想起知识、选错方法，还是执行出了问题。",
            "standard": "能够说出有依据的原因。",
            "shortQuestion": "我为什么没想到？",
            "shortAction": "追查差异来源。",
            "shortStandard": "找到疑似原因。"
          },
          {
            "id": "problems-2-4",
            "stageId": "problems-2",
            "name": "找征",
            "trigger": "已经知道老师选择的方法。",
            "question": "老师看到了什么条件，才想到这个方法？",
            "action": "回到老师第一次选方法的位置，圈出触发信号，写下「看到什么 → 想到什么 → 怎么做」。",
            "standard": "关掉讲解，仍能说出方法的触发信号和适用条件。",
            "shortQuestion": "老师看到了什么？",
            "shortAction": "圈信号，写「看到→想到→做」。",
            "shortStandard": "自己说出触发条件。"
          },
          {
            "id": "problems-2-5",
            "stageId": "problems-2",
            "name": "迁移",
            "trigger": "找到了触发信号。",
            "question": "换一道题，我还能认出来吗？",
            "action": "找一道相似但不相同的题，先独立判断方法，再尝试解答。",
            "standard": "在新题中主动使用；失败则明确失败的位置。",
            "shortQuestion": "换题还认得吗？",
            "shortAction": "找相似题，独立做。",
            "shortStandard": "主动识别并应用。"
          }
        ],
        "methods": []
      },
      {
        "id": "problems-3",
        "title": "内化｜把高手的路变成自己的路",
        "memory": "关答案，自己做、自己讲，卡住补，最后独立做。",
        "nodes": [
          {
            "id": "problems-3-1",
            "stageId": "problems-3",
            "name": "模仿",
            "trigger": "刚理解老师的做法。",
            "question": "老师每一步为什么这样做？",
            "action": "参考范例，自己重新执行关键步骤，同时解释理由。",
            "standard": "能解释步骤，不只是照抄。",
            "shortQuestion": "为什么这样做？",
            "shortAction": "跟着路径亲手做。",
            "shortStandard": "能解释关键步骤。"
          },
          {
            "id": "problems-3-2",
            "stageId": "problems-3",
            "name": "重做",
            "trigger": "模仿结束。",
            "question": "关掉答案，我还能从头做吗？",
            "action": "关闭讲解，用空白纸重新找路解题。",
            "standard": "独立完成，或者明确卡点。",
            "shortQuestion": "关答案还会吗？",
            "shortAction": "空白重做。",
            "shortStandard": "做出或找到卡点。"
          },
          {
            "id": "problems-3-3",
            "stageId": "problems-3",
            "name": "复盘",
            "trigger": "重做结束。",
            "question": "哪里是真会，哪里只是记住了老师答案？",
            "action": "对照讲解，圈出错误、遗漏和依赖记忆的步骤。",
            "standard": "明确尚未掌握的环节。",
            "shortQuestion": "哪里是真会？",
            "shortAction": "圈错点、依赖点。",
            "shortStandard": "定位薄弱步骤。"
          },
          {
            "id": "problems-3-4",
            "stageId": "problems-3",
            "name": "教人",
            "trigger": "觉得已经弄懂。",
            "question": "如果教给不会的人，我怎样解释？",
            "action": "打开录音，假装自己是老师，从空白开始边出声解释边做题。",
            "standard": "能讲清突破口、关键路径和原因。",
            "shortQuestion": "我能讲给别人吗？",
            "shortAction": "录音，边讲边从空白做。",
            "shortStandard": "讲通关键原因。"
          },
          {
            "id": "problems-3-5",
            "stageId": "problems-3",
            "name": "暴露",
            "trigger": "讲题时卡住或说不清。",
            "question": "究竟是哪一步解释不出来？",
            "action": "保留录音或转写文本，指出第一处讲不通的位置。",
            "standard": "把漏洞变成明确问题。",
            "shortQuestion": "讲不清哪一步？",
            "shortAction": "标记卡点并保留讲题记录。",
            "shortStandard": "明确问题。"
          },
          {
            "id": "problems-3-6",
            "stageId": "problems-3",
            "name": "补洞",
            "trigger": "已经找到具体漏洞。",
            "question": "为什么我没想到？哪个信号本应触发这一步？",
            "action": "把讲题记录和卡点交给 AI，只分析对应障碍、高手思路和题目信号；必要时定点回看老师讲解。",
            "standard": "能独立处理刚才的卡点。",
            "shortQuestion": "为什么没想到？",
            "shortAction": "AI 定点分析，补关键一步。",
            "shortStandard": "补好卡点。"
          },
          {
            "id": "problems-3-7",
            "stageId": "problems-3",
            "name": "再教 ↻",
            "trigger": "已经补完卡点。",
            "question": "现在关掉帮助，我还能从头讲通吗？",
            "action": "关闭讲解和 AI，重新从空白讲题、做题；再次卡住则返回补洞。",
            "standard": "能独立讲清主要路径并完成解题。",
            "shortQuestion": "现在能讲通吗？",
            "shortAction": "空白再讲、再做。",
            "shortStandard": "独立讲通。"
          },
          {
            "id": "problems-3-8",
            "stageId": "problems-3",
            "name": "独立",
            "trigger": "已经能边教别人边完成题目。",
            "question": "撤掉录音、出声讲解和外部帮助，我还能做对吗？",
            "action": "像考试一样，在脑中独立思考，完成原题或相应训练题。",
            "standard": "不依赖提示，也能独立找路并正确解答。",
            "shortQuestion": "不靠任何帮助还会吗？",
            "shortAction": "静默独立解题。",
            "shortStandard": "自己找到路径并做对。"
          }
        ],
        "methods": []
      },
      {
        "id": "problems-4",
        "title": "提炼｜留下可迁移经验",
        "memory": "留下下次能够直接用的一句话。",
        "nodes": [
          {
            "id": "problems-4-1",
            "stageId": "problems-4",
            "name": "留声",
            "trigger": "刚刚完成一次有价值的独立讲题。",
            "question": "刚才哪些理解过程以后值得回听？",
            "action": "将讲题录音保存在自由笔记；新问题可以追加录音。",
            "standard": "值得复听的过程已留存。",
            "shortQuestion": "什么值得留声？",
            "shortAction": "保存关键录音。",
            "shortStandard": "有记录可查。"
          },
          {
            "id": "problems-4-2",
            "stageId": "problems-4",
            "name": "记录",
            "trigger": "发现了关键错误或突破。",
            "question": "我原来哪里错了，后来怎么弄懂的？",
            "action": "在自由笔记写简短心得；AI 长分析保存 OneNote，并按原习惯添加链接。",
            "standard": "下次回看能知道如何避免相同问题。",
            "shortQuestion": "原来错哪，后来怎么改？",
            "shortAction": "自由笔记简记，长分析入 OneNote。",
            "shortStandard": "留下可用经验。"
          },
          {
            "id": "problems-4-3",
            "stageId": "problems-4",
            "name": "为复现提供原料",
            "trigger": "准备更新图 A。",
            "question": "这道题最值得长期调用的处理思想是什么？",
            "action": "压缩为「看到什么 → 想到什么 → 怎么做」，对应放到图 A。",
            "standard": "经验能够指导以后遇到类似题。",
            "shortQuestion": "这题留下什么路？",
            "shortAction": "写「看到→想到→做」。",
            "shortStandard": "能用于类似题。"
          },
          {
            "id": "problems-4-4",
            "stageId": "problems-4",
            "name": "积问",
            "trigger": "发现仍有未解决的疑问。",
            "question": "有什么值得进一步研究？",
            "action": "将疑问写成一个明确问题。",
            "standard": "以后可以直接继续研究。",
            "shortQuestion": "还有什么没弄懂？",
            "shortAction": "记一个具体问题。",
            "shortStandard": "问题可继续研究。"
          }
        ],
        "methods": []
      },
      {
        "id": "problems-5",
        "title": "创题｜站到出题人的位置",
        "memory": "想想出题人考什么、怎么设置障碍，再自己改一道题。",
        "nodes": [
          {
            "id": "problems-5-1",
            "stageId": "problems-5",
            "name": "考点",
            "trigger": "已经弄懂原题。",
            "question": "这道题涉及哪些核心知识？",
            "action": "圈出主要知识点及其联系。",
            "standard": "能说清考查内容。",
            "shortQuestion": "考什么知识？",
            "shortAction": "圈核心考点。",
            "shortStandard": "知道考点。"
          },
          {
            "id": "problems-5-2",
            "stageId": "problems-5",
            "name": "考能",
            "trigger": "已经找到知识点。",
            "question": "出题人想检测哪种能力？",
            "action": "指出最关键的能力，例如识别、建模、推理、运算或迁移。",
            "standard": "明确核心能力要求。",
            "shortQuestion": "真正考什么能力？",
            "shortAction": "指出核心能力。",
            "shortStandard": "知道考能。"
          },
          {
            "id": "problems-5-3",
            "stageId": "problems-5",
            "name": "设障",
            "trigger": "知道了考查目标。",
            "question": "怎样改题，才能让没掌握的人暴露问题？",
            "action": "改变一个条件、隐藏关系或增加干扰，并检查题目是否合理。",
            "standard": "设计出一个明确的障碍。",
            "shortQuestion": "怎样让不会的人暴露问题？",
            "shortAction": "改条件、设障碍。",
            "shortStandard": "障碍合理。"
          },
          {
            "id": "problems-5-4",
            "stageId": "problems-5",
            "name": "拆障",
            "trigger": "已经有了障碍。",
            "question": "真正会的人怎样识别和破解？",
            "action": "寻找题目信号、突破口和可行解法。",
            "standard": "能解释破解障碍的关键思路。",
            "shortQuestion": "高手怎么破？",
            "shortAction": "找信号和突破口。",
            "shortStandard": "能解释破解方法。"
          },
          {
            "id": "problems-5-5",
            "stageId": "problems-5",
            "name": "变题",
            "trigger": "已经理解原题与障碍。",
            "question": "改变一个条件后，原来的方法还适用吗？",
            "action": "编一道合理的新题，自己解答并检查结果。",
            "standard": "能够解答变式题并解释方法变化。",
            "shortQuestion": "条件变了，路怎么变？",
            "shortAction": "改题、解题、核对。",
            "shortStandard": "变式合理可解。"
          }
        ],
        "methods": []
      },
      {
        "id": "problems-6",
        "title": "复现｜建立并内化图 A",
        "memory": "关掉资料，把整章知识和解题路径从脑子里重新生成。",
        "nodes": [
          {
            "id": "problems-6-1",
            "stageId": "problems-6",
            "name": "建图",
            "trigger": "准备整理一个章节。",
            "question": "这一章有哪些核心知识？它们怎样联系？",
            "action": "画出章节知识框架，用线连接相关内容。",
            "standard": "图中能看出主要知识结构。",
            "shortQuestion": "整章有哪些知识？",
            "shortAction": "画章节框架。",
            "shortStandard": "结构清楚。"
          },
          {
            "id": "problems-6-2",
            "stageId": "problems-6",
            "name": "填路",
            "trigger": "已经画好章节框架。",
            "question": "每一部分知识在做题时该怎么用？",
            "action": "在知识旁加入核心题的处理思想，写「看到什么 → 想到什么 → 怎么做」。",
            "standard": "图 A 包含重要的处理路径。",
            "shortQuestion": "每部分知识怎么用？",
            "shortAction": "填入核心处理思想。",
            "shortStandard": "路径完整。"
          },
          {
            "id": "problems-6-3",
            "stageId": "problems-6",
            "name": "空忆",
            "trigger": "准备检验是否记住图 A。",
            "question": "不看资料，我还能恢复多少？",
            "action": "关闭原图，在空白纸上重新画整张图 A。",
            "standard": "完成独立复现尝试，暴露遗漏。",
            "shortQuestion": "关资料还能画吗？",
            "shortAction": "空白重画图 A。",
            "shortStandard": "独立复现一次。"
          },
          {
            "id": "problems-6-4",
            "stageId": "problems-6",
            "name": "查漏",
            "trigger": "完成空白复现。",
            "question": "原图里有什么，我没画出来？",
            "action": "对照原图，圈出遗漏、错误及缺少的联系。",
            "standard": "明确漏点。",
            "shortQuestion": "漏了什么？",
            "shortAction": "对照原图圈漏点。",
            "shortStandard": "找到缺漏。"
          },
          {
            "id": "problems-6-5",
            "stageId": "problems-6",
            "name": "析漏",
            "trigger": "已经发现漏点。",
            "question": "为什么我刚才想不起来？",
            "action": "检查是否没理解、知识连接不牢或缺少触发线索。",
            "standard": "能够提出有依据的原因。",
            "shortQuestion": "为什么没想起来？",
            "shortAction": "分析真实缺口。",
            "shortStandard": "明确待补点。"
          },
          {
            "id": "problems-6-6",
            "stageId": "problems-6",
            "name": "补题",
            "trigger": "已经明确缺口。",
            "question": "哪一道核心题能帮我补好它？",
            "action": "找到对应核心题，关答案重做；必要时定点补知识。",
            "standard": "能够独立完成对应训练题。",
            "shortQuestion": "哪道题能补漏？",
            "shortAction": "重做对应核心题。",
            "shortStandard": "补题正确。"
          },
          {
            "id": "problems-6-7",
            "stageId": "problems-6",
            "name": "再现",
            "trigger": "补完遗漏以后。",
            "question": "现在关掉资料，还能重新生成完整图 A 吗？",
            "action": "再次从空白画图；如果还有遗漏，继续查漏、析漏、补题。",
            "standard": "能够独立恢复主要结构、联系与处理思想。",
            "shortQuestion": "现在能完整复现吗？",
            "shortAction": "再从空白画图 A。",
            "shortStandard": "主要内容完整。"
          }
        ],
        "methods": [],
        "note": "图 A = 当前章节的知识导图 + 各部分核心题目的最核心处理思想。"
      },
      {
        "id": "problems-7",
        "title": "验收｜转化成高考分数",
        "memory": "混合题、计时做、按标准算分。",
        "nodes": [
          {
            "id": "problems-7-1",
            "stageId": "problems-7",
            "name": "混合",
            "trigger": "某类题已经能够单独完成。",
            "question": "混在其他题里，我还能认出适用方法吗？",
            "action": "选不同知识模块的题进行无提示混合练习。",
            "standard": "能够独立识别方法并正确解答。",
            "shortQuestion": "混着做还认得吗？",
            "shortAction": "无提示混合训练。",
            "shortStandard": "正确识别并解答。"
          },
          {
            "id": "problems-7-2",
            "stageId": "problems-7",
            "name": "限时",
            "trigger": "已经可以完成混合训练。",
            "question": "在规定时间内，我该怎样安排解题顺序和耗时？",
            "action": "设定时间，独立训练，按实际情况继续、跳过或换路。",
            "standard": "正确率与用时达到预设标准。",
            "shortQuestion": "时间怎么分配？",
            "shortAction": "计时独立完成。",
            "shortStandard": "时间和正确率达标。"
          },
          {
            "id": "problems-7-3",
            "stageId": "problems-7",
            "name": "得分",
            "trigger": "限时训练结束。",
            "question": "我实际拿了多少分？分丢在哪里？",
            "action": "按评分标准核分，标出主要失分题及原因。",
            "standard": "达到预定分数，或明确下一轮最需要补强的能力。",
            "shortQuestion": "分丢在哪里？",
            "shortAction": "核分、分析失分。",
            "shortStandard": "达标或确定补强重点。"
          }
        ],
        "methods": []
      }
    ]
  },
  "knowledge": {
    "title": "知识点 OUTPUT｜可操作版",
    "stages": [
      {
        "id": "knowledge-1",
        "title": "最低标准｜独立复述",
        "memory": "自己先讲，讲不清就补，再重新讲对。",
        "nodes": [
          {
            "id": "knowledge-1-1",
            "stageId": "knowledge-1",
            "name": "尝试讲解",
            "trigger": "刚学习完一个知识点。",
            "question": "不看老师，我能解释它是什么、为什么吗？",
            "action": "关掉讲解，假装自己是老师，出声讲一遍；可以录音转文字。",
            "standard": "完成一次独立讲解，暴露真实薄弱点。",
            "shortQuestion": "自己能讲吗？",
            "shortAction": "关资料讲一遍。",
            "shortStandard": "完成独立尝试。"
          },
          {
            "id": "knowledge-1-2",
            "stageId": "knowledge-1",
            "name": "暴露卡点",
            "trigger": "讲错、忘记或解释不清。",
            "question": "到底哪句话讲不对？",
            "action": "标出讲不清的地方，保留原讲解内容用于核对。",
            "standard": "明确具体问题。",
            "shortQuestion": "哪里讲不清？",
            "shortAction": "标出卡点。",
            "shortStandard": "定位问题。"
          },
          {
            "id": "knowledge-1-3",
            "stageId": "knowledge-1",
            "name": "AI 纠正",
            "trigger": "已经找到问题。",
            "question": "根据讲义，我哪里理解错了？",
            "action": "将自己的解释与讲义对应内容交给 AI，要求逐项指出错误、遗漏及原因，而不是直接代替讲解。",
            "standard": "知道需要纠正的具体内容。",
            "shortQuestion": "我错在哪里？",
            "shortAction": "AI 对照讲义纠错。",
            "shortStandard": "明确错误。"
          },
          {
            "id": "knowledge-1-4",
            "stageId": "knowledge-1",
            "name": "定点回看",
            "trigger": "错误或疑问仍未解决。",
            "question": "老师原来怎样解释这一点？",
            "action": "只回看老师讲解对应问题的视频片段。",
            "standard": "能够理解并解释刚才的具体疑问。",
            "shortQuestion": "老师怎么解释？",
            "shortAction": "回看对应片段。",
            "shortStandard": "理解卡点。"
          },
          {
            "id": "knowledge-1-5",
            "stageId": "knowledge-1",
            "name": "再讲",
            "trigger": "问题补完。",
            "question": "现在关掉提示，我还能准确讲清吗？",
            "action": "关闭资料，重新用自己的话解释整个知识点。",
            "standard": "内容准确，无关键遗漏。",
            "shortQuestion": "现在能讲对吗？",
            "shortAction": "关提示再讲。",
            "shortStandard": "讲对核心内容。"
          },
          {
            "id": "knowledge-1-6",
            "stageId": "knowledge-1",
            "name": "简记",
            "trigger": "已经能够独立讲对。",
            "question": "最值得记住的一句话是什么？",
            "action": "提炼一条心得，写入笔记，再尝试默写。",
            "standard": "能够不看提示恢复核心心得。",
            "shortQuestion": "最该记住什么？",
            "shortAction": "写一句，试着默写。",
            "shortStandard": "核心心得能复现。"
          }
        ],
        "methods": []
      },
      {
        "id": "knowledge-2",
        "title": "中标准｜独立生成",
        "memory": "把答案盖住，自己重新生成；哪里不会就补哪里。",
        "nodes": [],
        "methods": [
          {
            "id": "knowledge-2-a",
            "title": "A｜贴纸遮挡复现",
            "nodes": [
              {
                "id": "knowledge-2-a-1",
                "stageId": "knowledge-2",
                "name": "遮挡",
                "trigger": "讲义或笔记中有需要记住的核心内容。",
                "question": "哪些内容应该由我自己回忆？",
                "action": "使用自由笔记贴纸遮住关键内容，保留必要提示。",
                "standard": "核心答案被正确遮挡。",
                "shortQuestion": "遮什么？",
                "shortAction": "贴纸盖核心内容。",
                "shortStandard": "遮挡完成。"
              },
              {
                "id": "knowledge-2-a-2",
                "stageId": "knowledge-2",
                "name": "默写",
                "trigger": "核心答案已经遮好。",
                "question": "只看剩余提示，我能写出来吗？",
                "action": "打开白板，不揭答案，自己默写。",
                "standard": "独立写出能回忆的内容。",
                "shortQuestion": "能自己写吗？",
                "shortAction": "看提示默写。",
                "shortStandard": "完成独立默写。"
              },
              {
                "id": "knowledge-2-a-3",
                "stageId": "knowledge-2",
                "name": "核对",
                "trigger": "默写结束。",
                "question": "哪些地方没有写出来，或写错了？",
                "action": "揭开遮挡，对照讲义逐项标记错误与遗漏。",
                "standard": "找到具体漏点。",
                "shortQuestion": "错漏在哪？",
                "shortAction": "揭答案对照。",
                "shortStandard": "找到漏点。"
              },
              {
                "id": "knowledge-2-a-4",
                "stageId": "knowledge-2",
                "name": "补洞",
                "trigger": "发现错误和遗漏。",
                "question": "为什么这一点没写出来？",
                "action": "定点学习或提问，理解后再次遮住答案重新默写。",
                "standard": "能够独立写对之前缺失的内容。",
                "shortQuestion": "为什么没写出？",
                "shortAction": "定点补，再遮住默写。",
                "shortStandard": "漏点写对。"
              },
              {
                "id": "knowledge-2-a-5",
                "stageId": "knowledge-2",
                "name": "留痕",
                "trigger": "本次默写暴露了值得保留的经验。",
                "question": "以后怎样避免相同问题？",
                "action": "在原笔记下追加一两句问题、原因和改进经验。",
                "standard": "经验可用于未来复习；没有值得记录的可跳过。",
                "shortQuestion": "下次注意什么？",
                "shortAction": "有价值才简记。",
                "shortStandard": "经验可复用。"
              }
            ]
          },
          {
            "id": "knowledge-2-b",
            "title": "B｜知识拆成问题",
            "nodes": [
              {
                "id": "knowledge-2-b-1",
                "stageId": "knowledge-2",
                "name": "拆解",
                "trigger": "看到讲义中的一个核心知识点。",
                "question": "如果要检查别人是否理解，我会问他什么？",
                "action": "把核心知识改写为能够检验理解的问题，不只是挖空一个关键词。",
                "standard": "问题能够引导重新生成核心知识。",
                "shortQuestion": "怎样问才能考出理解？",
                "shortAction": "知识改成问题。",
                "shortStandard": "问题能检验核心知识。"
              },
              {
                "id": "knowledge-2-b-2",
                "stageId": "knowledge-2",
                "name": "生成",
                "trigger": "已经写好问题。",
                "question": "不看答案，我能自己回答吗？",
                "action": "遮住答案，只看问题，从空白写出解释；讲义原有填空也独立完成。",
                "standard": "完成一次独立回答。",
                "shortQuestion": "不看答案能回答吗？",
                "shortAction": "遮答案，写回答。",
                "shortStandard": "独立生成一次。"
              },
              {
                "id": "knowledge-2-b-3",
                "stageId": "knowledge-2",
                "name": "对标",
                "trigger": "已经完成回答。",
                "question": "和讲义相比，我漏了什么、错了什么？",
                "action": "打开老师讲义，逐项核对关键内容。",
                "standard": "找到具体差异。",
                "shortQuestion": "和讲义差在哪？",
                "shortAction": "打开讲义核对。",
                "shortStandard": "标出错误遗漏。"
              },
              {
                "id": "knowledge-2-b-4",
                "stageId": "knowledge-2",
                "name": "诊断",
                "trigger": "发现无法正确生成。",
                "question": "我是没有理解、忘了、没形成联系，还是表达不出来？",
                "action": "观察错误表现，判断最可能的原因，并明确需要补的内容。",
                "standard": "找到有依据的缺口。",
                "shortQuestion": "为什么生不出来？",
                "shortAction": "分析真实原因。",
                "shortStandard": "知道补什么。"
              },
              {
                "id": "knowledge-2-b-5",
                "stageId": "knowledge-2",
                "name": "补洞",
                "trigger": "已经确定缺口。",
                "question": "哪一段讲解最能解决它？",
                "action": "定点回看老师视频或向 AI 提问，只补这个缺口。",
                "standard": "能够正确解释刚才不会的部分。",
                "shortQuestion": "补哪一点？",
                "shortAction": "定点回看或提问。",
                "shortStandard": "补好缺口。"
              },
              {
                "id": "knowledge-2-b-6",
                "stageId": "knowledge-2",
                "name": "再生",
                "trigger": "已经补完。",
                "question": "再遮住答案，我能从零写对吗？",
                "action": "重新隐藏答案，只看问题，完整写出回答；还有缺漏就继续补洞。",
                "standard": "能够独立生成，没有关键遗漏。",
                "shortQuestion": "现在能自己生成吗？",
                "shortAction": "遮答案重新回答。",
                "shortStandard": "核心内容正确。"
              },
              {
                "id": "knowledge-2-b-7",
                "stageId": "knowledge-2",
                "name": "留痕",
                "trigger": "发现有价值的错误经验。",
                "question": "下次最需要注意什么？",
                "action": "在原笔记下留下简短错误原因和改进心得。",
                "standard": "经验可在以后使用；不要求每次填写。",
                "shortQuestion": "留下什么经验？",
                "shortAction": "简记错误与改进。",
                "shortStandard": "可复用即可。"
              }
            ]
          },
          {
            "id": "knowledge-2-c",
            "title": "C｜看知识出题",
            "nodes": [
              {
                "id": "knowledge-2-c-1",
                "stageId": "knowledge-2",
                "name": "看知识",
                "trigger": "准备围绕一个知识点设计题目。",
                "question": "这个知识是什么？有什么用？有哪些条件？",
                "action": "看着讲义或笔记，圈出关键规律和适用条件。",
                "standard": "明确知识核心及用途。",
                "shortQuestion": "知识核心是什么？",
                "shortAction": "圈规律和条件。",
                "shortStandard": "知道怎么用。"
              },
              {
                "id": "knowledge-2-c-2",
                "stageId": "knowledge-2",
                "name": "忆考法",
                "trigger": "已经明确知识用途。",
                "question": "以前考试题是怎样考它的？",
                "action": "回忆一道典型题，找出条件、设问、障碍和解题思想。",
                "standard": "能说出一种典型考法。",
                "shortQuestion": "以前怎么考？",
                "shortAction": "回忆典型题。",
                "shortStandard": "找到考法。"
              },
              {
                "id": "knowledge-2-c-3",
                "stageId": "knowledge-2",
                "name": "自己出题",
                "trigger": "已经想到典型考法。",
                "question": "如果我是出题人，我怎么考这个知识？",
                "action": "改变条件、情境或设问，编一道有明确考查目标的新题。",
                "standard": "题目不是照抄，且有合理的考查目的。",
                "shortQuestion": "我会怎么出题？",
                "shortAction": "改条件，编新题。",
                "shortStandard": "题目有意义。"
              },
              {
                "id": "knowledge-2-c-4",
                "stageId": "knowledge-2",
                "name": "解题核对",
                "trigger": "已经编好新题。",
                "question": "题目合理吗？我能正确解出来吗？",
                "action": "自己解答，检查条件是否充分、答案是否正确；有问题就修改后重做。",
                "standard": "新题合理可解，并能说明考查的知识和能力。",
                "shortQuestion": "题能解吗？考什么？",
                "shortAction": "自己解答并修正。",
                "shortStandard": "题目合理且解答正确。"
              },
              {
                "id": "knowledge-2-c-5",
                "stageId": "knowledge-2",
                "name": "留痕",
                "trigger": "出题过程中发现值得保存的经验。",
                "question": "这次出题让我弄懂了什么？",
                "action": "在原笔记下写一句以后可迁移的心得。",
                "standard": "有价值的经验被保存；没有则跳过。",
                "shortQuestion": "学到什么？",
                "shortAction": "有价值才留一句。",
                "shortStandard": "能用于下一次。"
              }
            ]
          }
        ],
        "note": "三种训练入口 A、B、C 是可选方式，不强制全部完成。"
      },
      {
        "id": "knowledge-3",
        "title": "最终高标准｜熟练调用",
        "memory": "自己继续追问，隔一段时间还能快速准确地想起来并用出去。",
        "nodes": [
          {
            "id": "knowledge-3-1",
            "stageId": "knowledge-3",
            "name": "自主深问",
            "trigger": "已经能独立复述或生成核心知识。",
            "question": "它为什么这样？和什么有关？什么时候不能用？",
            "action": "按照已有深度提问模板，提出一个原理、联系、边界或应用问题。",
            "standard": "形成一个值得解决的深入问题。",
            "shortQuestion": "还有哪个为什么？",
            "shortAction": "提一个深入问题。",
            "shortStandard": "问题明确。"
          },
          {
            "id": "knowledge-3-2",
            "stageId": "knowledge-3",
            "name": "先答后问",
            "trigger": "准备问 AI。",
            "question": "如果不问 AI，我自己会怎么回答？",
            "action": "先独立回答，再把答案提交给 AI 核对。",
            "standard": "已先进行真实独立思考。",
            "shortQuestion": "我先怎么回答？",
            "shortAction": "先答，再问 AI。",
            "shortStandard": "有自己的思考。"
          },
          {
            "id": "knowledge-3-3",
            "stageId": "knowledge-3",
            "name": "对标高手",
            "trigger": "获得老师或 AI 的解释。",
            "question": "高手比我多看到了什么？",
            "action": "比较自己的解释，圈出关键遗漏和理解差异。",
            "standard": "明确主要差距。",
            "shortQuestion": "高手多想到什么？",
            "shortAction": "比较两种解释。",
            "shortStandard": "找到差距。"
          },
          {
            "id": "knowledge-3-4",
            "stageId": "knowledge-3",
            "name": "修正理解",
            "trigger": "已经发现差异。",
            "question": "我究竟需要纠正哪一点？",
            "action": "定点补充原理、条件或联系，再独立解释。",
            "standard": "原来的问题能够正确说明。",
            "shortQuestion": "要修正什么？",
            "shortAction": "定点补，再解释。",
            "shortStandard": "讲对漏点。"
          },
          {
            "id": "knowledge-3-5",
            "stageId": "knowledge-3",
            "name": "独立复现",
            "trigger": "深入问题已经弄懂。",
            "question": "关掉资料，我还能写出关键答案吗？",
            "action": "关闭答案，默写关键解释；有必要时记入进步本。",
            "standard": "能够独立生成主要答案。",
            "shortQuestion": "关资料还会吗？",
            "shortAction": "空白默写。",
            "shortStandard": "关键内容正确。"
          },
          {
            "id": "knowledge-3-6",
            "stageId": "knowledge-3",
            "name": "熟练调用",
            "trigger": "隔一段时间再次学习或使用该知识。",
            "question": "我能快速、准确地想起来并用到新问题吗？",
            "action": "无提示地解释、默写，或在新题中使用；检查正确率和用时。",
            "standard": "达到当前预设的准确性、速度与应用标准。",
            "shortQuestion": "现在能快速用吗？",
            "shortAction": "隔时无提示调用。",
            "shortStandard": "又快又准地应用。"
          }
        ],
        "methods": []
      }
    ]
  }
};
})();
