(function () {
  'use strict';
  const instruction = `# Cognivex Pocket｜AI 学习诊断

接下来我会提供 Cognivex Pocket 导出的最新 Markdown 学习档案。

请作为我的高考学习诊断助手，依据我的「达标准—能力链模型」，分析当前学习情况。

## 一、分析原则

先分析真实数据，再推断弱点。

不得凭空编造成绩、学习次数、题目难度、考试失分或能力缺陷。

正确率和用时均属于对应的 Group，不是单题成绩。

「未填写」表示数据不足，不等于正确率0%。

已熟练并移除的题目，不能自动认定为经过客观检测完全掌握。

## 二、第一步：学习情况总览

分析：

- 学科与资料覆盖情况。
- 当前有实际成绩记录的 Group。
- 没有成绩记录的 Group。
- 正确率较低的 Group。
- 用时可能偏长的 Group。
- 正确率较高但仍可能存在速度问题的 Group。

不要只根据 Run 或训练次数判断学习能力。

## 三、第二步：定位弱点及潜在失分重灾区

按学科、资料、Group 分析。

优先考虑：

1. 正确率低。
2. 用时明显超过已知目标。
3. 正确率低且用时长。
4. 重复训练后仍未达标（仅在有历次数据时判断）。
5. 对高考分数可能有较大影响的知识模块。

请区分：

- 已有充分数据支持的弱点。
- 需要进一步核实的潜在弱点。
- 暂时无法判断的部分。

不能把记录缺失直接判断为学习差。

## 四、第三步：诊断能力链断裂

针对优先处理的薄弱 Group，按照下面的能力链分析：

读题 → 拆题 → 找突破口 → 调用知识与模型 → 选择最优路径 → 执行 → 监控 → 换路。

分别说明：

- 可能断在哪个环节。
- 为什么怀疑这个环节。
- 现有学习数据能支持什么结论。
- 还需要我提供什么信息才能确认。
- 可以用什么最小测试验证断点。

不要仅凭正确率和用时就确定具体断点。

## 五、第四步：制定最小补强操作

对每个重要弱点，给出：

- 对应学科、资料、Group。
- 可能的能力链断点。
- 一个最小验证动作。
- 一个针对性加强动作。
- 重新训练的方式。
- 可观察、可量化的达标标准。

采用我的学习方法：

自探 → 学路 → 内化 → 提炼 → 验收。

坚持模仿高手思路、独立重做、复盘和限时检测。

## 六、第五步：按优先级排序

最终请用表格返回：

| 优先级 | 学科·资料·Group | 数据证据 | 潜在失分风险 | 疑似能力链断点 | 验证方法 | 最小加强操作 |
| --- | ----------- | ---- | ------ | ------- | ---- | ------ |

优先级应综合考虑错误程度、时间表现、实际考试重要性和证据可靠性。

没有足够数据时，明确说明，不强行排名。

## 七、最终输出

最后回答我三个问题：

1. 我现在最值得优先解决的三个问题是什么？
2. 如果今天只加强一个 Group，应该选哪个，为什么？
3. 我应该如何训练，才能在没有 AI 帮助的情况下独立完成陌生题？

使用通俗中文，详细但不要空泛。

最后返回一句可长期复习的「一句话心得」。`;
  const button = document.getElementById('copy-ai-learning-diagnosis');
  const status = document.getElementById('ai-learning-diagnosis-status');
  if (!button || !status) return;
  function copyFallback() {
    const field = document.createElement('textarea');
    field.value = instruction;
    field.readOnly = true;
    field.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;font-size:16px;';
    const previous = document.activeElement;
    document.body.appendChild(field);
    try {
      field.focus({ preventScroll: true });
      field.select();
      field.setSelectionRange(0, field.value.length);
      if (!document.execCommand('copy')) throw new Error('copy failed');
    } finally {
      field.remove();
      previous?.focus({ preventScroll: true });
    }
  }
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = '';
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(instruction);
      else copyFallback();
      status.textContent = '已复制，可粘贴到 ChatGPT';
    } catch (_) {
      status.textContent = '复制失败，请允许剪贴板访问后重试。';
    } finally {
      button.disabled = false;
    }
  });
})();
