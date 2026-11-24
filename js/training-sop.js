(function () {
  'use strict';
  const pocketLocalStore = globalThis.PocketEnvironment.requireStorage();
  // SOP navigation restores the DOM; breakthrough explicitly starts a new material.
  const get = id => document.getElementById(id);
  const pocket = get('pocket-main');
  const practice = get('practice-tool');
  const entry = get('practice-readiness-button');
  const tool = document.createElement('main');
  tool.id = 'training-sop'; tool.className = 'practice-tool'; tool.hidden = true;
  document.body.append(tool);
  const key = 'pocket-training-sop-model-v1';
  const fields = ['status', 'purpose', 'parent', 'child', 'materials'];
  const recallTemplate = `下面是我的学习笔记，请根据笔记内容：
不要一下子全都回答，而是先回答第1个问题，我反馈，然后慢慢往下面方向带

1. 理解： 请用通俗易懂的口语化语言教会我真正理解这些知识，思考产生这个知识是为了解决什么问题
如果我是小孩我会怎么思考容易理解？
如果我是专业的人呢？
我如何用一句话口语化总结心得

2. 记忆： 请教我如何理解性地记住这些知识，并且能够独立回忆。
我如何用一句话口语化总结心得

3、地图：如果我在脑海中回忆笔记内容，回忆的地图是什么样的？

3. 考试： 如果你是出题人，你会怎样考查这些知识？
4. 检测： 请根据笔记内容出一套测试卷，检测我是否真正掌握。
5.运用：我如何运用这些知识在该领域进行创新型思考和实践应用。
严格要求： 试卷题目、答案和解析都必须以我提供的笔记为依据。请先认真学习和理解笔记，再根据笔记内容出题和解答，不要随意编造或超出笔记范围。

试卷分为两种形式：

- 形式一｜互动检测： 你现场出题，我现场选择或回答。每次回答后，你判断正误、讲解原因，帮助我边做题边理解学习。
- 形式二｜整理复习： 形式一全部答完后，把形式一中出现过的题目和答案解析整理成两个独立区域：前面统一为「题目区」，末端统一为「答案解析区」。方便我直接复制到笔记后面，以后遮住答案复习重做。`;
  const labels = ['当前状态', '目的', '母链', '子链', '已有资料'];
  const template = "请根据我的「达标—能力链模型」为当前学习目的构建训练模型。\r\n\r\n【我的输入】\r\n\r\n① 当前状态：\r\n{当前状态}\r\n\r\n② 目的：\r\n{目的}\r\n\r\n③ 母链：\r\n{母链}\r\n\r\n④ 子链：\r\n{子链}\r\n\r\n⑤ 已有资料：\r\n{已有资料}\r\n\r\n\r\n【请严格按照以下逻辑分析】\r\n\r\n一、达标准\r\n\r\n进入一个学习目标以后，先说明：\r\n① 当前状态\r\n② 目的\r\n③ 已有资料\r\n\r\n然后确定：最终达标标准是什么？\r\n\r\n核心问题：\r\n如果我真的练成了，我应该能够独立做到什么？\r\n\r\n例如：\r\n知识点 → 脱离资料能熟练默写、口语化讲明白。\r\n题目 → 能在合理时间内独立、稳定、正确完成。\r\n\r\n\r\n二、能力链\r\n\r\n确定达标标准以后，再问：\r\n\r\n我要达到这个标准，\r\n背后需要哪些能力连续工作？\r\n\r\n母链：\r\n根据学习一个陌生学科时，\r\n从该学科对应的所有课程内容中，\r\n提纯出一条学科能力链。\r\n\r\n子链：\r\n针对该学科中具体的一门课程，\r\n提纯出当前课程能力链，\r\n并允许根据真实训练动态自适应修改。\r\n\r\n能力 A → 能力 B → 能力 C → …… → 最终表现\r\n\r\n每个能力节点说明：\r\n\r\n① 它解决现实中的什么问题？\r\n② 它锻炼什么核心能力？\r\n③ 它弱的时候，我实际会出现什么表现？\r\n\r\n\r\n三、最小补强操作\r\n\r\n结合：\r\n\r\n当前状态 + 已有资料 + 实际训练方式\r\n\r\n确定某个节点弱时：\r\n\r\n最小增加什么训练动作，\r\n就能直接训练这个能力？\r\n\r\n执行：\r\n\r\n找到断点\r\n→ 最小干预\r\n→ 马上重新输出验证。\r\n\r\n\r\n【最终输出格式】\r\n\r\n1. 当前目的\r\n2. 最终达标标准\r\n3. 母能力链\r\n4. 当前子能力链\r\n\r\n5. 各节点：\r\n- 解决什么现实问题\r\n- 锻炼什么能力\r\n- 弱时有什么表现\r\n- 利用现有资料的最小补强操作\r\n\r\n6. 当前最值得优先关注的能力节点\r\n\r\n7. 实际训练时如何使用这套模型\r\n\r\n\r\n要求：\r\n\r\n- 模型必须服务于实际学习\r\n- 不要为了理论完整增加不必要节点\r\n- 能力链允许以后根据真实训练动态修改\r\n- 输出尽量口语化、清晰、可直接执行";
  let scroll = 0, generated = '', view = 'overview';
  tool.innerHTML = `
    <button id="training-back" class="practice-back" type="button">← 返回 Pocket</button>
    <section id="training-overview" aria-labelledby="training-overview-title">
      <header class="training-overview-header">
        <p class="training-overview-eyebrow">COGNIVEX · CORE MECHANISM</p>
        <h1 id="training-overview-title" tabindex="-1">核心运行机制</h1>
        <p class="training-overview-subtitle">定义能力目标 · 执行 OUTPUT · 检测反馈 · 持续补强</p>
      </header>
      <section class="training-system-explanation" aria-labelledby="training-system-title">
        <p><strong>核心目标：通过针对性训练与持续检测，将知识和方法转化为长期稳定、能够独立迁移的实际能力。</strong></p>
        <section class="training-system-part">
          <h2 id="training-system-title">一、能力链模型｜明确练什么</h2>
          <p>根据不同学科、领域的最终目标，拆解需要掌握的知识、思维方法和具体能力。</p>
          <p>明确：</p>
          <ul>
            <li><strong>目标能力：</strong> 最终需要独立完成什么？</li>
            <li><strong>达标标准：</strong> 达到什么水平才算掌握？</li>
            <li><strong>当前表现：</strong> 已经具备哪些能力，哪些仍然薄弱？</li>
            <li><strong>能力断点：</strong> 是知识、理解、方法选择、执行、熟练度还是迁移存在问题？</li>
          </ul>
          <p><strong>核心作用：明确练什么、为什么练、练到什么程度。</strong></p>
        </section>
        <section class="training-system-part">
          <h2>二、OUTPUT｜明确怎么练</h2>
          <p>OUTPUT 是 Cognivex 的完整训练执行体系。</p>
          <p>通过视频学习、分组循环、构建解题体系和实战操作，实现从模仿学习到独立解决陌生问题的能力发展。</p>
          <h3>① 视频三阶段｜学会</h3>
          <p>通过连续看课、视频分段看和逐题突破，反复尝试、琢磨老师的思路、对标理解、独立重做。</p>
          <p><strong>目标：从不会做，到能够不看答案独立做对原题，并解释关键思路。</strong></p>
          <h3>② 分组循环训练｜巩固与深化</h3>
          <p>将视频阶段已经学会的题目纳入分组循环，通过反复独立重做、间隔复习和今日复习，减少遗忘，提高熟练度。</p>
          <p>在训练过程中，结合训练内化和逐题突破，继续研究已学题目，发现理解断点并针对性补强。</p>
          <p><strong>目标：从刚刚会做，到长期记得、熟练做对、深入理解。</strong></p>
          <h3>③ 构建解题体系｜提炼与贯通</h3>
          <p>从已学知识和题目中提炼：</p>
          <ul>
            <li>题目结构与识别特征</li>
            <li>解题突破口</li>
            <li>方法选择依据</li>
            <li>最优解题路径</li>
            <li>方法适用条件与局限</li>
            <li>不同题目之间的联系与迁移规律</li>
          </ul>
          <p>通过主动回忆、总结、对标和变式训练，将零散的解题经验组织成能够独立调用的体系。</p>
          <p><strong>目标：从会做一道题，到理解一类题的解题规律。</strong></p>
          <h3>④ 实战操作｜独立迁移</h3>
          <p>面对陌生题、综合题和真实任务，独立完成：</p>
          <p>观察结构 → 寻找突破口 → 选择方法 → 执行验证 → 监控修正。</p>
          <p>通过限时训练和实际任务检验解题能力。</p>
          <p><strong>目标：面对没见过的问题，也能够快速、准确地找到正确路径并独立解决。</strong></p>
        </section>
        <section class="training-system-part">
          <h2>三、检测反馈｜判断是否达标</h2>
          <p>通过 OUTPUT 各环节中的实际表现和专项检测，判断当前能力是否达到能力链模型规定的标准。</p>
          <p>发现断点后，选择对应的 OUTPUT 操作：</p>
          <ul>
            <li>原题不会 → 视频学习、逐题突破。</li>
            <li>原题容易忘或不熟练 → 分组循环、今日复习。</li>
            <li>理解不深入 → 训练内化、对标复盘。</li>
            <li>方法不会提炼 → 构建解题体系。</li>
            <li>陌生题不会迁移 → 实战分析、变式训练、针对性补强。</li>
          </ul>
          <p>补强后重新检测，直至达到相应能力标准。</p>
        </section>
        <section class="training-system-principle" aria-labelledby="training-system-principle-title">
          <h2 id="training-system-principle-title">四、核心原则｜通用 OUTPUT × 领域专项能力</h2>
          <h3>能力链模型：领域专项适配</h3>
          <p>根据不同学科和领域，定义需要训练的具体能力、薄弱表现和达标标准。</p>
          <p>解决：</p>
          <p><strong>练什么？练到什么程度？</strong></p>
          <h3>OUTPUT：通用训练框架</h3>
          <p>提供从学习、模仿、独立重做、循环巩固、深入理解、构建体系到实战迁移的完整训练方法。</p>
          <p>根据领域特点与当前能力断点，选择和调整具体操作，不要求所有领域机械执行相同流程。</p>
          <p>解决：</p>
          <p><strong>怎么练？</strong></p>
          <h3>检测反馈：闭环优化</h3>
          <p>通过实际表现检验能力，定位断点，针对性补强，并重新检测。</p>
          <p>解决：</p>
          <p><strong>练得怎么样？下一步应该补什么？</strong></p>
        </section>
        <hr>
        <section class="training-system-part training-system-loop">
          <h2>Cognivex 核心训练闭环</h2>
          <p><strong>能力链模型：明确目标与达标标准</strong></p>
          <p>↓</p>
          <p><strong>OUTPUT：视频三阶段 → 分组循环 → 构建解题体系 → 实战操作</strong></p>
          <p>↓</p>
          <p><strong>实际检测：判断是否达标</strong></p>
          <p>↓</p>
          <p><strong>定位断点 → 选择对应 OUTPUT 操作 → 针对性补强</strong></p>
          <p>↓</p>
          <p><strong>再次检测，直到达标</strong></p>
        </section>
        <section class="training-system-part">
          <h2>最终目标</h2>
          <p>从模仿老师到独立做对，从重复练习到长期熟练，从深入理解到构建解题体系，最终能够面对陌生问题，独立识别结构、寻找突破口、选择正确方法并快速准确地解决。</p>
          <p><strong>核心公式：</strong></p>
          <p><strong>能力链模型（练什么、练到什么程度） × OUTPUT（怎么练） × 检测反馈（是否达标）＝持续发展的独立解决问题能力。</strong></p>
        </section>
      </section>
      <section class="practice-condition"><span class="practice-number">01</span><h2>构建学科能力链模型</h2><p>给后续刷题和检测建立能力锚点</p><button id="training-build" type="button">开始构建 →</button></section>
      <section class="practice-condition training-output-entry">
        <span class="practice-number">02</span><h2>OUTPUT｜训练执行体系</h2><p>从模仿学习到独立解决陌生问题</p>
        <div class="training-output-stage"><h3>01 视频三阶段</h3><p>模仿、琢磨、独立重做 → 学会</p></div>
        <div class="training-output-stage"><h3>02 分组循环</h3><p>循环巩固、训练内化 → 熟练与深化</p></div>
        <div class="training-output-stage"><h3>03 构建解题体系</h3><p>提炼规律、贯通方法 → 迁移</p></div>
        <div class="training-output-stage"><h3>04 实战操作</h3><p>陌生题独立解题 → 检验能力</p></div>
        <button id="training-output-guide-entry" type="button">查看 OUTPUT 执行说明 →</button>
      </section>
    </section>
    <section id="training-output-guide" aria-labelledby="training-output-guide-title" hidden>
      <h1 id="training-output-guide-title" tabindex="-1">OUTPUT｜训练执行体系</h1>
    </section>
    <section id="training-external-information" aria-labelledby="training-external-information-title" hidden>
      <h1 id="training-external-information-title" tabindex="-1">外部信息补强机制</h1>
      <div class="external-information-goal"><strong>核心目标：</strong> 当自己和 AI 都无法解决问题时，主动寻找外部资料，辅助理解，继续推进学习。</div>
      <h2>一、执行流程</h2>
      <ol class="external-information-steps">
        <li><strong>明确问题：</strong> 找出自己不理解的知识或解题步骤。</li>
        <li><strong>提问 AI：</strong> 先让 AI 尝试解释和解决。</li>
        <li><strong>外部检索：</strong> AI 无法解决时，通过小红书、微信公众号、搜索引擎等渠道寻找相关资料。</li>
        <li><strong>AI 辅助理解：</strong> 将找到的资料提供给 AI，让 AI 帮助分析、解释，并核对正确性。</li>
        <li><strong>一句话总结：</strong> 自己暂时理解关键道理后，用一句话记录学习心得。</li>
        <li><strong>继续学习：</strong> 停止搜索，返回原来的学习任务。</li>
      </ol>
      <section class="external-information-stop"><h2>二、停止深入原则</h2><p>暂时理解关键道理后，用一句话总结心得，停止搜索，继续学习；后续逐步深化，遇到反复卡点再补强。</p></section>
      <h2>三、核心原则</h2>
      <ul>
        <li>不依赖单一老师、资料或 AI。</li>
        <li>AI 无法解决，不代表问题无法解决。</li>
        <li>外部资料和 AI 的解释都需要判断、核对。</li>
        <li>不追求一次性彻底理解，允许随着后续学习逐步深化。</li>
        <li>如果问题反复出现或阻碍后续学习，再针对性深入研究。</li>
      </ul>
      <section class="external-information-concept"><h2>四、核心理念</h2><p><strong>遇到问题不停止，理解到位不过度深入，通过持续学习逐步深化认知。</strong></p></section>
    </section>
    <section id="training-active-recall" aria-labelledby="training-active-recall-title" hidden>
      <h1 id="training-active-recall-title" tabindex="-1">主动回忆—内化机制</h1>
      <p class="recall-intro"><strong>把学过的内容转化成问题，通过主动回忆和独立输出，真正消化理解。</strong></p>
      <p class="recall-scope"><strong>适用场景：</strong>任何一个新旧知识点的内化理解，取代画线、抄写等表面动作。</p>
      <div class="recall-steps">
        <section><h2>① 笔记转问题</h2><p>把课堂笔记、教材内容或题目总结发给 AI。</p><p>让 AI 根据笔记内容提出关键理解问题，前面是题目区不显示答案，末端是统一的答案区。</p><p><strong>目的：把被动阅读变成主动提取知识。</strong></p></section>
        <section><h2>② 先口述回忆</h2><p>不看笔记和答案。</p><p>回忆老师是怎么讲的，自己先口述回答，并说明为什么。</p><p>遇到不会的地方，先尝试独立回忆，不要立即查看答案。</p></section>
        <section><h2>③ 再独立手写</h2><p>对于重要问题，把答案独立写出来。</p><p>尤其是：</p><ul><li>数学推导</li><li>解题过程</li><li>重要概念的逻辑关系</li><li>需要准确表达的知识</li></ul><p>简单概念可以主要口述，不要求所有问题都手写。</p></section>
        <section><h2>④ 核对答案，定位断点</h2><p>对照老师的笔记、讲解或可靠答案。</p><p>判断：</p><ul><li>哪里没有回忆出来？</li><li>哪里理解错误？</li><li>哪一步无法独立解释？</li></ul><p>有问题就回到老师对应的讲解，重新理解。</p></section>
        <section><h2>⑤ 再次复现</h2><p>遮住答案，重新口述或手写。</p><p>直到能够独立、正确地解释关键内容。</p><p>后续复习时再次检测，判断是否真正记住。</p></section>
      </div>
      <section class="recall-standard"><h2>达标标准</h2><p><strong>不看笔记和答案，能够独立回答关键问题，讲清楚理由，并在需要时写出完整的关键过程。</strong></p><p>如果不能做到：</p><p>返回对应知识或讲解 → 补强理解 → 再次回答。</p><p>注意：一次答对不等于永久掌握，后续仍需进入到分组训练时进行复习检测。</p></section>
      <section class="recall-template"><h2>AI 提问模板</h2><button id="active-recall-template-entry" type="button">查看 AI 提问模板</button></section>
    </section>
    <section id="training-recall-template" aria-labelledby="training-recall-template-title" hidden>
      <h1 id="training-recall-template-title" tabindex="-1">AI 提问模板</h1>
      <textarea id="active-recall-template" rows="18" readonly aria-label="AI 提问模板"></textarea><button id="active-recall-copy" type="button">复制模板</button><p id="active-recall-copy-status" role="status"></p>
    </section>
    <section id="training-model" aria-labelledby="training-model-title" hidden>
      <span class="practice-number">01</span><h1 id="training-model-title" tabindex="-1">构建学科能力链模型</h1>
      <p class="practice-intro">讲义吃透后，为后续大量刷题和检测建立能力锚点。</p>
      <form id="training-form">${fields.map((field,i) => `<label for="training-${field}">${labels[i]}</label><textarea id="training-${field}" rows="4"></textarea>`).join('')}
        <p id="training-save-status" role="status" class="practice-intro"></p><button type="submit">生成能力链模型 →</button>
      </form>
    </section>
    <section id="training-prompt" aria-labelledby="training-prompt-title" hidden>
      <h1 id="training-prompt-title" tabindex="-1">能力链 Prompt 已生成</h1>
      <p class="practice-intro">进入 ChatGPT 后，自己点击输入框，粘贴后发送。</p>
      <button id="training-copy-open" type="button">复制并打开 ChatGPT</button>
      <button id="training-copy" class="practice-secondary" type="button">复制提示词</button>
      <p id="training-copy-status" role="status" class="practice-intro"></p>
      <a id="training-chatgpt-link" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer" hidden>打开 ChatGPT ↗</a>
      <button id="training-copy-again" class="practice-secondary" type="button">再次复制</button>
      <button id="training-edit" class="practice-back" type="button">返回修改</button>
      <details class="training-preview"><summary>查看完整提示词 / 手动复制</summary><textarea id="training-prompt-text" rows="14" readonly aria-label="完整能力链提示词"></textarea></details>
    </section>
    <section id="training-detection" aria-labelledby="training-detection-title" hidden>
      <span class="practice-number">03</span><h1 id="training-detection-title" tabindex="-1">模拟检测</h1><p class="practice-intro">目标：检验能力能不能真正转化成考试得分。</p>
      <section class="practice-condition"><span class="practice-number">01</span><h2>全真限时模拟</h2><p>按高考规定时间和真实答题环境，独立完成第一次见到的试卷。</p></section>
      <section class="practice-condition"><span class="practice-number">02</span><h2>考场思维复盘</h2><p>写小作文，还原：<br>当时怎么想？<br>哪里卡住？<br>为什么换路？<br>为什么没有换路？</p></section>
      <section class="practice-condition"><span class="practice-number">03</span><h2>能力链找断点</h2><p>把题目 + 作答 + 思维复盘交给 AI，对照「达标—能力链模型」，寻找最先出现的能力断点。</p><p class="practice-definition">必要时继续校准能力链模型，确定最小补强操作。</p></section>
      <section class="practice-condition"><span class="practice-number">04</span><h2>专题突破</h2><p>根据暴露出的断点，返回分组阶段，进行针对性训练。</p><p class="practice-definition">重点使用对应能力断点的最小补强操作。补强后重新进入模拟检测。</p></section>
      <section class="training-goal"><h2>最终看 3 件事</h2><p>01 · 会做的题<br>能不能又快又准？</p><p>02 · 第一次见到的题<br>能不能在高考规定时间和环境下稳定拿分？</p><p>03 · 达标—能力链模型<br>能不能越来越准确地定位断点，并指导下一步训练？</p></section>
      <p class="training-cycle">检测<br>↓<br>找断点<br>↓<br>专题突破<br>↓<br>再检测</p><button id="training-breakthrough" type="button">返回分组阶段 → 专题突破</button><button id="training-detection-overview" class="practice-back" type="button">← 返回学习训练总纲</button>
    </section>`;
  get('active-recall-template').value=recallTemplate;
  const outputGuideBody=document.createElement('div');outputGuideBody.className='training-system-explanation';
  const outputExplanation=Array.from(get('training-overview').querySelectorAll('.training-system-part')).find(section=>section.querySelector('h2')?.textContent==='二、OUTPUT｜明确怎么练').cloneNode(true);
  outputExplanation.querySelector('h2').remove();
  outputExplanation.querySelectorAll('p')[1].textContent='通过视频三阶段、分组循环、构建解题体系和实战操作，实现从模仿学习到独立解决陌生问题的能力发展。';
  const outputLoop=get('training-overview').querySelector('.training-system-loop').cloneNode(true);outputLoop.querySelector('h2').textContent='训练闭环';
  outputGuideBody.append(outputExplanation,outputLoop);get('training-output-guide').append(outputGuideBody);
  const overviewBody=get('training-overview').querySelector('.training-system-explanation');
  const overviewParts=Array.from(overviewBody.children).filter(node=>node.matches('section'));
  function overviewFold(nodes,title,description) {
    const fold=document.createElement('details');fold.className='training-overview-fold';
    const summary=document.createElement('summary');
    const heading=document.createElement('span');heading.className='training-overview-label';
    const number=document.createElement('span');number.className='training-overview-number';number.textContent=title.slice(0,2);
    const label=document.createElement('span');label.textContent=title.slice(3);heading.append(number,label);summary.append(heading);
    if(description){const caption=document.createElement('span');caption.className='training-overview-caption';caption.textContent=description;summary.append(caption);}
    const body=document.createElement('div');body.className='training-overview-content';body.append(...nodes);
    fold.append(summary,body);return fold;
  }
  [[0,'01 能力链模型','明确目标能力、达标标准、当前表现与能力断点。'],
    [2,'03 检测反馈','实际检测 → 定位断点 → 针对性补强 → 再次检测'],
    [3,'04 核心原则','通用 OUTPUT × 领域专项能力']].forEach(([index,title,description])=>{
      const section=overviewParts[index];section.replaceWith(overviewFold(Array.from(section.children),title,description));
    });
  const outputSection=overviewParts[1];
  outputSection.querySelector('h2').remove();
  const phaseHeadings=Array.from(outputSection.querySelectorAll('h3'));
  phaseHeadings.forEach((heading,index)=>{
    const nodes=[heading];let next=heading.nextElementSibling;
    while(next&&next.tagName!=='H3'){nodes.push(next);next=next.nextElementSibling;}
    const anchor=document.createElement('span');heading.before(anchor);
    const goal=nodes.pop();
    const fold=overviewFold(nodes,['01 视频三阶段','02 分组循环训练','03 构建解题体系','04 实战操作'][index]);
    fold.classList.add('training-overview-phase');goal.classList.add('training-overview-goal');fold.querySelector('summary').append(goal);
    anchor.replaceWith(fold);
  });
  const outputFold=overviewFold(Array.from(outputSection.children),'02 OUTPUT','从模仿学习到独立解决陌生问题');
  outputFold.classList.add('training-overview-output');outputFold.open=true;outputSection.replaceWith(outputFold);
  overviewBody.querySelectorAll('.training-system-loop > p').forEach(node=>{
    node.classList.add(node.textContent==='↓'?'training-loop-arrow':'training-loop-node');
  });
  function show(name) {
    if (!['overview','model','prompt','detection','output-guide','external-information','active-recall','recall-template'].includes(name)) return false;
    if (name === 'prompt') {
      const draft = values();
      generated = template.replace(/\{(当前状态|目的|母链|子链|已有资料)\}/g,(_,label) => draft[fields[labels.indexOf(label)]]);
      get('training-prompt-text').value = generated;
    }
    view = name; pocket.hidden = true; practice.hidden = true; tool.hidden = false;
    ['overview','model','prompt','detection','output-guide','external-information','active-recall','recall-template'].forEach(v => { get('training-'+v).hidden = v !== name; });
    get('training-back').textContent = name==='recall-template'?'← 返回':['overview','external-information','active-recall'].includes(name) ? '← 返回 Pocket' : '← 总纲';
    window.scrollTo(0,0); get('training-'+name+'-title').focus({preventScroll:true});
    window.PocketNavigation?.remember({page:'training',view:name});
  }
  function returnToPocket() {
    tool.hidden = true; practice.hidden = true; pocket.hidden = false;
    entry.focus({preventScroll:true}); window.scrollTo(0,scroll);
    window.PocketNavigation?.remember(window.PocketNavigation.pocket());
  }
  const values = () => Object.fromEntries(fields.map(f => [f,get('training-'+f).value]));
  function save() {
    try { globalThis.PocketCloudSignal?.ensureReady(); pocketLocalStore.setItem(key,JSON.stringify(values())); globalThis.PocketCloudSignal?.saved(key); get('training-save-status').textContent = '已保存到本机'; }
    catch (_) { get('training-save-status').textContent = '本机保存失败；当前输入仍保留，请在离开或刷新前复制备份。'; }
  }
  try {
    const draft = JSON.parse(pocketLocalStore.getItem(key) || '{}');
    fields.forEach(f => { if (draft && typeof draft[f] === 'string') get('training-'+f).value = draft[f]; });
  } catch (_) { get('training-save-status').textContent = '无法读取本机草稿，请自行填写。'; }
  fields.forEach(f => get('training-'+f).addEventListener('input',save));
  globalThis.addEventListener?.('pocket-local-test-cleared', () => {
    globalThis.PocketLocalTestTools.assertAllowed();
    fields.forEach(f => { get('training-'+f).value = ''; });
    get('training-save-status').textContent = '';
  });
  entry.addEventListener('click',() => { scroll = window.scrollY; show('overview'); });
  get('external-information-entry').addEventListener('click',()=>{window.PocketNavigation.checkpoint();show('external-information');});
  get('active-recall-entry').addEventListener('click',()=>{window.PocketNavigation.checkpoint();show('active-recall');});
  get('active-recall-template-entry').addEventListener('click',()=>window.PocketNavigation.navigate({page:'training',view:'recall-template'}));
  get('active-recall-copy').addEventListener('click',async()=>{
    const control=get('active-recall-copy');control.disabled=true;
    try {await navigator.clipboard.writeText(recallTemplate);get('active-recall-copy-status').textContent='已复制模板';}
    catch (_) {get('active-recall-template').focus();get('active-recall-template').select();get('active-recall-copy-status').textContent='复制失败，请手动复制上方模板。';}
    finally {control.disabled=false;}
  });
  get('training-back').addEventListener('click',() => {
    if (window.PocketNavigation) window.PocketNavigation.back();
    else if (view === 'overview') returnToPocket(); else show('overview');
  });
  get('training-build').addEventListener('click',() => show('model'));
  get('training-practice')?.addEventListener('click',() => window.PocketPracticeReadiness.show('check'));
  get('training-simulation')?.addEventListener('click',() => show('detection'));
  get('training-output-guide-entry').addEventListener('click',()=>{window.PocketNavigation?.checkpoint();show('output-guide');});
  get('training-breakthrough').addEventListener('click',() => {
    if (!window.PocketLearning.startNewMaterial()) return;
    returnToPocket();
    get('subject').focus({preventScroll:true});
    window.scrollTo(0,0);
  });
  get('training-detection-overview').addEventListener('click',() => show('overview'));
  get('training-edit').addEventListener('click',() => show('model'));
  get('training-form').addEventListener('submit',event => {
    event.preventDefault(); save(); const draft = values();
    // Replace once: placeholder-like user input remains literal text.
    generated = template.replace(/\{(当前状态|目的|母链|子链|已有资料)\}/g,(_,label) => draft[fields[labels.indexOf(label)]]);
    get('training-prompt-text').value = generated; get('training-copy-status').textContent = '';
    get('training-chatgpt-link').hidden = true; show('prompt');
  });
  async function copy(open) {
    const buttons = ['training-copy-open','training-copy','training-copy-again'].map(get);
    buttons.forEach(b => { b.disabled = true; });
    try {
      await navigator.clipboard.writeText(generated);
      get('training-copy-status').textContent = '已复制。请打开 ChatGPT，粘贴后发送。';
      get('training-chatgpt-link').hidden = false;
      if (open) { try { const tab = window.open('https://chatgpt.com/','_blank'); if (tab) tab.opener = null; } catch (_) {} }
    } catch (_) { get('training-copy-status').textContent = '复制失败。请重试，或展开完整提示词后手动复制。'; }
    finally { buttons.forEach(b => { b.disabled = false; }); }
  }
  get('training-copy-open').addEventListener('click',() => copy(true));
  get('training-copy').addEventListener('click',() => copy(false));
  get('training-copy-again').addEventListener('click',() => copy(false));
  window.PocketTrainingSOP = {show,returnToPocket};
  window.PocketNavigation?.register('training',saved => show(saved.view));
})();
