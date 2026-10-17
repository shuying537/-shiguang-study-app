// 网页运行时（浏览器部分）：把 WXML AST 渲染成真实 DOM、绑定事件、提供 wx API shim、hash 路由
// 与 node 版 tools/runtime.js 的解析/求值语义一致（window.__miniwx 提供）。
// 数据契约：构建脚本生成的 www/bundle.js 挂载 window.__mini = { app, pages, templates }。
(function () {
  'use strict'
  const { parse, evaluate, interpolate, truth, valueOf } = window.__miniwx

  // ---------- 主题 ----------
  const THEME_KEY = 'wx_theme'
  function systemTheme() {
    try { return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light' } catch { return 'light' }
  }
  function getTheme() {
    let saved = null
    try { saved = localStorage.getItem(THEME_KEY) } catch { }
    return saved || systemTheme()
  }

  // ---------- wx API shim ----------
  let pendingRequests = []
  function showToast(o) {
    if (typeof o === 'string') o = { title: o }
    const el = document.createElement('div')
    el.className = 'wx-toast' + (o.icon === 'success' ? ' wx-toast-success' : '')
    el.textContent = o.title || ''
    document.body.appendChild(el)
    setTimeout(() => el.classList.add('show'), 10)
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300) }, o.duration || 2000)
  }
  function showModal(o) {
    const overlay = document.createElement('div')
    overlay.className = 'wx-modal-mask'
    const box = document.createElement('div')
    box.className = 'wx-modal-box'
    const title = document.createElement('div')
    title.className = 'wx-modal-title'
    title.textContent = o.title || '提示'
    const content = document.createElement('div')
    content.className = 'wx-modal-content'
    content.textContent = o.content || ''
    const btns = document.createElement('div')
    btns.className = 'wx-modal-btns'
    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'wx-modal-btn'
    cancelBtn.textContent = o.cancelText || '取消'
    const okBtn = document.createElement('button')
    okBtn.className = 'wx-modal-btn wx-modal-btn-main'
    okBtn.textContent = o.confirmText || '确定'
    btns.appendChild(cancelBtn); btns.appendChild(okBtn)
    box.appendChild(title); box.appendChild(content); box.appendChild(btns)
    overlay.appendChild(box)
    const done = (confirm) => { overlay.remove(); if (confirm) { o.success && o.success({ confirm: true }) } else { o.cancel && o.cancel() } }
    cancelBtn.onclick = () => done(false)
    okBtn.onclick = () => done(true)
    document.body.appendChild(overlay)
  }

  const wx = {
    getStorageSync(key) {
      try { const raw = localStorage.getItem(key); return raw === null ? '' : JSON.parse(raw) } catch { return '' }
    },
    setStorageSync(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)) } catch { }
    },
    removeStorageSync(key) { try { localStorage.removeItem(key) } catch { } },
    getSystemInfoSync() { return { pixelRatio: window.devicePixelRatio || 1, windowWidth: window.innerWidth, windowHeight: window.innerHeight } },
    getAppBaseInfo() { return { theme: getTheme() } },
    onThemeChange() { },
    setNavigationBarColor() { },
    setTabBarStyle() { },
    showToast,
    hideToast() { },
    showLoading(o) { showToast(typeof o === 'string' ? { title: o, duration: 9999 } : { title: (o && o.title) || '', duration: 9999 }) },
    hideLoading() { },
    showModal,
    setClipboardData(o) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(o.data).then(() => o.success && o.success(), () => o.fail && o.fail())
      } else {
        const ta = document.createElement('textarea')
        ta.value = o.data; document.body.appendChild(ta); ta.select()
        document.execCommand('copy'); ta.remove()
        o.success && o.success()
      }
    },
    navigateTo(o) { goto(o.url.replace(/^\//, ''), 'navigate') },
    switchTab(o) { goto(o.url.replace(/^\//, ''), 'tab') },
    redirectTo(o) { goto(o.url.replace(/^\//, ''), 'redirect') },
    navigateBack(o) {
      if (window.history.length > 1) window.history.back()
      else { popEntry(); }
      setTimeout(() => { /* 返回动画后因历史栈清空而触发 popstate */ }, 0)
      o && o.success && o.success()
    },
    pageScrollTo(o) {
      const el = document.querySelector(o.selector || '')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    nextTick(fn) { setTimeout(fn, 0) },
    stopPullDownRefresh() { },
    vibrateShort() { },
    // 查询：兼容 charts.js data.js 用的 .in().select('#id').fields({node:true,size:true}).exec(cb)
    // 与 .in().select('#trend').boundingClientRect(fn).exec(cb)
    createSelectorQuery() {
      const q = { _page: null, _isQueryVisible: 0 }
      const chain = {
        in(page) { q._page = page; return chain },
        select(sel) { q._sel = sel; return chain },
        fields(opts) { q._opts = opts; return chain },
        boundingClientRect(fn) { q._rectFn = fn; return chain },
        exec(cb) {
          const root = (q._page && q._page._el) || document
          const el = root.querySelector(q._sel || '')
          if (!el) { cb && cb([]); return }
          const r = el.getBoundingClientRect()
          const item = { width: r.width, height: r.height, top: r.top, left: r.left, node: el }
          if (q._opts && q._opts.node) item.node = el
          q._rectFn && q._rectFn(item)
          cb && cb([item])
          return chain
        },
      }
      return chain
    },
  }
  window.wx = wx

  // ---------- AST → DOM ----------
  const TAG_MAP = { view: 'div', text: 'span', 'scroll-view': 'div', block: 'div', picker: 'div' }
  const WXEVENT = /^(?:bind|catch)([a-z]+):?/i
  const EV_TYPES = { tap: 'click', input: 'input', change: 'change', confirm: 'keydown', blur: 'blur', focus: 'focus', longpress: 'click' }

  function interpolateAttr(v, sc) { return interpolate(v, sc) }

  function nodeToEl(node, sc, page) {
    const attrs = node.attrs || {}
    let el
    const tag = node.tag
    if (tag === 'picker') el = pickerToEl(node, sc, page)
    else if (tag === 'switch') el = document.createElement('input')
    else if (tag === 'canvas') el = document.createElement('canvas')
    else if (tag === 'input') el = document.createElement('input')
    else if (tag === 'textarea') el = document.createElement('textarea')
    else if (tag === 'button') el = document.createElement('button')
    else if (tag === 'block') return null // block 是透明容器：由上层合并 children
    else el = document.createElement(TAG_MAP[tag] || tag)
    if (tag === 'switch') {
      el.type = 'checkbox'; el.className = 'wx-switch'
      if (truth(attrs.checked, sc)) el.checked = true
    }
    if (tag === 'scroll-view' && truth(attrs['scroll-x'], sc)) el.classList.add('wx-scroll-x')
    if (tag === 'canvas') { el.classList.add('wx-canvas'); if (attrs['type'] && String(attrs.type).includes('2d')) el.dataset.type2d = '1' }

    // 属性
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith('wx:') || k.startsWith('bind') || k.startsWith('catch') || k === 'focus' || k === 'mode' || k === 'range' || k === 'range-key' || k === 'start' || k === 'end' || k === 'scroll-x' || k === 'scroll-y' || k === 'confirm-type' || k === 'cursor-spacing' || k === 'show-value' || k === 'aria-label') continue
      if (k === 'value') { el.value = interpolateAttr(v, sc); continue }
      if (k === 'checked') { if (truth(v, sc)) el.checked = true; continue }
      if (k === 'disabled') { if (truth(v, sc)) el.disabled = true; continue }
      if (k === 'selected') { if (truth(v, sc)) el.selected = true; continue }
      if (k === 'maxlength') { el.maxLength = Number(interpolateAttr(v, sc)); continue }
      if (k === 'placeholder') { el.placeholder = interpolateAttr(v, sc); continue }
      if (k === 'type' && tag === 'input') { el.type = interpolateAttr(v, sc) || 'text'; continue }
      if (k === 'name' && tag === 'input') { el.name = interpolateAttr(v, sc); continue }
      if (k === 'data-field') { el.dataset.field = interpolateAttr(v, sc); continue }
      if (k === 'aria-label') { el.setAttribute('aria-label', interpolateAttr(v, sc)); continue }
      el.setAttribute(k, interpolateAttr(v, sc))
    }
    // focus="{{true}}" → 渲染后自动聚焦（subjects 编辑输入框）
    if (tag === 'input' && attrs.focus !== undefined && truth(attrs.focus, sc)) el.dataset.autoFocus = '1'
    // class/style 属性在循环中已处理；绑定事件
    for (const [k, v] of Object.entries(attrs)) {
      const m = k.match(WXEVENT)
      if (!m) continue
      const type = m[1]
      const domType = EV_TYPES[type]
      if (!domType) continue
      const fn = page && typeof page[v] === 'function' ? page[v].bind(page) : null
      if (!fn) continue
      const dataset = Object.fromEntries(Object.keys(attrs).filter(k2 => k2.startsWith('data-')).map(k2 => [k2.slice(5), interpolateAttr(attrs[k2], sc)]))
      const listener = (e) => {
        if (k.startsWith('catch')) e.stopPropagation()
        const detail = {}
        if (type === 'tap' || type === 'longpress') {
          // 与 data.js trendTap 的 e.detail.x-rect.left 保持同一坐标系：viewport 坐标
          detail.x = e.clientX; detail.y = e.clientY
          if (type === 'longpress') detail.action = 'longpress'
        } else if (type === 'input' || type === 'confirm' || type === 'blur') detail.value = e.target.value
        else if (type === 'change') detail.value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
        const evObj = { currentTarget: { dataset }, target: { dataset }, detail, stopPropagation: () => e.stopPropagation() }
        if (type === 'confirm') { if (e.key && e.key !== 'Enter') return }
        fn(evObj)
      }
      el.addEventListener(domType, listener)
    }
    return el
  }

  // picker：显示 children；用透明原生控件覆盖接收交互；change→detail.value
  function pickerToEl(node, sc, page) {
    const wrap = document.createElement('div')
    wrap.className = 'wx-picker-wrap'
    const display = document.createElement('div')
    display.className = 'wx-picker-display'
    wrap.appendChild(display)
    // children 渲染进 display（picker 盒子的可见内容）
    const kids = renderNodes(node.children || [], sc, page)
    for (const c of kids) display.appendChild(c)
    const attrs = node.attrs || {}
    const mode = attrs.mode || 'selector'
    const bindChange = Object.entries(attrs).find(([k]) => k.startsWith('bindchange') || k.startsWith('catchchange'))
    const onchange = (value) => {
      const fn = page && bindChange && typeof page[bindChange[1]] === 'function' ? page[bindChange[1]] : null
      if (fn) fn.call(page, { currentTarget: { dataset: {} }, detail: { value } })
    }
    if (mode === 'selector' && attrs.range) {
      const items = valueOf(attrs.range, sc) || []
      const idx = Math.max(0, Number(attrs.value !== undefined ? valueOf(attrs.value, sc) : 0) || 0)
      const key = attrs['range-key']
      const sel = document.createElement('select')
      sel.className = 'wx-picker-native-select'
      items.forEach((item, i) => {
        const opt = document.createElement('option')
        opt.value = String(i)
        opt.textContent = String(key && item[key] !== undefined ? item[key] : item)
        if (i === idx) opt.selected = true
        sel.appendChild(opt)
      })
      elChange(sel, () => onchange(Number(sel.value)))
      wrap.appendChild(sel)
    } else if (mode === 'date' || mode === 'time') {
      const input = document.createElement('input')
      input.type = mode === 'date' ? 'date' : 'time'
      if (attrs.value !== undefined) input.value = interpolateAttr(attrs.value, sc)
      if (mode === 'date') {
        if (attrs.start) input.min = interpolateAttr(attrs.start, sc)
        if (attrs.end) input.max = interpolateAttr(attrs.end, sc)
      }
      elChange(input, () => onchange(input.value))
      input.classList.add('wx-picker-native-input')
      wrap.appendChild(input)
    }
    return wrap
  }
  function elChange(el, fn) { el.addEventListener('change', fn) }

  // 渲染整个节点树 → 文档片段。页面上层为 entry._el 内部
  function renderNodes(nodes, sc, page) {
    let branch = false
    const out = []
    for (const node of nodes) {
      if (node.text !== undefined) {
        const t = interpolate(node.text, sc)
        if (t) out.push(document.createTextNode(t))
        continue
      }
      const attrs = node.attrs
      if ('wx:if' in attrs) { branch = truth(attrs['wx:if'], sc); if (!branch) continue }
      else if ('wx:elif' in attrs) {
        if (branch) continue
        branch = truth(attrs['wx:elif'], sc); if (!branch) continue
      } else if ('wx:else' in attrs) { if (branch) continue; branch = true }
      else branch = false
      if (attrs['wx:for']) {
        const items = valueOf(attrs['wx:for'], sc) || []
        const itemName = attrs['wx:for-item'] || 'item'
        const idxName = attrs['wx:for-index'] || 'index'
        const clone = { ...node, attrs: { ...attrs } }
        delete clone.attrs['wx:for']
        for (let i = 0; i < items.length; i++) {
          const childSc = { ...sc, [itemName]: items[i], [idxName]: i }
          out.push(...renderNodes([clone], childSc, page))
        }
        continue
      }
      if (node.tag === 'block') { out.push(...renderNodes(node.children || [], sc, page)); continue }
      const el = nodeToEl(node, sc, page)
      if (!el) continue
      out.push(el)
      if (node.tag === 'picker') continue // picker 子节点.render 进 display
      const kids = renderNodes(node.children || [], sc, page)
      for (const c of kids) el.appendChild(c)
    }
    return out
  }

  // ---------- 页面实例 ----------
  const pagesRepo = {} // route => config
  let app = {}
  let templates = {}

  function createInstance(route, query) {
    const cfg = pagesRepo[route] || {}
    const inst = {
      data: JSON.parse(JSON.stringify(cfg.data || {})),
      _route: route,
      _el: null,
      setData(patch, cb) { Object.assign(this.data, patch); refresh(this); cb && cb() },
      _call(fn, args) { const f = cfg[fn]; if (typeof f === 'function') return f.apply(inst, args) },
    }
    for (const key of Object.keys(cfg)) {
      if (typeof cfg[key] === 'function' && key !== 'data') inst[key] = cfg[key].bind(inst)
    }
    return inst
  }

  function refresh(inst) {
    if (!inst._el) return
    const html = templates[inst._route] || ''
    if (!html) return
    // 捕获焦点（输入中）用于重建后恢复
    let focusInfo = null
    const af = document.activeElement
    if (af && (af.tagName === 'INPUT' || af.tagName === 'TEXTAREA') && inst._el.contains(af)) {
      focusInfo = { field: af.dataset.field || null, value: af.value, selStart: af.selectionStart, selEnd: af.selectionEnd }
    }
    const nodes = parse(html)
    const frags = renderNodes(nodes, inst.data, inst)
    inst._el.replaceChildren(...frags)
    document.body.dataset.theme = inst.data.theme || 'light' // tabBar/弹窗深色变量依赖
    // 恢复焦点
    if (focusInfo) {
      const el = inst._el.querySelector(focusInfo.field ? '[data-field="' + focusInfo.field + '"]' : 'input,textarea')
      if (el) { el.focus(); try { el.setSelectionRange(focusInfo.selStart, focusInfo.selEnd) } catch { } }
    } else {
      const af = inst._el.querySelector('[data-auto-focus="1"]')
      if (af) af.focus()
    }
  }

  // ---------- 路由 ----------
  const stack = [] // {route, inst}
  let current = null
  const appEl = () => document.getElementById('app')
  const tabbarEl = () => document.getElementById('tabbar')

  function entryRouteOf(url) { return url.replace(/^\//, '').split('?')[0] }

  function goto(url, mode) {
    const route = entryRouteOf(url)
    if (!pagesRepo[route]) { console.warn('unknown route', route); return }
    let query = {}
    const qIndex = url.indexOf('?')
    if (qIndex >= 0) url.slice(qIndex + 1).split('&').forEach(kv => {
      const i = kv.indexOf('='); if (i > 0) query[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1))
    })
    let entry
    if (mode === 'tab') {
      entry = stack.find(e => e.route === route)
      if (!entry) { entry = { route, inst: createInstance(route, query) }; stack.push(entry) }
      else if (stack[stack.length - 1] !== entry) {
        stack.splice(stack.indexOf(entry), 1); stack.push(entry) // 切 tab 清掉栈中非 tab 页
      }
    } else {
      entry = { route, inst: createInstance(route, query) } // navigate 语义：总是新建实例
      if (mode === 'redirect' && stack.length > 1) stack.splice(stack.length - 2, 1)
      stack.push(entry)
    }
    showEntry(entry, query)
  }
  function showEntry(entry, query, wasTab) {
    const prev = current
    if (prev === entry) return
    if (!entry.inst._el) {
      entry.inst._el = document.createElement('div')
      entry.inst._el.className = 'wx-page'
      entry.inst._el.dataset.route = entry.route
      entry.inst._elscroll = 0
    }
    const el = appEl()
    if (prev && prev.inst && prev.inst._el) {
      prev.inst._elscroll = el.scrollTop
      prev.inst.onHide && prev.inst.onHide()
    }
    el.style.paddingBottom = tabList().some(t => t.pagePath === entry.route) ? '60px' : '0'
    el.replaceChildren(entry.inst._el)
    el.scrollTop = entry.inst._elscroll || 0
    refresh(entry.inst)
    if (!entry._loaded) { entry._loaded = true; entry.inst.onLoad && entry.inst.onLoad(query) }
    entry.inst.onShow && entry.inst.onShow()
    current = entry
    updateTabbar(entry.route)
    history.pushState({ route: entry.route }, '', '#/' + entry.route)
  }
  function popEntry() {
    stack.pop()
    const next = stack[stack.length - 1]
    if (!next) { current = null; return }
    const prev = current
    if (prev && prev.inst && prev.inst._el) prev.inst.onHide && prev.inst.onHide()
    current = next
    const el = appEl()
    el.replaceChildren(next.inst._el)
    refresh(next.inst)
    next.inst.onShow && next.inst.onShow()
    updateTabbar(next.route)
  }
  window.addEventListener('popstate', () => {
    if (stack.length > 1) popEntry() // 安卓返回键：历史回退一层
  })

  // ---------- tabBar ----------
  function tabList() { return (app.tabBar && app.tabBar.list) || [] }
  function updateTabbar(route) {
    const bar = tabbarEl()
    const list = tabList()
    if (!bar) return
    if (!list.length) { bar.hidden = true; return }
    const active = list.some(t => t.pagePath === route)
    bar.hidden = active ? false : true
    bar.replaceChildren(...list.map(t => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = t.text
      b.className = 'wx-tab' + (t.pagePath === route ? ' active' : '')
      b.onclick = () => goto(t.pagePath, 'tab')
      return b
    }))
  }

  // ---------- 触底 ----------
  let lastReachY = 0
  if (typeof window !== 'undefined') {
    let scrollTicking = false
    window.addEventListener('scroll', () => {
      if (scrollTicking) return
      scrollTicking = true
      requestAnimationFrame(() => {
        scrollTicking = false
        const el = appEl()
        if (!el || !current || !current.inst.onReachBottom) return
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80
        const now = Date.now()
        if (nearBottom && now - lastReachY > 500) { lastReachY = now; current.inst.onReachBottom() }
      })
    }, true)
  }

  // ---------- 引导 ----------
  function boot(mini) {
    app = mini.app || {}
    Object.assign(pagesRepo, mini.pages || {})
    templates = mini.templates || {}
    // tabBar 挂载
    if (tabbarEl() && tabList().length) updateTabbar('')
    // app 启动
    if (app.onLaunch) { app.onLaunch.call({}) }
    // 首路由
    const root = (mini.startRoute) || (app.pages && app.pages[0]) || 'pages/home/home'
    goto(root, 'tab')
  }

  window.__wxboot = boot
})()
