(function (global) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  function root(state) {
    const data = state.focusReview;
    if (data === undefined) return { version: 1, questions: [], groups: [], session: null };
    if (!data || data.version !== 1 || !Array.isArray(data.questions) || !Array.isArray(data.groups) ||
        new Set(data.questions.map(item => item.id)).size !== data.questions.length ||
        new Set(data.groups.map(item => item.id)).size !== data.groups.length ||
        data.questions.some(item => !item || typeof item.id !== 'string' || typeof item.materialId !== 'string' || typeof item.groupKey !== 'string' ||
          typeof item.subjectKey !== 'string' || !Number.isSafeInteger(item.number) || item.number < 0 || !Array.isArray(item.events) || !['active', 'mastered', 'removed'].includes(item.status)) ||
        data.groups.some(group => !group || typeof group.id !== 'string' || !Array.isArray(group.members) || !group.members.length || !Array.isArray(group.runs)) ||
        (data.pausedSessions !== undefined && (!Array.isArray(data.pausedSessions) || data.pausedSessions.some(session => !session || typeof session.groupId !== 'string' || typeof session.runId !== 'string'))) ||
        (data.allReviews !== undefined && (!Array.isArray(data.allReviews) || data.allReviews.some(review => !review || review.mode !== 'all' ||
          typeof review.id !== 'string' || !Array.isArray(review.members) || !review.members.length || !Array.isArray(review.runs))))) {
      throw Error('重点复习数据格式异常，原数据保留，请先导出 JSON 核查。');
    }
    return data;
  }
  function edit(state) {
    const data = clone(root(state));
    state.focusReview = data;
    return data;
  }
  function parse(text) {
    const cleaned = String(text).trim().replace(/^第\s*/, '').replace(/\s*题$/, '');
    if (!/^\d+(?:(?:\s*[、,，]\s*|\s+)\d+)*$/.test(cleaned)) throw Error('题号格式不正确，请输入第3、7、12题或用空格分隔。');
    const numbers = [...new Set(cleaned.split(/[\s、,，]+/).map(Number))].sort((left, right) => left - right);
    if (numbers.some(number => !Number.isSafeInteger(number) || number < 0)) throw Error('题号必须是有效非负整数。');
    return numbers;
  }
  function source(state, materialId, index) {
    const matches = state.materials.filter(item => item.id === materialId);
    if (matches.length !== 1) throw Error('原资料不存在或 ID 重复，无法安全关联。');
    const material = matches[0], group = material?.groups[index];
    if (!material || !group) throw Error('原资料或 Group 不存在，未修改重点题库。');
    if (group.id && material.groups.filter(item => item.id === group.id).length !== 1) throw Error('原 Group ID 重复，无法安全关联。');
    const groupKey = group.id ? 'id:' + group.id : 'legacy:' + JSON.stringify([index, group.start ?? null, group.end ?? null]);
    return { material, group, groupKey, groupIndex: index };
  }
  function locate(state, question) {
    const matches = state.materials.filter(item => item.id === question.materialId);
    if (matches.length !== 1) return null;
    const material = matches[0];
    const index = question.groupKey.startsWith('id:') ? material.groups.findIndex(group => 'id:' + group.id === question.groupKey) : question.groupIndex;
    if (index < 0 || !material.groups[index]) return null;
    try {
      const found = source(state, material.id, index);
      const key = question.groupKey.startsWith('legacy:') ? 'legacy:' + JSON.stringify([index, found.group.start ?? null, found.group.end ?? null]) : found.groupKey;
      return key === question.groupKey ? found : null;
    }
    catch (_) { return null; }
  }
  function names(state, question) {
    const matches = state.materials.filter(material => material.id === question.materialId);
    if (matches.length !== 1) return { subject: '来源不可用', title: '来源不可用' };
    const material = matches[0];
    return { subject: typeof material.subject === 'string' && material.subject.trim() ? material.subject : '原学科字段缺失',
      title: typeof material.title === 'string' && material.title.trim() ? material.title : '原资料名称字段缺失' };
  }
  function groupNumbers(group) {
    const range = group.questionRange !== undefined ? group.questionRange :
      Number.isSafeInteger(group.start) && Number.isSafeInteger(group.end) && group.start >= 0 && group.start <= group.end ? `${group.start}-${group.end}` : null;
    if (typeof range !== 'string' || !range.trim()) throw Error('当前 Group 题号范围无法解析，未生成可加入题目，请核查本组已保存的范围。');
    const result = new Set();
    for (const part of range.split(/[,，、]/)) {
      const match = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
      const start = match ? Number(match[1]) : NaN, end = match ? Number(match[2] ?? match[1]) : NaN;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) throw Error('当前 Group 题号范围格式不正确，未加入任何题目。');
      if (end - start >= 10000) throw Error('当前 Group 题号过多，暂不能安全生成勾选项，未加入任何题目。');
      for (let number = start; number <= end; number++) {
        result.add(number);
        if (result.size > 10000) throw Error('当前 Group 题号过多，暂不能安全生成勾选项，未加入任何题目。');
      }
    }
    return [...result];
  }
  function add(state, materialId, index, text, confirmed = false, at = Date.now()) {
    const origin = source(state, materialId, index), numbers = parse(text);
    const reliable = Number.isSafeInteger(origin.group.start) && Number.isSafeInteger(origin.group.end) && origin.group.start <= origin.group.end;
    const allowed = origin.group.questionRange !== undefined ? new Set(groupNumbers(origin.group)) : null;
    if (numbers.some(number => allowed ? !allowed.has(number) : reliable && (number < origin.group.start || number > origin.group.end))) throw Error('题号不属于当前 Group 的有效范围。');
    if (!allowed && !reliable && !confirmed) throw Error('无法自动核实本组题号范围，请先人工确认题目属于本组。');
    if (typeof origin.material.subject !== 'string' || !origin.material.subject.trim() || typeof origin.material.title !== 'string' || !origin.material.title.trim()) throw Error('原资料学科或资料名称字段缺失，未使用默认名称，请先核查原资料。');
    const data = edit(state);
    const subjectName = origin.material.subject;
    if (data.subjectRefs !== undefined && !Array.isArray(data.subjectRefs)) throw Error('重点学科关联记录异常，请先保留备份并核查。');
    data.subjectRefs = data.subjectRefs || [];
    if (data.subjectRefs.some(item => !item || typeof item.id !== 'string' || !Array.isArray(item.materialIds))) throw Error('重点学科关联记录异常，请先保留备份并核查。');
    const originalSubjectId = typeof origin.material.subjectId === 'string' && origin.material.subjectId ? origin.material.subjectId : null;
    let subjectRef = originalSubjectId ? data.subjectRefs.find(item => item.id === originalSubjectId) :
      data.subjectRefs.find(item => item.materialIds.includes(materialId)) || data.subjectRefs.find(item => item.name === subjectName);
    if (!subjectRef) {
      subjectRef = { id: originalSubjectId || global.crypto.randomUUID(), name: subjectName, materialIds: [] };
      data.subjectRefs.push(subjectRef);
    }
    if (!subjectRef.materialIds.includes(materialId)) subjectRef.materialIds.push(materialId);
    let added = 0, duplicates = 0;
    for (const number of numbers) {
      const id = JSON.stringify([materialId, origin.groupKey, number]);
      const existing = data.questions.find(item => item.id === id) ||
        data.questions.find(item => item.materialId === materialId && item.number === number && locate(state, item)?.group === origin.group);
      if (existing) {
        existing.subjectId = existing.subjectId || subjectRef.id;
        existing.groupId = existing.groupId || origin.group.id || origin.groupKey;
        if (existing.status !== 'active') { existing.status = 'active'; existing.events.push({ status: 'active', at }); }
        duplicates++; continue;
      }
      data.questions.push({ id, materialId, groupId: origin.group.id || origin.groupKey, subjectId: subjectRef.id, groupKey: origin.groupKey, groupIndex: index, number,
        subjectKey: subjectName, subjectName,
        materialTitle: origin.material.title, links: clone({ video: origin.material.videoLinks || [], output: origin.material.outputLinks || [] }),
        addedAt: at, status: 'active', events: [{ status: 'active', at }] });
      added++;
    }
    return { added, duplicates };
  }
  function available(state, subject) {
    const data = root(state);
    const running = active(state);
    const assigned = new Set(data.groups.filter(group => !group.retiredAt || running?.group.id === group.id).flatMap(group => group.members.map(item => item.id)));
    running?.run.members.forEach(item => assigned.add(item.id));
    return data.questions.filter(item => item.subjectKey === subject && item.status === 'active' && !assigned.has(item.id) && locate(state, item));
  }
  function create(state, subject, quantity, expectedIds, at = Date.now()) {
    if (!/^\d+$/.test(String(quantity)) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) throw Error('题量必须是正整数。');
    const count = Number(quantity), pending = available(state, subject), selected = pending.slice(0, count);
    if (count > pending.length) throw Error('待分组题目不足。');
    if (JSON.stringify(selected.map(item => item.id)) !== JSON.stringify(expectedIds)) throw Error('待分组内容已变化，请重新预览后确认。');
    if (new Set(selected.map(item => names(state, item).subject)).size !== 1) throw Error('题目当前学科不同，请按学科分别创建分组。');
    const data = edit(state), id = global.crypto.randomUUID();
    data.groups.push({ id, subjectKey: subject, number: data.groups.filter(group => group.subjectKey === subject).length + 1,
      createdAt: at, members: clone(selected), runs: [], retiredAt: null });
    return id;
  }
  function setStatus(state, id, status, at = Date.now()) {
    if (!['active', 'mastered', 'removed'].includes(status)) throw Error('重点题状态无效。');
    const data = edit(state), question = data.questions.find(item => item.id === id);
    if (!question) throw Error('重点题不存在。');
    if (status === 'active' && !locate(state, question)) throw Error('原资料或 Group 已缺失，无法重新加入。');
    question.status = status; question.events.push({ status, at });
  }
  function ordered(state, subject, includeInactive = false) {
    return root(state).questions.map((question, index) => ({ question, index }))
      .filter(({ question }) => question.subjectKey === subject && (includeInactive || question.status === 'active' && locate(state, question)))
      .sort((left, right) => {
        const time = question => Number.isFinite(question.addedAt) && question.addedAt >= 0 ? question.addedAt : -1;
        return time(left.question) - time(right.question) || left.index - right.index;
      }).map(item => item.question);
  }
  function filterConditions(filters = {}) {
    const result = {};
    for (const [key, limit] of [['accuracy', 100], ['duration', Infinity]]) {
      const value = filters[key];
      if (value === undefined || value === null) { result[key] = null; continue; }
      if (String(value).trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > limit) throw Error(key === 'accuracy' ? '正确率请输入0至100之间的百分比。' : '用时请输入非负分钟数。');
      result[key] = Number(value);
    }
    return result;
  }
  function groupMetrics(group, completedOnly = false) {
    let accuracy = null, duration = null, accuracyRatio = null;
    const runs = (group.runs || []).map((run, index) => ({ run, index })).filter(({ run }) =>
      (run.metricsScope === 'group' || run.progressVersion === undefined && !run.questionProgress) &&
      (!completedOnly || Number.isFinite(run.completedAt) && run.outputCompleted === true))
      .sort((left, right) => (completedOnly ? right.run.completedAt - left.run.completedAt :
        (right.run.metricsSavedAt ?? right.run.completedAt ?? right.run.startedAt ?? -1) -
        (left.run.metricsSavedAt ?? left.run.completedAt ?? left.run.startedAt ?? -1)) || right.index - left.index);
    for (const { run } of completedOnly ? runs.slice(0, 1) : runs) {
      const ratio = typeof run.accuracy === 'string' ? /^(\d+)\s*\/\s*(\d+)$/.exec(run.accuracy.trim()) : null;
      if (accuracy === null && ratio && Number.isSafeInteger(Number(ratio[1])) && Number.isSafeInteger(Number(ratio[2])) &&
          Number(ratio[2]) > 0 && Number(ratio[1]) <= Number(ratio[2])) { accuracy = Number(ratio[1]) / Number(ratio[2]) * 100; accuracyRatio = run.accuracy.trim(); }
      if (duration === null && String(run.durationMinutes ?? '').trim() !== '' && Number.isFinite(Number(run.durationMinutes)) &&
          Number(run.durationMinutes) >= 0) duration = Number(run.durationMinutes);
    }
    return { accuracy, duration, accuracyRatio };
  }
  function groupingPlan(state, subject, filters = {}) {
    const data = root(state), running = active(state), conditions = filterConditions(filters);
    const groups = data.groups.filter(group => group.subjectKey === subject && !group.retiredAt);
    const scores = new Map(groups.map(group => [group.id, groupMetrics(group, true)]));
    let unrecorded = 0, groupMetricsCount = 0;
    const questions = ordered(state, subject).filter(question => {
      if (conditions.accuracy === null && conditions.duration === null) return true;
      const owners = groups.filter(group => group.members.some(member => member.id === question.id && locate(state, member)));
      const metrics = owners.length === 1 ? scores.get(owners[0].id) : { accuracy: null, duration: null };
      const unknown = conditions.accuracy !== null && metrics.accuracy === null || conditions.duration !== null && metrics.duration === null;
      const include = conditions.accuracy !== null && metrics.accuracy !== null && metrics.accuracy < conditions.accuracy ||
        conditions.duration !== null && metrics.duration !== null && metrics.duration > conditions.duration;
      if (include && unknown) unrecorded++;
      if (include && owners.length === 1) groupMetricsCount++;
      return include;
    });
    return { questions, unrecorded, groupMetrics: groupMetricsCount,
      groupIds: groups.filter(group => !group.retiredAt || running?.group.id === group.id).map(group => group.id) };
  }
  function regroup(state, subject, quantity, expected, confirmed = false, at = Date.now()) {
    if (!/^\d+$/.test(String(quantity)) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1) throw Error('每组题数必须为正整数。');
    const running = active(state);
    if (running?.group.subjectKey === subject || root(state).pausedSessions?.some(session => findGroup(state, session.groupId)?.subjectKey === subject)) throw Error('当前学科有未完成的重点复习，请先继续完成，再对全部有效重点题重新分组；原进度和历史未修改。');
    const plan = groupingPlan(state, subject, expected.filters), count = Number(quantity);
    if (!plan.questions.length) throw Error('暂无符合条件的重点题，当前没有可分组的有效重点题。');
    if (JSON.stringify(plan.questions.map(question => question.id)) !== JSON.stringify(expected.questionIds) || JSON.stringify(plan.groupIds) !== JSON.stringify(expected.groupIds)) throw Error('题目或分组已变化，请重新确认分组。');
    if (plan.groupIds.length && !confirmed) throw Error('请先确认重新分组；旧分组历史和正在复习的进度会保留。');
    if (new Set(plan.questions.map(question => names(state, question).subject)).size !== 1) throw Error('题目当前学科不同，请按学科分别分组。');
    const data = edit(state), retained = data.groups.filter(group => group.subjectKey === subject && group.id === running?.group.id);
    data.groups.forEach(group => { if (group.subjectKey === subject && !group.retiredAt && group.id !== running?.group.id) group.retiredAt = at; });
    const used = new Set(retained.map(group => group.number)), ids = [];
    let number = 1;
    for (let index = 0; index < plan.questions.length; index += count) {
      while (used.has(number)) number++;
      const id = global.crypto.randomUUID(), members = plan.questions.slice(index, index + count);
      data.groups.push({ id, subjectKey: subject, number, createdAt: at, members: clone(members), runs: [], retiredAt: null,
        positionStart: index + 1, positionEnd: index + members.length });
      used.add(number); number++; ids.push(id);
    }
    return ids;
  }
  function next(state, subject) {
    const data = root(state), candidates = data.groups.filter(group => group.subjectKey === subject && !group.retiredAt &&
      group.members.some(member => data.questions.find(item => item.id === member.id)?.status === 'active' && locate(state, member)));
    return candidates[0] || null;
  }
  function findGroup(state, id) {
    const data = root(state);
    return data.groups.find(group => group.id === id) || data.allReviews?.find(review => review.id === id);
  }
  function allQuestions(state, subject) {
    const assigned = new Set(root(state).groups.filter(group => group.subjectKey === subject && !group.retiredAt)
      .flatMap(group => group.members.filter(question => locate(state, question)).map(question => question.id)));
    return ordered(state, subject).filter(question => assigned.has(question.id));
  }
  function startAll(state, subject, at = Date.now()) {
    const current = active(state);
    const members = allQuestions(state, subject);
    if (!members.length) throw Error('暂无已分组的重点题');
    if (current?.group.mode === 'all' && current.group.subjectKey === subject) return current.group.id;
    const paused = root(state).pausedSessions?.find(session => {
      const group = findGroup(state, session.groupId);
      return group?.mode === 'all' && group.subjectKey === subject;
    });
    if (paused) active({ ...state, focusReview: { ...root(state), session: paused } });
    const data = edit(state), id = global.crypto.randomUUID();
    if (current) {
      if (!data.pausedSessions) data.pausedSessions = [];
      data.pausedSessions.push(clone(data.session)); data.session = null;
    }
    if (paused) { start(state, paused.groupId, at); return paused.groupId; }
    if (!data.allReviews) data.allReviews = [];
    data.allReviews.push({ id, mode: 'all', subjectKey: subject, createdAt: at, members: clone(members), runs: [], retiredAt: null });
    start(state, id, at);
    const run = active(state).run;
    const groups = root(state).groups.filter(group => group.subjectKey === subject && !group.retiredAt);
    const reviews = new Map();
    for (const member of run.members) {
      const owners = groups.filter(group => group.members.some(question => question.id === member.id));
      if (owners.length !== 1) throw Error('重点题对应的当前分组不唯一，未猜测成绩归属。');
      const groupId = owners[0].id;
      if (!reviews.has(groupId)) reviews.set(groupId, { id: global.crypto.randomUUID(), groupId, startedAt: null, completedAt: null,
        members: [], metricsScope: 'group', accuracy: '', durationMinutes: '', notes: '', outputCompleted: false, videoCompleted: false, videoSkipped: true });
      reviews.get(groupId).members.push(clone(member));
    }
    run.groupReviews = [...reviews.values()];
    run.metricsScope = 'all-groups';
    run.groupReviews.find(review => review.members.some(member => member.id === run.members[0].id)).startedAt = at;
    return id;
  }
  function start(state, id, at = Date.now()) {
    const data = edit(state);
    if (data.session) {
      if (data.session.groupId !== id) throw Error('请先完成正在进行的重点 Group。');
      return;
    }
    const group = findGroup(state, id);
    if (!group || group.retiredAt) throw Error('重点 Group 不存在或已停用。');
    const pausedIndex = data.pausedSessions?.findIndex(session => session.groupId === id) ?? -1;
    if (pausedIndex >= 0) {
      const session = data.pausedSessions[pausedIndex];
      active({ ...state, focusReview: { ...data, session } });
      data.session = data.pausedSessions.splice(pausedIndex, 1)[0];
      return;
    }
    const members = group.members.filter(member => {
      const question = data.questions.find(item => item.id === member.id);
      return question?.status === 'active' && locate(state, question) && locate(state, member);
    });
    if (!members.length) throw Error('当前组没有来源可用且仍需训练的有效重点题，不能开始空任务。');
    const run = { id: global.crypto.randomUUID(), startedAt: at, completedAt: null, videoCompleted: false,
      videoSkipped: true, outputCompleted: false, members: clone(members), accuracy: '', durationMinutes: '', notes: '', metricsScope: 'group' };
    Object.assign(run, progress(run));
    group.runs.push(run);
    data.session = { groupId: id, runId: run.id, step: 'output', currentQuestionIndex: 0 };
  }
  function progress(run) {
    if (run.progressVersion === undefined) return { progressVersion: 1, questionIndex: 0, completedCount: 0,
      questionProgress: run.members.map((member, index) => ({ questionId: member.id, completedAt: null, outputCompleted: false,
        startedAt: index === 0 ? run.startedAt : null, videoCompleted: index === 0 && run.videoCompleted,
        videoSkipped: index === 0 ? run.videoSkipped : true, accuracy: index === 0 ? run.accuracy : '',
        durationMinutes: index === 0 ? run.durationMinutes : '', notes: index === 0 ? run.notes : '' })) };
    if (run.progressVersion !== 1 || !Number.isInteger(run.questionIndex) || run.questionIndex < 0 || run.questionIndex > run.members.length ||
        run.completedCount !== run.questionIndex || !Array.isArray(run.questionProgress) || run.questionProgress.length !== run.members.length ||
        run.questionProgress.some((item, index) => !item || item.questionId !== run.members[index].id ||
          (index < run.questionIndex ? (!item.outputCompleted && !(['removed', 'inactive'].includes(item.resolution) && item.processedAt === item.completedAt)) || !Number.isFinite(item.completedAt) || !Number.isFinite(item.startedAt) || item.completedAt < item.startedAt : item.completedAt !== null || item.outputCompleted))) {
      throw Error('重点题复习断点异常，原进度未重置，请先保留备份核查。');
    }
    return { progressVersion: 1, questionIndex: run.questionIndex, completedCount: run.completedCount, questionProgress: run.questionProgress };
  }
  function active(state) {
    const data = root(state), session = data.session;
    if (!session) return null;
    const group = findGroup(state, session.groupId), run = group?.runs.find(item => item.id === session.runId);
    if (!group || !run || run.completedAt !== null || !run.members?.length) throw Error('重点复习断点异常，请导出备份核查。');
    const checkpoint = progress(run), index = checkpoint.questionIndex;
    if (index >= run.members.length || (session.currentQuestionIndex !== undefined && session.currentQuestionIndex !== index)) throw Error('重点题复习位置异常，未跳过题目。');
    return { session, group, run, index, question: run.members[index], questionRun: checkpoint.questionProgress[index], completedCount: checkpoint.completedCount };
  }
  function metrics(values) {
    const accuracy = String(values.accuracy || '').trim(), durationMinutes = String(values.durationMinutes ?? '').trim();
    if (accuracy) {
      const match = /^(\d+)\s*\/\s*(\d+)$/.exec(accuracy);
      if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) <= 0 || Number(match[1]) > Number(match[2])) throw Error('正确率请输入答对题数/总题数，例如8/10。');
    }
    if (durationMinutes && (!Number.isFinite(Number(durationMinutes)) || Number(durationMinutes) < 0)) throw Error('用时请输入非负分钟数。');
    return { accuracy, durationMinutes, notes: String(values.notes || '') };
  }
  function metricRecord(state) {
    const current = active(state);
    if (!current) return null;
    if (!current.run.groupReviews) return current.run;
    const matches = current.run.groupReviews.filter(review => review.members.some(member => member.id === current.question.id));
    if (matches.length !== 1) throw Error('当前题的重点 Group 成绩关联异常，未保存到其他分组。');
    return matches[0];
  }
  function removalQuestions(state) {
    const current = active(state);
    if (!current) throw Error('当前没有进行中的重点复习。');
    const group = current.group.mode === 'all' ? root(state).groups.find(group => group.id === metricRecord(state).groupId) : current.group;
    if (!group) throw Error('旧轮缺少可靠的重点 Group 归属，不能猜测移出范围。');
    return group.members.filter(member => {
      const question = root(state).questions.find(question => question.id === member.id);
      return question?.status === 'active' && locate(state, question) && locate(state, member);
    });
  }
  function removeSelected(state, runId, index, ids, values = {}, at = Date.now()) {
    const current = active(state);
    if (!current || current.run.id !== runId || current.index !== index) throw Error('复习题目已变化，请重新选择。');
    const selected = [...new Set(ids)], allowed = new Set(removalQuestions(state).map(question => question.id));
    if (!selected.length) throw Error('请先勾选需要移出的题目。');
    if (selected.some(id => !allowed.has(id))) throw Error('所选题目或状态已变化，请重新选择。');
    metrics({ ...metricRecord(state), ...values });
    const data = edit(state);
    for (const id of selected) {
      const question = data.questions.find(question => question.id === id);
      question.status = 'mastered'; question.events.push({ status: 'mastered', at });
    }
    transition(state, runId, selected.includes(current.question.id) ? 'remove' : 'save', values, at, index);
    return selected.length;
  }
  function completeGroupReviews(state, run, at) {
    for (const review of run.groupReviews || []) {
      if (review.completedAt !== null) continue;
      const records = review.members.map(member => run.questionProgress.find(record => record.questionId === member.id));
      if (records.some(record => !Number.isFinite(record?.completedAt))) continue;
      const group = root(state).groups.find(group => group.id === review.groupId);
      if (!group || !review.members.every(member => group.members.some(source => source.id === member.id))) throw Error('原重点 Group 关联变化，未覆盖其他分组记录。');
      review.startedAt ??= Math.min(...records.map(record => record.startedAt));
      review.completedAt = at; review.outputCompleted = records.some(record => record.outputCompleted);
      if (!group.runs.some(record => record.id === review.id)) group.runs.push({ ...clone(review), sourceAllRunId: run.id,
        progressVersion: 1, questionIndex: records.length, completedCount: records.length, questionProgress: clone(records) });
    }
  }
  function transition(state, expectedRunId, action, values = {}, at = Date.now(), expectedIndex) {
    const current = active(state);
    if (!current || current.run.id !== expectedRunId) throw Error('重点复习任务已变化，请刷新后继续。');
    if (expectedIndex !== undefined && current.index !== expectedIndex) throw Error('当前重点题已变化，请继续当前未完成题目。');
    if (at < current.run.startedAt) throw Error('设备时间早于任务开始时间。');
    const recording = metrics(action === 'skipInactive' ? metricRecord(state) : { ...metricRecord(state), ...values });
    if (!['videoDone', 'videoSkip', 'save', 'finish', 'remove', 'skipInactive'].includes(action)) throw Error('重点复习操作无效。');
    const sourceQuestion = root(state).questions.find(question => question.id === current.question.id);
    if (action === 'skipInactive' && sourceQuestion?.status === 'active' && locate(state, sourceQuestion) && locate(state, current.question)) throw Error('当前题仍然有效，不能跳过。');
    if (action === 'remove' && !root(state).questions.some(question => question.id === current.question.id)) throw Error('重点题记录不存在，未执行移出。');
    if (action === 'finish' && current.session.step !== 'output') throw Error('请先完成或跳过 VIDEO，再独立输出。');
    if (['videoDone', 'videoSkip'].includes(action) && !['video', 'output'].includes(current.session.step)) throw Error('VIDEO 断点已变化。');
    const data = edit(state), updated = active(state);
    Object.assign(updated.run, progress(updated.run));
    updated.session.currentQuestionIndex = updated.index;
    const item = updated.run.questionProgress[updated.index];
    if (!Number.isFinite(item.startedAt) || at < item.startedAt) throw Error('当前重点题开始时间异常，请核对后重试。');
    const target = metricRecord(state);
    Object.assign(target, recording);
    if (action !== 'skipInactive') {
      target.metricsScope = 'group'; target.metricsSavedAt = at;
    }
    if (action === 'videoDone' || action === 'videoSkip') {
      updated.run.videoCompleted = action === 'videoDone'; updated.run.videoSkipped = action === 'videoSkip'; updated.session.step = 'output';
      item.videoCompleted = updated.run.videoCompleted; item.videoSkipped = updated.run.videoSkipped;
    }
    if (action === 'finish' || action === 'remove' || action === 'skipInactive') {
      if (action === 'finish') {
        if (!locate(state, updated.question)) throw Error('当前题来源已缺失，未完成该题；请先核查。');
        item.outputCompleted = true;
      } else if (action === 'remove') {
        const question = data.questions.find(question => question.id === updated.question.id);
        if (question.status === 'active') { question.status = 'mastered'; question.events.push({ status: 'mastered', at }); }
        Object.assign(item, { outputCompleted: false, resolution: 'removed', processedAt: at });
      } else {
        Object.assign(item, { outputCompleted: false, resolution: 'inactive', processedAt: at });
      }
      item.completedAt = at;
      updated.run.questionIndex++; updated.run.completedCount++;
      while (updated.run.questionIndex < updated.run.members.length &&
          (data.questions.find(question => question.id === updated.run.members[updated.run.questionIndex].id)?.status !== 'active' ||
          !locate(state, data.questions.find(question => question.id === updated.run.members[updated.run.questionIndex].id)) ||
          !locate(state, updated.run.members[updated.run.questionIndex]))) {
        const skipped = updated.run.questionProgress[updated.run.questionIndex];
        Object.assign(skipped, { startedAt: at, completedAt: at, processedAt: at, resolution: 'inactive', outputCompleted: false });
        updated.run.questionIndex++; updated.run.completedCount++;
      }
      completeGroupReviews(state, updated.run, at);
      if (updated.run.questionIndex === updated.run.members.length) {
        updated.run.outputCompleted = updated.run.questionProgress.some(record => record.outputCompleted); updated.run.completedAt = at; data.session = null;
        global.PocketReviewAdmission?.recordFocus(state, updated.group.id, updated.run.id, at);
      } else {
        const following = updated.run.questionProgress[updated.run.questionIndex]; following.startedAt = at;
        updated.session.currentQuestionIndex = updated.run.questionIndex; updated.session.step = 'output';
        Object.assign(updated.run, { videoCompleted: following.videoCompleted, videoSkipped: following.videoSkipped });
        const followingMetrics = metricRecord(state);
        if (followingMetrics.startedAt === null) followingMetrics.startedAt = at;
      }
    }
  }
  function retire(state, id, at = Date.now()) {
    const data = edit(state), group = data.groups.find(item => item.id === id);
    if (!group || data.session?.groupId === id || data.pausedSessions?.some(session => session.groupId === id)) throw Error('正在复习的 Group 不能停用，请先完成。');
    group.retiredAt = at;
  }
  global.PocketFocusReview = Object.freeze({ root, parse, source, locate, names, groupNumbers, add, available, create, setStatus, ordered, groupingPlan, regroup, next, findGroup, allQuestions, startAll, start, active, transition, retire, metricRecord, groupMetrics, removalQuestions, removeSelected });
})(globalThis);
