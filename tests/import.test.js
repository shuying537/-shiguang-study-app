// 计划文本解析与批量导入的回归测试
const test = require('node:test')
const assert = require('node:assert/strict')
const { parsePlan } = require('../utils/importPlan.js')

const TODAY = '2026-10-15'
const SUBJECTS = [
  { id: 'other', name: '其他', is_default: true },
  { id: 'math', name: '高等数学' },
  { id: 'english', name: '英语' },
]
const parse = (text, extra) => parsePlan(text, Object.assign({ today: TODAY, subjects: SUBJECTS, tasks: [] }, extra || {}))

test('常见的计划写法都能拆出标题、科目和截止时间', () => {
  const { rows } = parse([
    '完成高数第一章 [高等数学] [2026-10-20 18:00]',
    '- 背 30 个单词 【英语】 10月21日 20:00',
    '复习错题 @数学 明天 晚上8点',
    '1. 整理笔记 后天',
  ].join('\n'))
  assert.equal(rows[0].title, '完成高数第一章')
  assert.equal(rows[0].subjectId, 'math')
  assert.equal(rows[0].deadline, '2026-10-20 18:00')
  assert.equal(rows[0].plannedDate, '2026-10-20')
  assert.equal(rows[0].status, 'ok')

  assert.equal(rows[1].title, '背 30 个单词')
  assert.equal(rows[1].subjectName, '英语')
  assert.equal(rows[1].deadline, '2026-10-21 20:00')

  assert.equal(rows[2].subjectName, '数学')
  assert.equal(rows[2].deadline, '2026-10-16 20:00')

  assert.equal(rows[3].title, '整理笔记')
  assert.equal(rows[3].deadline, '2026-10-17 23:59')
})

test('行首日期、日期在科目后面、纯日期都能处理', () => {
  const { rows } = parse([
    '10/22 19:30 线性代数第三章',
    '完成第二章 [高等数学] 2026-10-25 09:00',
    '写作业 [2026-10-20]',
  ].join('\n'))
  assert.equal(rows[0].title, '线性代数第三章')
  assert.equal(rows[0].deadline, '2026-10-22 19:30')
  assert.equal(rows[1].title, '完成第二章')
  assert.equal(rows[1].subjectId, 'math')
  assert.equal(rows[1].deadline, '2026-10-25 09:00')
  assert.equal(rows[2].title, '写作业')
  assert.equal(rows[2].deadline, '2026-10-20 23:59')
})

test('没写时间的任务从今天开始，7 天后截止', () => {
  const { rows, summary } = parse('线性代数第三章')
  assert.equal(rows[0].title, '线性代数第三章')
  assert.equal(rows[0].deadline, '2026-10-22 23:59')
  assert.equal(rows[0].plannedDate, '2026-10-15')
  assert.match(rows[0].reason, /7 天后/)
  assert.equal(summary.defaulted, 1)
})

test('重复任务会跳过，同一段文本里的重复也能识别', () => {
  const tasks = [{ title: '复习错题', subjectId: 'math', deadline: '2026-10-16 20:00' }]
  const { rows } = parse('复习错题 [高等数学] [2026-10-16 20:00]\n写作业 [2026-10-20]\n写作业 [2026-10-20]', { tasks })
  assert.equal(rows[0].status, 'duplicate')
  assert.equal(rows[0].importable, false)
  assert.match(rows[0].reason, /已有任务/)
  assert.equal(rows[1].status, 'ok')
  assert.equal(rows[2].status, 'duplicate')
  assert.match(rows[2].reason, /第 2 行/)
})

test('缺少的科目默认新建，关闭开关后归入其他', () => {
  const text = '背单词 [法语] 明天\n复习动词 [法语] 后天'
  const created = parse(text)
  assert.equal(created.rows[0].subjectName, '法语')
  assert.deepEqual(created.summary.newSubjects, ['法语'])
  assert.match(created.rows[0].reason, /将新建科目/)
  assert.equal(created.rows[1].subjectName, '法语')

  const fallback = parse(text, { createSubjects: false })
  assert.equal(fallback.rows[0].subjectName, '其他')
  assert.match(fallback.rows[0].reason, /归入「其他」/)
  assert.deepEqual(fallback.summary.newSubjects, [])
})

