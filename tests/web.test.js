// 网页运行时测试：模板解析、bundle 注册、jsdom 全链路（启动→交互→存储）
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { JSDOM } = require('jsdom')

process.env.TZ = 'Asia/Shanghai'
const root = path.resolve(__dirname, '..')
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8').replace(/^﻿/, ''))
const runtime = require('../tools/runtime.js')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')

test('runtime core: 真实模板可解析且渲染不出残留占位符', () => {
  for (const page of app.pages) {
    const nodes = runtime.parse(read(page + '.wxml'))
    assert.ok(nodes.length > 0, page + ': empty template')
  }
  assert.equal(runtime.parse('<view><text>a</text></view>').length, 1)
  assert.throws(() => runtime.parse('<view><text>x</view>'), /Unbalanced/)
  assert.equal(runtime.evaluate('a+b', { a: 1, b: 2 }), 3)
  assert.equal(runtime.valueOf('{{x}}', { x: 7 }), 7)
  assert.equal(runtime.valueOf('plain', {}), 'plain')
  assert.equal(runtime.truth('{{n}}', { n: 0 }), false)
  assert.equal(runtime.interpolate('{{missing}}ok', {}), 'ok') // undefined 渲染为空
  assert.equal(runtime.css('page{width:750rpx}'), 'body{width:calc(100vw * 750 / 750)}')
})

test('bundle: 模块注册与 require 相对路径解析', () => {
  const bundle = read('www/bundle.js')
  assert.doesNotThrow(() => new Function(bundle))
  const ctx = { console, Date, JSON, Math, setTimeout, clearTimeout, Number, String, Boolean, Object, Array, RegExp, parseFloat }
  ctx.window = ctx
  ctx.__wxboot = () => {}
  vm.runInNewContext(bundle, ctx)
  const mini = ctx.__mini
  assert.deepEqual(Object.keys(mini.pages).sort(), [...app.pages].sort())
  assert.equal(mini.pages['pages/list/list'].pagePath, undefined) // 页面配置直接是 Page() 参数
  assert.ok(mini.app && mini.app.tabBar)
  assert.equal(mini.app.tabBar.list.length, 3)
  assert.deepEqual(Object.keys(mini.templates).sort(), [...app.pages].sort())
})

test('jsdom: 启动渲染、tab 切换、快记与撤销、主题切换', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js')) // 末尾自动 __wxboot → 首页

  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 20))

  // 首页渲染 + tabBar
  assert.ok(q('.screen.home-page'), 'home should render')
  assert.ok(appEl.textContent.includes('今天，积累一点。'))
  assert.match(q('.eyebrow').textContent, /\d+月\d+日 ·/)
  const tabs = [...w.document.querySelectorAll('#tabbar .wx-tab')]
  assert.deepEqual(tabs.map(t => t.textContent), ['首页', '计划', '我的'])
  assert.ok(tabs[0].classList.contains('active'))

  // 快记 +0.5 → 存储变化 → 撤销
  q('[data-minutes="30"]').click()
  await tick()
  assert.equal(JSON.parse(w.localStorage.getItem('study_tracker_data_v12')).records.length, 1)
  assert.ok(q('.quick-footer:not([hidden])').textContent.includes('撤销'), 'undo button')
  q('.quick-footer .plain-btn').click()
  await tick()
  assert.equal(JSON.parse(w.localStorage.getItem('study_tracker_data_v12')).records.length, 0)

  // 切到计划页 → 切回首页（实例复用 + onHide/onShow）
  tabs[1].click()
  await tick()
  assert.ok(q('.screen.task-page'), 'list page renders')
  w.document.getElementById('tabbar').querySelectorAll('.wx-tab')[0].click()
  await tick()
  assert.ok(q('.screen.home-page'), 'back home')

  // 我的页 → 展开偏好 → 主题切换（表格 switch → 深色）
  w.document.getElementById('tabbar').querySelectorAll('.wx-tab')[2].click()
  await tick()
  assert.ok(q('.screen.settings-page'), 'settings renders')
  const pref = [...appEl.querySelectorAll('.setting-row')].find(r => r.textContent.includes('外观与页面提醒'))
  assert.ok(pref, 'preferences row')
  pref.click()
  await tick()
  const sw = q('input.wx-switch')
  sw.checked = true
  sw.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick()
  assert.equal(w.document.body.dataset.theme, 'dark')
  assert.ok(q('.screen.dark'), 'dark class applied')

  // 存储与实例数据一致（无残留 {{ }}）
  assert.ok(!appEl.innerHTML.includes('{{'), 'no unresolved bindings')
  assert.ok(!appEl.innerHTML.includes('undefined'), 'no undefined text')
})

