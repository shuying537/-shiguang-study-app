// 构建脚本：把小程序源码打包成 www/（浏览器与 Capacitor WebView 可直接运行）
// 输入：app.json/app.js/app.wxss + pages/*.{js,wxml,wxss} + utils/*.js
// 输出：www/index.html + www/style.css + www/bundle.js + www/runtime.js + www/runtime-web.js
// bundle 用最小模块注册表：CommonJS require 相对路径按模块目录解析，Page/App 由全局捕获。
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('.', import.meta.url))
const { css } = createRequire(import.meta.url)('./tools/runtime.js') // 复用 rpx→vw / page→body 转换

const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'))
const pages = appJson.pages

// ---------- 模块收集（id 即小程序路径） ----------
const modules = new Map()
modules.set('app', readFileSync(join(root, 'app.js'), 'utf8'))
for (const page of pages) modules.set(page, readFileSync(join(root, page + '.js'), 'utf8'))
for (const part of ['store', 'ui', 'charts']) {
  const p = join(root, 'utils', part + '.js')
  if (existsSync(p)) modules.set('utils/' + part, readFileSync(p, 'utf8'))
}

// ---------- 模板 ----------
const templates = {}
for (const page of pages) templates[page] = readFileSync(join(root, page + '.wxml'), 'utf8')

// ---------- 样式：基础 + app.wxss + 各页 wxss ----------
const baseCss = `/* 网页运行时基础样式（build-web.mjs 生成） */
html,body{margin:0;padding:0;height:100%;box-sizing:border-box}
*,*::before,*::after{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;background:#f7f7fc}
body[data-theme=dark]{background:#191823}
button{font-family:inherit;border:0;background:none;padding:0;margin:0;cursor:pointer}
input,textarea,select{font-family:inherit;outline:0;border:0;padding:0;margin:0;background:transparent;color:inherit}
#app{height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;position:relative}
.no-scroll-input::-webkit-inner-spin-button,.no-scroll-input::-webkit-outer-spin-button{-webkit-appearance:none}
/* 横向滚动 scroll-view */
.wx-scroll-x{overflow-x:auto;-webkit-overflow-scrolling:touch}
/* 画布 */
.wx-canvas{display:block}
/* tabBar（颜色随 body[data-theme] 切换，由 refresh 写入） */
body{--bar-bg:#FFFFFF;--bar-line:#EEEDF5;--bar-fg:#9694A6;--bar-focus:#7061D8}
body[data-theme=dark]{--bar-bg:#252433;--bar-line:#373444;--bar-fg:#AAA5BC;--bar-focus:#AD9AFF}
#tabbar{position:fixed;left:0;right:0;bottom:0;display:flex;height:58px;padding-bottom:env(safe-area-inset-bottom);background:var(--bar-bg);border-top:1px solid var(--bar-line);z-index:100}
.wx-tab{flex:1;background:none;border:0;font-size:14px;color:var(--bar-fg)}
.wx-tab.active{color:var(--bar-focus);font-weight:600}
/* toast */
.wx-toast{position:fixed;left:50%;bottom:140px;transform:translateX(-50%);background:rgba(30,28,42,.92);color:#fff;padding:12px 20px;border-radius:12px;font-size:14px;max-width:80vw;z-index:1000;opacity:0;transition:opacity .25s;pointer-events:none}
.wx-toast.show{opacity:1}
.wx-toast-success::before{content:"✓ ";font-weight:700}
/* modal */
body{--modal-bg:#FFFFFF;--modal-ink:#282438;--modal-line:#EEEDF5;--modal-focus:#7061D8;--modal-muted:#9694A6}
body[data-theme=dark]{--modal-bg:#252433;--modal-ink:#EDEAF8;--modal-line:#373444;--modal-focus:#AD9AFF;--modal-muted:#AAA5BC}
.wx-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000}
.wx-modal-box{width:300px;max-width:86vw;background:var(--modal-bg);color:var(--modal-ink);border-radius:16px;overflow:hidden}
.wx-modal-title{font-size:16px;font-weight:600;text-align:center;padding:22px 20px 6px}
.wx-modal-content{font-size:14px;color:var(--modal-muted);text-align:center;padding:8px 20px 4px;line-height:1.6}
.wx-modal-content:empty{padding:8px 20px 0}
.wx-modal-btns{display:flex;border-top:1px solid var(--modal-line);margin-top:18px}
.wx-modal-btn{flex:1;padding:14px 0;background:none;color:var(--modal-muted);font-size:15px;border-right:1px solid var(--modal-line)}
.wx-modal-btn:last-child{border-right:0}
.wx-modal-btn-main{color:var(--modal-focus);font-weight:600}
/* switch（input type=checkbox 外观模拟） */
input.wx-switch{position:relative;width:52px;height:32px;border-radius:16px;background:#D7D5E0;transition:background .2s;-webkit-appearance:none;appearance:none}
input.wx-switch::before{content:"";position:absolute;top:2px;left:2px;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s}
input.wx-switch:checked{background:#7061D8}
body[data-theme=dark] input.wx-switch:checked{background:#AD9AFF}
input.wx-switch:checked::before{left:22px}
/* picker：children 正常显示，原生控件透明覆盖接收交互 */
.wx-picker-wrap{position:relative;display:block}
.wx-picker-display{pointer-events:none}
.wx-picker-native-select,.wx-picker-native-input{position:absolute;inset:0;width:100%;height:100%;opacity:.001;border:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
`
let style = baseCss + css(readFileSync(join(root, 'app.wxss'), 'utf8')) + '\n'
for (const page of pages) style += css(readFileSync(join(root, page + '.wxss'), 'utf8')) + '\n'

