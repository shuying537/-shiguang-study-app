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

test('jsdom: 启动渲染、tab 切换、快记与撤销、主题切换', async () => {
  const dom = new JSDOM('<div id="app"></div><div id="tabbar" hidden></div>', {
    url: 'https://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  })
  const w = dom.window
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
