const test = require('node:test')
const assert = require('node:assert/strict')
const { scopeCss } = require('../tools/css-scope')

test('page selectors are scoped to their route', () => {
  const input = '.goal-days{font-size:56rpx}.goal-title,.hint{color:red}'
  assert.equal(
    scopeCss(input, 'pages/home/home'),
    '[data-route="pages/home/home"] .goal-days{font-size:56rpx}[data-route="pages/home/home"] .goal-title,[data-route="pages/home/home"] .hint{color:red}'
  )
})

test('page root selectors target the routed container', () => {
  assert.equal(scopeCss('page{background:#fff}', 'pages/home/home'), '[data-route="pages/home/home"]{background:#fff}')
  assert.equal(scopeCss('page .card{margin:0}', 'pages/home/home'), '[data-route="pages/home/home"] .card{margin:0}')
})

test('media rules are scoped recursively while keyframes stay untouched', () => {
  assert.equal(
    scopeCss('@media (min-width:600px){.card{padding:0}}', 'pages/list/list'),
    '@media (min-width:600px){[data-route="pages/list/list"] .card{padding:0}}'
  )
  assert.equal(scopeCss('@keyframes spin{from{opacity:0}to{opacity:1}}', 'pages/home/home'), '@keyframes spin{from{opacity:0}to{opacity:1}}')
})

test('commas inside declaration values are preserved', () => {
  assert.equal(
    scopeCss('.card{box-shadow:0 0 1px rgba(1,2,3,.1);font-family:a,b}', 'pages/home/home'),
    '[data-route="pages/home/home"] .card{box-shadow:0 0 1px rgba(1,2,3,.1);font-family:a,b}'
  )
})