// 计划页「＋」→ 任务表单：之前科目数组还是空的时候取 .name 抛异常，整页只剩一个空 div
test('jsdom: 计划页点 + 打开任务表单不会空白，返回后计划页仍在', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 30))

  w.document.querySelectorAll('#tabbar .wx-tab')[1].click()
  await tick()
  q('.mini-add').click()
  await tick()
  assert.ok(q('.screen.form-page'), 'task form should render')
  assert.equal(q('.title').textContent, '安排一件小事')
  assert.match(w.location.hash, /pages\/task\/task/)
  assert.ok(q('.wx-picker-display').textContent.includes('其他'), 'subject picker has data')
  assert.ok(!appEl.innerHTML.includes('{{'), 'no unresolved bindings')

  w.history.back()
  await tick()
  assert.ok(q('.screen.task-page'), 'back to plan page')

  w.wx.navigateTo({ url: '/pages/record/record' })
  await tick()
  assert.ok(q('.screen.form-page'), 'record form should render')
  assert.equal(q('.title').textContent, '记下一段学习')
})

// 导入页全链路：粘贴 → 解析预览 → 确认导入（缺少的科目自动创建，无效行跳过）
test('jsdom: 文本导入从预览到写入，自动创建科目并跳过无效行', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 30))

  const d = new Date(); d.setDate(d.getDate() + 2)
  const pad = n => String(n).padStart(2, '0')
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  w.wx.navigateTo({ url: '/pages/import/import' })
  await tick()
  const area = q('.import-area')
  assert.ok(area, 'import textarea renders')
  area.value = `- 背 30 个单词 [英语] ${day} 20:00\n[2026-10-20]`
  area.dispatchEvent(new w.Event('input', { bubbles: true }))
  await tick()
  q('.parse-btn').click()
  await tick()
  assert.equal(appEl.querySelectorAll('.preview-row').length, 2, 'two preview rows')
  assert.match(q('.section-head').textContent, /可导入 1/)
  assert.ok(q('.preview-section').textContent.includes('将新建科目：英语'))

  // 预览里手动改标题：编辑 → 输入 → 完成
  q('.row-tools .link').click()
  await tick()
  const editInput = q('.edit-input')
  assert.ok(editInput, 'inline editor shown')
  editInput.value = '背 50 个单词'
  editInput.dispatchEvent(new w.Event('input', { bubbles: true }))
  await tick()
  const editButtons = appEl.querySelectorAll('.preview-edit .plain-btn')
  editButtons[1].click()
  await tick()
  assert.equal(q('.preview-title').textContent, '背 50 个单词')
  assert.equal(q('.badge').textContent, '已修改')

  q('.preview-section .primary').click()
  await tick()
  const saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.tasks.length, 1)
  assert.equal(saved.tasks[0].title, '背 50 个单词')
  assert.equal(saved.tasks[0].needsFill, false)
  assert.ok(saved.subjects.some(s => s.name === '英语'))
  assert.equal(saved.imports.length, 1)
  assert.ok(w.localStorage.getItem('study_tracker_data_v12_backup'), 'automatic backup written')
})

// 备份页：粘贴 JSON → 确认 → 覆盖当前数据
test('jsdom: 备份页可以粘贴 JSON 恢复数据', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 30))

  w.wx.navigateTo({ url: '/pages/backup/backup' })
  await tick()
  assert.ok(q('.backup-page'), 'backup page renders')
  const areas = appEl.querySelectorAll('.backup-area')
  assert.equal(areas.length, 2, 'export and import textareas')
  const backup = {
    schema: 3,
    subjects: [{ id: 'other', name: '其他', color: '#A5A0B7', is_default: true }],
    archivedSubjects: [], tasks: [], imports: [],
    records: [{ id: 'from-backup', subjectId: 'other', date: '2026-10-15', duration: 60, note: '来自备份', createdAt: '2026-10-15T04:00:00.000Z' }],
    settings: { theme: 'light' }, revision: 5,
  }
  areas[1].value = JSON.stringify(backup)
  areas[1].focus()
  areas[1].dispatchEvent(new w.Event('input', { bubbles: true }))
  await tick()
  assert.equal(w.document.activeElement, appEl.querySelectorAll('.backup-area')[1], 'focus stays in import textarea')
  q('.backup-page .primary').click()
  await tick()
  const mask = w.document.querySelector('.wx-modal-mask')
  assert.ok(mask, 'confirm modal shown')
  mask.querySelector('.wx-modal-btn-main').click()
  await tick()
  const saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.records.length, 1)
  assert.equal(saved.records[0].note, '来自备份')
})

