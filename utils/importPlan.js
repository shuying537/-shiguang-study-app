// 学习计划文本解析：把「粘贴的一堆计划」变成可预览、可校对的任务行。
// 纯函数，不读写存储；today、现有科目与任务都由调用方传入，方便单元测试。
//
// 支持的写法（大小写、全角括号、列表符号都做了容错）：
//   完成高数第一章 [高等数学] [2026-10-20 18:00]
//   - 背 30 个单词 【英语】 10月21日 20:00
//   复习错题 @数学 明天 晚上8点
//   10/22 19:30 线性代数第三章
//   线性代数第三章              ← 没写时间：默认 7 天后截止、今天开始
const MAX_ROWS = 300
const MAX_TITLE = 60
const MAX_SUBJECT = 20
const DEFAULT_DEADLINE_DAYS = 7

function pad(n) { return String(n).padStart(2, '0') }
function dateKeyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) }
function addDays(key, n) { const d = new Date(key + 'T12:00:00'); d.setDate(d.getDate() + n); return dateKeyOf(d) }
function parseKey(key) { return new Date(key + 'T12:00:00') }
function validDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key || ''))) return false
  return dateKeyOf(parseKey(key)) === key
}
function normName(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase() }
function normTitle(value) { return String(value || '').replace(/\s+/g, '').toLowerCase() }

