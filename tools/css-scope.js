function scopeCss(text, route) {
 const prefix = '[data-route="' + route + '"]'
 let out = '', i = 0
 while (i < text.length) {
  const open = text.indexOf('{', i)
  if (open < 0) { out += text.slice(i); break }
  let depth = 1, close = open + 1
  while (close < text.length && depth) {
   if (text[close] === '{') depth++
   else if (text[close] === '}') depth--
   close++
  }
  const prelude = text.slice(i, open), selector = prelude.trim(), body = text.slice(open + 1, close - 1)
  if (!selector) { out += text.slice(i, close) }
  else if (selector.charAt(0) === '@') {
   if (/^@(media|supports|layer)\b/i.test(selector)) out += prelude + '{' + scopeCss(body, route) + '}'
   else out += prelude + '{' + body + '}'
  } else {
   const scoped = selector.split(',').map(part => {
    const item = part.trim()
    if (!item) return ''
    if (item === 'page') return prefix
    if (/^page(\s|>|~|\+)/.test(item)) return prefix + item.slice(4)
    return prefix + ' ' + item
   }).filter(Boolean).join(',')
   out += scoped + '{' + body + '}'
  }
  i = close
 }
 return out
}

module.exports = { scopeCss }
