// 迷你运行时（纯函数部分）：WXML 解析 / 表达式求值 / CSS 转换 / 字符串渲染
// node 环境可用（供测试），浏览器由 runtime-web.js 加载后同源使用。
// 设计源自源项目的 tools/preview_v2.cjs，保持同一套模板语义。

function parse(template) {
  const document = { children: [] }, stack = [document]
  const pattern = /<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g
  let match, offset = 0
  while ((match = pattern.exec(template))) {
    if (match.index > offset) stack.at(-1).children.push({ text: template.slice(offset, match.index) })
    const token = match[0]; offset = pattern.lastIndex
    if (token.startsWith('<!--')) continue
    if (token.startsWith('</')) {
      const name = token.match(/^<\/([\w-]+)/)[1]
      if (stack.length === 1 || stack.at(-1).tag !== name) throw new Error('Unbalanced WXML tag: ' + name)
      stack.pop(); continue
    }
    const tag = token.match(/^<([\w-]+)/)[1], attrs = {}
    const attribute = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g
    const rest = token.slice(tag.length + 1).replace(/\/?\s*>$/, '')
    let a
    while ((a = attribute.exec(rest))) attrs[a[1]] = a[2] === undefined ? (a[3] === undefined ? '' : a[3]) : a[2]
    const node = { tag, attrs, children: [] }
    stack.at(-1).children.push(node)
    if (!token.endsWith('/>')) stack.push(node)
  }
  if (offset < template.length) stack.at(-1).children.push({ text: template.slice(offset) })
  if (stack.length !== 1) throw new Error('Unclosed WXML tag: ' + stack.at(-1).tag)
  return document.children
}

const warnedExpressions = new Set()
function evaluate(expression, scope) {
  // 与真机一致：表达式求值失败（标识符不存在、读取 undefined 的属性等）只让这一处渲染为空，
  // 不能把异常抛给整页渲染，否则一个空数组取值就会让页面整块空白。
  try { return Function('scope', 'with(scope){return (' + expression + ')}')(scope) }
  catch (e) {
    // 首帧渲染时页面数据还没由 onShow 填充，标识符不存在是正常现象，保持安静；
    // 读取 undefined 的属性这类真实错误只提醒一次，方便定位但不会中断渲染。
    if (!e || e.name !== 'ReferenceError') {
      if (!warnedExpressions.has(expression)) {
        warnedExpressions.add(expression)
        try { console.warn('[wxml] 表达式渲染为空：' + expression + '（' + String(e && e.message) + '）') } catch (ignore) { }
      }
    }
    return undefined
  }
}

function interpolate(value, scope) {
  // 与真机一致：绑定结果为 undefined/null 时渲染为空字符串
  return String(value).replace(/{{([\s\S]*?)}}/g, (_, expression) => {
    const v = evaluate(expression, scope)
    return v === undefined || v === null ? '' : String(v)
  })
}

// 属性值求值：整条“{{expr}}” → 求值；否则作为字符串返回
function valueOf(value, scope) {
  const m = String(value).match(/^\s*{{([\s\S]*?)}}\s*$/)
  return m ? evaluate(m[1], scope) : value
}

function truth(value, scope) {
  const match = String(value).match(/^\s*{{([\s\S]*?)}}\s*$/)
  return match ? !!evaluate(match[1], scope) : !!value
}

function css(text) {
  return text.replace(/\bpage\s*\{/g, 'body{').replace(/(-?[\d.]+)rpx/g, (_, n) => 'calc(100vw * ' + Number(n) + ' / 750)')
}

// 字符串渲染（node 冒烟测试用；与 runtime-web.js 的 DOM 补丁语义一致）
function renderToString(nodes, scope) {
  let html = '', branch = false
  for (const node of nodes) {
    if (node.text !== undefined) { html += interpolate(node.text, scope); continue }
    const attrs = node.attrs
    if ('wx:if' in attrs) { branch = truth(attrs['wx:if'], scope); if (!branch) continue }
    else if ('wx:elif' in attrs) { if (branch) continue; branch = truth(attrs['wx:elif'], scope); if (!branch) continue }
    else if ('wx:else' in attrs) { if (branch) continue; branch = true }
    else branch = false
    if (attrs['wx:for']) {
      const items = truth(attrs['wx:for'], scope) || []
      const clone = { ...node, attrs: { ...attrs } }
      delete clone.attrs['wx:for']
      html += items.map((item, index) =>
        renderToString([clone], { ...scope, [attrs['wx:for-item'] || 'item']: item, [attrs['wx:for-index'] || 'index']: index })
      ).join('')
      continue
    }
    const tag = ({ view: 'div', text: 'span', 'scroll-view': 'div', switch: 'input', block: 'div' })[node.tag] || node.tag
    let attributes = ''
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('wx:') || key.startsWith('bind') || key.startsWith('catch') || key === 'focus') continue
      if (key === 'disabled') { if (truth(value, scope)) attributes += ' disabled'; continue }
      if (key === 'checked') { if (truth(value, scope)) attributes += ' checked="checked"'; continue }
      if (key === 'value' && tag === 'input') { attributes += ' value="' + interpolate(value, scope).replace(/"/g, '&quot;') + '"'; continue }
      attributes += ' ' + key + '="' + interpolate(value, scope).replace(/"/g, '&quot;') + '"'
    }
    if (node.tag === 'switch') attributes += ' type="checkbox"'
    if (tag === 'input' || tag === 'br') { html += '<' + tag + attributes + '>'; continue }
    html += '<' + tag + attributes + '>' + renderToString(node.children, scope) + '</' + tag + '>'
  }
  return html
}

if (typeof module !== 'undefined' && module.exports) module.exports = { parse, evaluate, interpolate, truth, valueOf, css, renderToString }
if (typeof window !== 'undefined') window.__miniwx = { parse, evaluate, interpolate, truth, valueOf, css, renderToString }