// ---------- 单行清洗 ----------
function normalizeLine(line) {
  return String(line || '')
    .replace(/^\uFEFF/, '')
    .replace(/\t/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/^\s*(?:[-–—*•·+]+|\[[ xX✓✔]?\]|☐|□|▢)\s*/, '') // 项目符号 / 复选框
    .replace(/^\s*\d{1,2}\s*(?:[.．)）]\s*(?!\d)|、\s*)/, '')    // 1. / 1、 / 1) 有序列表（不误伤 1.5、10.20 这类数字）
    .replace(/^\s*[（(]\s*\d{1,2}\s*[)）]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------- 日期与时间 ----------
function periodHour(hour, period) {
  if (period === '下午' || period === '晚上' || period === '傍晚') return hour < 12 ? hour + 12 : hour
  if (period === '中午') return hour < 11 ? hour + 12 : hour
  if (period === '凌晨') return hour === 12 ? 0 : hour
  return hour
}

function buildDate(y, m, d, hour, minute, today, hasTime) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return null
  let year = Number(y)
  if (!year) {
    const base = parseKey(today)
    year = base.getFullYear()
    // 只写「10月20日」时，如果已经过去很久，按明年的计划处理
    if (new Date(year, m - 1, d, 12) < new Date(base.getTime() - 30 * 86400000)) year += 1
  }
  const dt = new Date(year, m - 1, d, hour == null ? 12 : hour, minute == null ? 0 : minute)
  if (dt.getFullYear() !== year || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  const date = dateKeyOf(dt)
  if (hour == null) return { deadline: date + ' 23:59', date, hasTime: false }
  const h = periodHour(Number(hour), null)
  if (!(h >= 0 && h <= 23) || !(minute >= 0 && minute <= 59)) return null
  return { deadline: date + ' ' + pad(h) + ':' + pad(minute), date, hasTime: true }
}

// 解析一个「日期 / 日期+时间 / 时间」片段；解析不了返回 null
function parseDateToken(text, today, allowTimeOnly) {
  let s = String(text || '').trim().replace(/[，,。；;]+$/, '')
  if (!s) return null
  s = s.replace(/\s+/g, ' ')
  let m

  // 相对日期：今天 / 明天 / 后天 / 大后天（可带时间段与时间）
  m = s.match(/^(今天|明天|后天|大后天)(?:\s*(上午|下午|晚上|中午|早上|凌晨|傍晚))?(?:\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?)?$/)
  if (m) {
    const base = parseKey(today)
    const offset = { 今天: 0, 明天: 1, 后天: 2, 大后天: 3 }[m[1]]
    base.setDate(base.getDate() + offset)
    if (m[3] == null) return { deadline: dateKeyOf(base) + ' 23:59', date: dateKeyOf(base), hasTime: false }
    let hour = periodHour(Number(m[3]), m[2])
    if (hour > 23) return null
    return { deadline: dateKeyOf(base) + ' ' + pad(hour) + ':' + pad(Number(m[4] || 0)), date: dateKeyOf(base), hasTime: true }
  }

  // 星期：周一 / 星期一 / 下周三
  m = s.match(/^(下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])(?:\s*(上午|下午|晚上|中午|早上|凌晨|傍晚))?(?:\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?)?$/)
  if (m) {
    const target = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 }[m[2]]
    const base = parseKey(today)
    const current = base.getDay() || 7
    let delta = (target - current + 7) % 7
    if (m[1]) delta += 7
    base.setDate(base.getDate() + delta)
    const date = dateKeyOf(base)
    if (m[4] == null) return { deadline: date + ' 23:59', date, hasTime: false }
    let hour = periodHour(Number(m[4]), m[3])
    if (hour > 23) return null
    return { deadline: date + ' ' + pad(hour) + ':' + pad(Number(m[5] || 0)), date, hasTime: true }
  }

  // 完整日期：2026-10-20 / 2026/10/20 / 2026年10月20日，可带时间
  m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?(?:\s*(上午|下午|晚上|中午|早上|凌晨|傍晚))?(?:\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?)?$/)
  if (m) {
    const hasTime = m[5] != null
    let hour = hasTime ? periodHour(Number(m[5]), m[4]) : null
    if (hasTime && hour > 23) return null
    return buildDate(m[1], Number(m[2]), Number(m[3]), hour, hasTime ? Number(m[6] || 0) : null, today, hasTime)
  }

  // 中文月日：10月20日 / 10月20号，可带时间
  m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?(?:\s*(上午|下午|晚上|中午|早上|凌晨|傍晚))?(?:\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?)?$/)
  if (m) {
    const hasTime = m[4] != null
    let hour = hasTime ? periodHour(Number(m[4]), m[3]) : null
    if (hasTime && hour > 23) return null
    return buildDate(null, Number(m[1]), Number(m[2]), hour, hasTime ? Number(m[5] || 0) : null, today, hasTime)
  }

  // 数字月日：10/20、10.20；连字符仅在有时间时识别，避免把「2-3 章」当作日期
  m = s.match(/^(\d{1,2})\s*([/.])\s*(\d{1,2})(?:\s*(上午|下午|晚上|中午|早上|凌晨|傍晚))?(?:\s+(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?)?$/)
  if (m && !(m[2] === '-' && m[5] == null)) {
    const hasTime = m[5] != null
    let hour = hasTime ? periodHour(Number(m[5]), m[4]) : null
    if (hasTime && hour > 23) return null
    return buildDate(null, Number(m[1]), Number(m[3]), hour, hasTime ? Number(m[6] || 0) : null, today, hasTime)
  }
  m = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(上午|下午|晚上|中午|早上|凌晨|傍晚)?\s*(\d{1,2})\s*(?:[:：点时]\s*(\d{1,2})?\s*分?)?$/)
  if (m) {
    let hour = periodHour(Number(m[4]), m[3])
    if (hour > 23) return null
    return buildDate(null, Number(m[1]), Number(m[2]), hour, Number(m[5] || 0), today, true)
  }

  // 纯时间（只在「截止 18:00」这类明确语境里使用）
  if (allowTimeOnly) {
    m = s.match(/^(上午|下午|晚上|中午|早上|凌晨|傍晚)?\s*(\d{1,2})\s*(?:[:：点时])\s*(\d{1,2})?\s*分?$/)
    if (m) {
      let hour = periodHour(Number(m[2]), m[1])
      if (hour > 23) return null
      return { deadline: today + ' ' + pad(hour) + ':' + pad(Number(m[3] || 0)), date: today, hasTime: true, hasDate: false }
    }
  }
  return null
}

// ---------- 括号 / 科目 ----------
const BRACKET = /[\[【［]\s*([^\]】］]{1,60}?)\s*[\]】］]/g
function bracketGroups(text) {
  const groups = []
  let m
  BRACKET.lastIndex = 0
  while ((m = BRACKET.exec(text))) groups.push({ raw: m[0], inner: m[1].trim(), index: m.index })
  return groups
}

function findSubject(subjects, name) {
  const key = normName(name)
  return (subjects || []).find(s => normName(s.name) === key) || null
}