// 首次使用：首页卡片 → 三分钟上手 → 目标/科目 → 回到首页看到倒计时
test('jsdom: 三分钟上手生成目标和科目，首页出现倒计时', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 40))

  assert.ok(q('.onboard-card'), 'first-run card on empty home')
  q('.onboard-card .primary').click()
  await tick()
  assert.ok(q('.onboarding-page'), 'onboarding page renders')

  const title = q('input[data-field="goalTitle"]')
  title.value = '期末考试'
  title.dispatchEvent(new w.Event('input', { bubbles: true }))
  const date = q('input[type="date"]')
  date.value = '2026-12-20'
  date.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick()
  q('.onboarding-page .primary').click()
  await tick()

  assert.ok(q('.subject-chip'), 'subject chips shown')
  q('.subject-chip').click()
  await tick()
  q('.onboarding-page .primary').click()
  await tick()
  q('.onboarding-page .primary').click()
  await new Promise(r => setTimeout(r, 700))

  const saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.settings.onboarded, true)
  assert.equal(saved.goals.length, 1)
  assert.equal(saved.goals[0].title, '期末考试')
  assert.ok(saved.subjects.some(s => s.name === '数学'))
  assert.ok(q('.screen.home-page'), 'back on home')
  assert.ok(q('.goal-card'), 'goal countdown card on home')
  assert.ok(!q('.onboard-card'), 'first-run card gone')
})

// 目标页：添加目标 → 列表出现 → 删除
test('jsdom: 目标页可以添加和删除目标', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 40))

  w.wx.navigateTo({ url: '/pages/goals/goals' })
  await tick()
  assert.ok(q('.goals-page'), 'goals page renders')
  const title = q('input[data-field="title"]')
  title.value = '期末考试'
  title.dispatchEvent(new w.Event('input', { bubbles: true }))
  const date = q('input[type="date"]')
  date.value = '2026-12-20'
  date.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick()
  q('.goals-page .primary').click()
  await tick()
  let saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.goals.length, 1)
  assert.equal(saved.goals[0].title, '期末考试')
  assert.ok(q('.goal-row'), 'goal row rendered')

  q('.goal-row .danger-text').click()
  await tick()
  const mask = w.document.querySelector('.wx-modal-mask')
  assert.ok(mask, 'confirm modal shown')
  mask.querySelector('.wx-modal-btn-main').click()
  await tick()
  saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.goals.length, 0)
})

// 周复盘页：写三项 → 保存 → 存储
test('jsdom: 每周复盘可以填写并保存', async (t) => {  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 40))

  w.wx.navigateTo({ url: '/pages/review/review' })
  await tick()
  assert.ok(q('.review-page'), 'review page renders')
  const areas = appEl.querySelectorAll('textarea')
  assert.equal(areas.length, 3, 'three reflection fields')
  areas[0].value = '早上效率最高'
  areas[0].dispatchEvent(new w.Event('input', { bubbles: true }))
  await tick()
  q('.review-page .primary').click()
  await tick()
  const saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.reviews.length, 1)
  assert.equal(saved.reviews[0].worked, '早上效率最高')
})

// 备份页：选择 JSON 文件 → 读入文本 → 恢复
test('jsdom: 备份页可以从文件读取并恢复', async (t) => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
  })
  const w = dom.window
  t.after(() => dom.window.close())
  w.eval(read('tools/runtime.js'))
  w.eval(read('tools/runtime-web.js'))
  w.eval(read('www/bundle.js'))
  const appEl = w.document.getElementById('app')
  const q = sel => appEl.querySelector(sel)
  const tick = () => new Promise(r => setTimeout(r, 100))

  w.wx.navigateTo({ url: '/pages/backup/backup' })
  await tick()
  const backup = {
    schema: 3,
    subjects: [{ id: 'other', name: '其他', color: '#A5A0B7', is_default: true }],
    archivedSubjects: [], tasks: [], imports: [], goals: [], reviews: [],
    records: [{ id: 'file-record', subjectId: 'other', date: '2026-10-15', duration: 30, note: '从文件恢复', createdAt: '2026-10-15T04:00:00.000Z' }],
    settings: { theme: 'light', onboarded: true }, revision: 2,
  }
  const input = q('input.file-input')
  assert.ok(input, 'file input rendered')
  const file = new w.File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new w.Event('change', { bubbles: true }))
  await tick()
  const areas = appEl.querySelectorAll('.backup-area')
  assert.ok(areas[1].value.includes('file-record'), 'file content read into textarea')
  q('.backup-page .primary').click()
  await tick()
  const mask = w.document.querySelector('.wx-modal-mask')
  assert.ok(mask, 'confirm modal shown')
  mask.querySelector('.wx-modal-btn-main').click()
  await tick()
  const saved = JSON.parse(w.localStorage.getItem('study_tracker_data_v12'))
  assert.equal(saved.records.length, 1)
  assert.equal(saved.records[0].note, '从文件恢复')
})