test('没写科目归入其他；不像任务的行无法导入', () => {
  const { rows } = parse('直接开始学习 [2026-10-18 20:00]\n[2026-10-20]\n   ')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].subjectName, '其他')
  assert.equal(rows[0].status, 'ok')
  assert.equal(rows[1].status, 'invalid')
  assert.equal(rows[1].importable, false)
})

test('已经过去的截止时间和看不懂的日期都会先提示', () => {
  const past = parse('补交作业 [其他] [2026-10-01 20:00]')
  assert.match(past.rows[0].reason, /已过/)
  assert.equal(past.rows[0].importable, true)

  const broken = parse('复习 [2026-02-30 20:00]')
  assert.match(broken.rows[0].reason, /没能识别日期/)
})

test('夹在标题中间的括号不会被误认成科目', () => {
  const { rows } = parse('复习 [重点内容] 习题')
  assert.equal(rows[0].title, '复习 [重点内容] 习题')
  assert.equal(rows[0].subjectName, '其他')
})

test('开头的小数和日期不会被当成列表编号吃掉', () => {
  const { rows } = parse('1.5 小时背单词\n10.20 复习')
  assert.equal(rows[0].title, '1.5 小时背单词')
  assert.equal(rows[1].title, '10.20 复习')
})

// ---------- 存储层：批量导入 ----------
const memory = {}
global.wx = {
  getStorageSync(key) { return memory[key] === undefined ? '' : JSON.parse(JSON.stringify(memory[key])) },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)) },
  removeStorageSync(key) { delete memory[key] },
}
const store = require('../utils/store.js')

test('批量导入只创建一次科目、自动补计划日期并记录导入摘要', () => {
  store.clearAll()
  const start = store.dateKey(), deadline = store.addDays(start, 3) + ' 20:00'
  const result = store.importTasks([
    { title: '背单词', subjectName: '法语', deadline, plannedDate: start },
    { title: '背单词', subjectName: '法语', deadline, plannedDate: start },
    { title: '', subjectName: '法语', deadline },
  ], { createSubjects: true })
  assert.equal(result.added.length, 1)
  assert.equal(result.created.length, 1)
  assert.equal(result.skipped.length, 2)
  const d = store.getData()
  assert.equal(d.tasks.length, 1)
  assert.equal(d.tasks[0].needsFill, false)
  assert.equal(d.tasks[0].source, 'import')
  assert.equal(d.tasks[0].plannedDate, start)
  assert.equal(d.subjects.filter(s => s.name === '法语').length, 1)
  assert.equal(d.imports.length, 1)
  assert.equal(d.imports[0].taskCount, 1)
})

test('关闭自动创建科目时，导入任务归入其他', () => {
  store.clearAll()
  const result = store.importTasks([
    { title: '背单词', subjectName: '法语', deadline: store.addDays(store.dateKey(), 1) + ' 20:00' },
  ], { createSubjects: false })
  assert.equal(result.added[0].subjectId, 'other')
  assert.equal(store.getData().subjects.length, 1)
})

test('导入保存预计时长，非法时长和日期不会顺带创建空科目', () => {
  store.clearAll()
  const deadline=store.addDays(store.dateKey(),1)+' 20:00'
  const result=store.importTasks([
    {title:'练习',subjectName:'数学',deadline,estimatedMinutes:45},
    {title:'坏时长',subjectName:'不应创建一',deadline,estimatedMinutes:32},
    {title:'坏日期',subjectName:'不应创建二',deadline:'2026-02-30 20:00',estimatedMinutes:30},
    {title:'旧格式',subjectId:'other',deadline},
  ])
  assert.deepEqual(result.added.map(t=>t.estimatedMinutes),[45,null])
  assert.equal(result.skipped.length,2)
  assert.deepEqual(result.created.map(s=>s.name),['数学'])
  assert.equal(store.getData().records.length,0,'预计时长不会生成实际学习记录')
  assert.equal(store.undoImport().removed,2)
})