function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// 已知科目名出现在行首（后面必须是分隔符或空格），例如「数学：完成第二章」
function knownSubjectPrefix(work, subjects) {
  const names = (subjects || []).map(s => String(s.name || '')).filter(Boolean).sort((a, b) => b.length - a.length)
  for (const name of names) {
    const re = new RegExp('^' + escapeRegExp(name) + '(?:\\s*[:：\\-–—·|,，]\\s*|\\s+)', 'i')
    if (re.test(work)) return name
  }
  return ''
}

// ---------- 一行 → 任务预览 ----------
function parseLine(rawLine, index, ctx) {
  let work = normalizeLine(rawLine)
  if (!work) return null
  work = work.replace(/[。.;；,，!！]+$/, '')
  if (!work) return null

  const warnings = []
  let dateInfo = null, dateWarning = ''
  let estimatedMinutes = null, durationError = false
  const duration = work.match(/(?:[\[【［]\s*)?(?:预计(?:时长)?|用时|时长)\s*[:：]?\s*([^\]】］]+?)\s*(?:[\]】］])?\s*$/)
  if (duration) {
    const value = duration[1].trim().match(/^(\d+)\s*(?:分钟|min)$/i)
    estimatedMinutes = value ? Number(value[1]) : null
    durationError = !value || estimatedMinutes < 5 || estimatedMinutes > 1440 || estimatedMinutes % 5 !== 0
    work = work.slice(0, duration.index).trim()
  }

  // 1) 优先读括号里的日期；被识别为已知科目的括号不当日期
  const groups = bracketGroups(work)
  const dateGroups = []
  groups.forEach(g => {
    if (findSubject(ctx.subjects, g.inner)) return
    const parsed = parseDateToken(g.inner, ctx.today)
    if (parsed) dateGroups.push({ raw: g.raw, parsed })
  })
  if (dateGroups.length) {
    dateInfo = dateGroups[dateGroups.length - 1].parsed
    dateGroups.forEach(g => { work = work.replace(g.raw, ' ') })
  }

  // 2) 行首日期：「10/22 19:30 线性代数第三章」。行首的裸数字更像章节号，
  //    所以只有带时间、带年月日、或相对日期时才认。
  if (!dateInfo) {
    const parts = work.split(' ')
    for (let take = Math.min(2, parts.length - 1); take >= 1; take--) {
      const token = parts.slice(0, take).join(' ')
      const parsed = parseDateToken(token, ctx.today)
      const explicitDate = parsed && (take > 1 || parsed.hasTime || /[年月日号]/.test(token) ||
        /^\d{4}\s*[-/.]/.test(token) || /^(?:今天|明天|后天|大后天|下?\s*(?:周|星期|礼拜))/.test(token))
      if (parsed && explicitDate) { dateInfo = parsed; work = parts.slice(take).join(' '); break }
    }
  }

  // 3) 没有括号日期时，从行尾拆日期（最多 3 段，如「10月20日 18:00」）
  if (!dateInfo) {
    const explicit = work.match(/(?:截止(?:时间|日期)?|ddl)\s*[:：]?\s*(\d{1,2}\s*[:：点]\s*\d{0,2}\s*分?)\s*$/i)
    if (explicit) {
      const parsed = parseDateToken(explicit[1], ctx.today, true)
      if (parsed) { dateInfo = parsed; work = work.slice(0, explicit.index) }
    }
  }
  if (!dateInfo) {
    // 允许「日期 [科目]」的顺序：先把行尾括号摘下来，再找日期，最后把括号放回去
    let tailBracket = '', searchable = work
    const trailing = work.match(/[\[【［][^\]】］]{1,60}[\]】］]\s*$/)
    if (trailing) { searchable = work.slice(0, trailing.index).trim(); tailBracket = trailing[0].trim() }
    const parts = searchable.split(' ')
    for (let take = Math.min(3, parts.length - 1); take >= 1; take--) {
      const parsed = parseDateToken(parts.slice(-take).join(' '), ctx.today)
      if (parsed) {
        dateInfo = parsed
        work = (parts.slice(0, -take).join(' ') + ' ' + tailBracket).trim()
        break
      }
    }
  }

  // 4) 看起来像日期却没解析成功：留在任务名里，但提示用户检查
  if (!dateInfo) {
    const guess = work.match(/\d{4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{1,2}\s*[:：]\s*\d{2}/)
    if (guess) {
      dateWarning = '没能识别日期「' + guess[0].replace(/\s+/g, ' ') + '」，已留在任务名里'
      warnings.push(dateWarning)
    }
  }

  // 5) 科目：括号 > @科目 > 科目：xxx > 行首已知科目
  let subject = null
  let subjectName = ''
  const remaining = bracketGroups(work)
  const candidates = remaining.map(g => {
    const known = findSubject(ctx.subjects, g.inner)
    if (known) return { g, subject: known, score: 100 }
    if (g.inner && g.inner.length <= MAX_SUBJECT && !/[0-9]/.test(g.inner)) {
      const atStart = g.index === 0
      const atEnd = g.index + g.raw.length >= work.trim().length
      // 夹在标题中间的括号通常是注释（如「复习 [重点] 习题」），不当作科目
      if (atStart || atEnd) return { g, subject: null, score: atStart ? 70 : 60 }
    }
    return null
  }).filter(Boolean).sort((a, b) => b.score - a.score)
  if (candidates.length) {
    subject = candidates[0].subject
    subjectName = subject ? subject.name : candidates[0].g.inner
    work = work.replace(candidates[0].g.raw, ' ')
  }
  if (!subjectName) {
    const at = work.match(/[@#]\s*([^\s@#\[\]【】,，;；:：]{1,20})/)
    if (at) { subjectName = at[1].trim(); work = work.replace(at[0], ' ') }
  }
  if (!subjectName) {
    const labeled = work.match(/(?:^|\s)(?:科目|学科)\s*[:：]\s*([^\s:：]{1,20})\s*/)
    if (labeled) { subjectName = labeled[1].trim(); work = work.replace(labeled[0], ' ') }
  }
  if (!subjectName) {
    const prefix = knownSubjectPrefix(work, ctx.subjects)
    if (prefix) {
      subjectName = prefix
      work = work.replace(new RegExp('^' + escapeRegExp(prefix) + '(?:\\s*[:：\\-–—·|,，]\\s*|\\s+)', 'i'), '')
    }
  }
  if (subjectName && !subject) subject = findSubject(ctx.subjects, subjectName)

  // 6) 标题清洗
  let title = work
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—,，;；:：|、·]+/, '')
    .replace(/[\s\-–—,，;；:：|、·]+$/, '')
    .replace(/\s*(?:截止(?:时间|日期)?|ddl)\s*$/i, '')
    .trim()

  if (!title || title.length > MAX_TITLE) {
    return {
      key: 'row-' + index, line: rawLine, title: title || '', subjectName: subjectName || '其他', subjectId: '',
      newSubject: false, deadline: ctx.today + ' 23:59', plannedDate: ctx.today,
      hasDate: !!dateInfo && dateInfo.hasDate !== false, hasSubject: !!subjectName, estimatedMinutes, durationError,
      defaulted: !dateInfo, dateWarning,
      metaText: '', status: 'invalid', tone: 'danger', badge: '无法导入',
      reason: !title ? '没有任务名称' : '任务名称超过 ' + MAX_TITLE + ' 个字',
      importable: false,
    }
  }

  // 7) 截止时间：没写就默认 7 天后；没写日期的任务从今天开始
  let deadline = dateInfo ? dateInfo.deadline : addDays(ctx.today, DEFAULT_DEADLINE_DAYS) + ' 23:59'
  let plannedDate = dateInfo ? dateInfo.date : ctx.today
  if (!dateInfo) warnings.push('没有写截止时间，默认安排在 ' + DEFAULT_DEADLINE_DAYS + ' 天后')
  if (deadline.slice(0, 10) < ctx.today) warnings.push('截止时间已过，导入后会显示为逾期')
  if (plannedDate > deadline.slice(0, 10)) plannedDate = deadline.slice(0, 10)

  if (!subject) {
    if (subjectName && ctx.createSubjects) {
      // 新科目：保留名字，导入时由存储层创建
      subject = { id: '', name: subjectName }
      warnings.push('将新建科目「' + subjectName + '」')
    } else {
      const fallback = ctx.subjects.find(item => item.id === 'other') || ctx.subjects[0] || { id: 'other', name: '其他' }
      if (subjectName) warnings.push('科目「' + subjectName + '」不存在，归入「' + fallback.name + '」')
      subject = { id: fallback.id, name: fallback.name }
    }
  }
  // 同一段文本里后面再出现这个科目名时，按同一个新科目处理
  if (!subject.id && !findSubject(ctx.subjects, subject.name)) ctx.subjects.push({ id: '', name: subject.name })

  // 8) 重复判断：同名 + 同科目 + 同截止时间（忽略空格大小写）
  const dedupeKey = normTitle(title) + '|' + (subject.id || 'name:' + normName(subject.name)) + '|' + deadline
  const sameNameKey = normTitle(title) + '|' + (subject.id || 'name:' + normName(subject.name))
  let duplicateOf = ctx.existingKeys.has(dedupeKey) ? '已有任务' : ''
  if (!duplicateOf && ctx.batchKeys[dedupeKey] != null) duplicateOf = '第 ' + (ctx.batchKeys[dedupeKey] + 1) + ' 行'
  if (!duplicateOf && ctx.existingNames.has(sameNameKey)) warnings.push('已有同名任务，导入后会并存')

  const metaText = subject.name + ' · ' + deadline.slice(5) + (dateInfo ? '' : '（默认）')
  if (duplicateOf) {
    return {
      key: 'row-' + index, line: rawLine, title, subjectName: subject.name, subjectId: subject.id,
      newSubject: !subject.id, deadline, plannedDate, metaText,
      hasDate: !!dateInfo && dateInfo.hasDate !== false, hasSubject: !!subjectName, estimatedMinutes, durationError,
      defaulted: !dateInfo, dateWarning,
      status: 'duplicate', tone: 'muted', badge: '重复',
      reason: duplicateOf === '已有任务' ? '与已有任务重复，导入时跳过' : '与' + duplicateOf + '重复，导入时跳过',
      importable: false,
    }
  }
  ctx.batchKeys[dedupeKey] = index

  return {
    key: 'row-' + index, line: rawLine, title, subjectName: subject.name, subjectId: subject.id,
    newSubject: !subject.id, deadline, plannedDate, metaText,
    hasDate: !!dateInfo && dateInfo.hasDate !== false, hasSubject: !!subjectName, estimatedMinutes, durationError,
    defaulted: !dateInfo, dateWarning,
    status: warnings.length ? 'warn' : 'ok',
    tone: warnings.length ? 'warning' : 'success',
    badge: warnings.length ? '需注意' : '可导入',
    reason: warnings.join('；'),
    importable: true,
  }
}

