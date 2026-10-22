const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm')
const root=path.resolve(__dirname,'..')
const {parse,preview}=require('../tools/preview_v2.cjs')
const app=JSON.parse(fs.readFileSync(path.join(root,'app.json'),'utf8').replace(/^\uFEFF/,''))

test('all registered pages have balanced templates and existing event handlers',()=>{
 for(const route of app.pages){
  const template=fs.readFileSync(path.join(root,route+'.wxml'),'utf8')
  parse(template)
  let config
  vm.runInNewContext(fs.readFileSync(path.join(root,route+'.js'),'utf8'),{Page(value){config=value},require(spec){return spec.endsWith('/plan-import-page')?require('../utils/plan-import-page'):{}}})
  const bindings=[...template.matchAll(/\b(?:bind|catch)(?::)?[a-z]+="(\w+)"/g)].map(match=>match[1])
  for(const binding of bindings)assert.equal(typeof config[binding],'function',route+': missing '+binding)
  const style=fs.readFileSync(path.join(root,route+'.wxss'),'utf8')
  assert.equal((style.match(/{/g)||[]).length,(style.match(/}/g)||[]).length,route+': style braces')
 }
})
test('tab navigation contains only home, plan and my, and statistics remains navigable',()=>{
 assert.deepEqual(app.tabBar.list.map(tab=>tab.text),['首页','计划','我的'])
 assert.ok(app.pages.includes('pages/data/data'))
 assert.ok(app.pages.includes('pages/history/history'))
 const tabs=new Set(app.tabBar.list.map(tab=>'/'+tab.pagePath))
 for(const route of app.pages){
  const code=fs.readFileSync(path.join(root,route+'.js'),'utf8')
  for(const match of code.matchAll(/wx\.switchTab\(\{url:\s*['"]([^'"]+)['"]/g))assert.ok(tabs.has(match[1]),'Invalid tab route: '+match[1])
  for(const match of code.matchAll(/wx\.navigateTo\(\{url:\s*['"]([^'"?]+)(?:\?[^'"]*)?['"]/g)){
   assert.ok(app.pages.includes(match[1].replace(/^\//,'')),'Unregistered route: '+match[1])
   assert.ok(!tabs.has(match[1]),'Tab route needs switchTab: '+match[1])
  }
 }
})
test('all main pages render their populated, empty and dark template branches',()=>{
 for(const name of ['home','list','settings','history','data','task','record','subjects']){
  for(const [dark,empty]of [[false,false],[false,true],[true,false]]){
   const html=preview(name,dark,empty)
   assert.ok(html.startsWith('<!doctype html>'),name)
   assert.ok(!html.includes('{{'),name+': unresolved template')
   assert.ok(!html.includes('undefined'),name+': missing template value')
  }
 }
})