// ---------- bundle.js ----------
const moduleDefs = [...modules.entries()]
  .map(([id, src]) => `__define(${JSON.stringify(id)}, function (module, exports, require) {\n${src}\n})`)
  .join('\n')
const loadCalls = ['load("app")', ...pages.map(p => `load(${JSON.stringify(p)})`)].join('\n')

const bundle = `// 产物：勿手改（由 build-web.mjs 生成）
(function () {
  'use strict'
  var __modules = {}, __cache = {}, __cur = ''
  function __define(id, fn) { __modules[id] = fn }
  window.__mini = { app: null, pages: {}, templates: ${JSON.stringify(templates)}, startRoute: ${JSON.stringify(pages[0])} }
  function resolveId(base, spec) {
    if (spec.charAt(0) !== '.') return spec
    var parts = base.split('/'), tail = spec.split('/')
    parts.pop() // 模块目录
    for (var i = 0; i < tail.length; i++) {
      var t = tail[i]
      if (t === '' || t === '.') continue
      if (t === '..') parts.pop()
      else parts.push(t)
    }
    return parts.join('/')
  }
  window.Page = function (cfg) { window.__mini.pages[__cur] = cfg } // 模块加载时捕获其页面配置
  window.App = function (cfg) { window.__mini.app = cfg }
  function load(id) {
    if (__cache[id]) return __cache[id].exports
    var m = __cache[id] = { exports: {} }
    var prev = __cur
    __cur = id // 还原调用链，否则 Page() 会被注册到最后一个 require 的模块 id 下
    __modules[id](m, m.exports, function (spec) { return load(resolveId(id, spec)) })
    __cur = prev
    return m.exports
  }
${moduleDefs}
${loadCalls}
  window.__mini.app.tabBar = ${JSON.stringify(appJson.tabBar)}
  window.__wxboot(window.__mini)
})()
`

// ---------- 写入 www/ ----------
const out = join(root, 'www')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="format-detection" content="telephone=no">
<title>拾光 · 学习记录</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="app"></div>
<div id="tabbar" hidden></div>
<script src="runtime.js"></script>
<script src="runtime-web.js"></script>
<script src="bundle.js"></script>
</body>
</html>
`)
writeFileSync(join(out, 'style.css'), style)
writeFileSync(join(out, 'bundle.js'), bundle)
copyFileSync(join(root, 'tools', 'runtime.js'), join(out, 'runtime.js'))
copyFileSync(join(root, 'tools', 'runtime-web.js'), join(out, 'runtime-web.js'))
console.log('built www/:', pages.length, 'pages,', modules.size, 'modules,', Object.keys(templates).length, 'templates')