// ---------- 整段文本 ----------
function parsePlan(text, options) {
  const opts = options || {}
  const ctx = {
    today: validDateKey(opts.today) ? opts.today : dateKeyOf(new Date()),
    subjects: (opts.subjects || []).slice(),
    createSubjects: opts.createSubjects !== false,
    existingKeys: new Set(),
    existingNames: new Set(),
    batchKeys: Object.create(null),
  }
  ;(opts.tasks || []).forEach(t => {
    if (!t || !t.title || !t.deadline) return
    ctx.existingKeys.add(normTitle(t.title) + '|' + (t.subjectId || '') + '|' + t.deadline)
    ctx.existingNames.add(normTitle(t.title) + '|' + (t.subjectId || ''))
  })

  const lines = String(text || '').split(/\r?\n/)
  const rows = []
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*```/.test(lines[i])) continue
    const row = parseLine(lines[i], i, ctx)
    if (row) {
      if (rows.length >= MAX_ROWS) throw new Error('一次最多导入 ' + MAX_ROWS + ' 条任务，请分批粘贴')
      rows.push(row)
    }
  }

  const importable = rows.filter(r => r.importable)
  const newSubjects = []
  importable.forEach(r => {
    if (r.newSubject && r.subjectName && newSubjects.indexOf(r.subjectName) < 0) newSubjects.push(r.subjectName)
  })
  return {
    rows,
    summary: {
      total: rows.length,
      importable: importable.length,
      skipped: rows.length - importable.length,
      warnings: rows.filter(r => r.status === 'warn').length,
      defaulted: importable.filter(r => /（默认）$/.test(r.metaText)).length,
      newSubjects,
      newSubjectsText: newSubjects.join('、'),
    },
  }
}

module.exports = { parsePlan, parseDateToken, normalizeLine, MAX_ROWS, DEFAULT_DEADLINE_DAYS }
