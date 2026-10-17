// Static browser preview of the actual WXML/WXSS. Native WeChat rendering still needs device acceptance.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http')
const root=path.resolve(__dirname,'..'),memory={}
global.wx={getStorageSync:k=>memory[k]||'',setStorageSync(k,v){memory[k]=JSON.parse(JSON.stringify(v))},removeStorageSync(k){delete memory[k]},setNavigationBarColor(){},setTabBarStyle(){},getAppBaseInfo(){return {theme:'light'}},nextTick(){},showToast(){}}
const store=require('../utils/store'),ui=require('../utils/ui')
const escaped=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
function evaluate(expression,scope){return Function('scope','with(scope){return ('+expression+')}')(scope)}
function interpolate(value,scope){return String(value).replace(/{{([\s\S]*?)}}/g,(_,expression)=>escaped(evaluate(expression,scope)))}
function parse(template){
 const document={children:[]},stack=[document],pattern=/<!--[\s\S]*?-->|<\/?[A-Za-z][\w-]*(?:[^>"']|"[^"]*"|'[^']*')*>/g
 let match,offset=0
 while((match=pattern.exec(template))){
  if(match.index>offset)stack.at(-1).children.push({text:template.slice(offset,match.index)})
  const token=match[0];offset=pattern.lastIndex
  if(token.startsWith('<!--'))continue
  if(token.startsWith('</')){const name=token.match(/^<\/([\w-]+)/)[1];if(stack.length===1||stack.at(-1).tag!==name)throw new Error('Unbalanced WXML tag: '+name);stack.pop();continue}
  const tag=token.match(/^<([\w-]+)/)[1],attrs={},attribute=/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g
  const rest=token.slice(tag.length+1).replace(/\/?\s*>$/,'');let a
  while((a=attribute.exec(rest)))attrs[a[1]]=a[2]===undefined?(a[3]===undefined?'':a[3]):a[2]
  const node={tag,attrs,children:[]};stack.at(-1).children.push(node)
  if(!token.endsWith('/>'))stack.push(node)
 }
 if(offset<template.length)stack.at(-1).children.push({text:template.slice(offset)})
 if(stack.length!==1)throw new Error('Unclosed WXML tag: '+stack.at(-1).tag)
 return document.children
}
function truth(value,scope){const match=String(value).match(/^{{([\s\S]*)}}$/);return match?evaluate(match[1],scope):!!value}
function render(nodes,scope){
 let html='',branch=false
 for(const node of nodes){
  if(node.text!==undefined){html+=interpolate(node.text,scope);continue}
  const attrs=node.attrs
  if('wx:if' in attrs){branch=!!truth(attrs['wx:if'],scope);if(!branch)continue}
  else if('wx:elif' in attrs){if(branch)continue;branch=!!truth(attrs['wx:elif'],scope);if(!branch)continue}
  else if('wx:else' in attrs){if(branch)continue;branch=true}
  else branch=false
  if(attrs['wx:for']){
   const items=truth(attrs['wx:for'],scope)||[],clone={...node,attrs:{...attrs}};delete clone.attrs['wx:for']
   html+=items.map((item,index)=>render([clone],{...scope,[attrs['wx:for-item']||'item']:item,[attrs['wx:for-index']||'index']:index})).join('');continue
  }
  const tag=({view:'div',text:'span',picker:'div','scroll-view':'div',switch:'input'})[node.tag]||node.tag
  let attributes=''
  for(const [key,value]of Object.entries(attrs)){
   if(key.startsWith('wx:')||key.startsWith('bind')||key.startsWith('catch')||key==='focus')continue
   if(key==='disabled'){if(truth(value,scope))attributes+=' disabled';continue}
   attributes+=' '+key+'="'+interpolate(value,scope)+'"'
  }
  if(node.tag==='switch')attributes+=' type="checkbox"'
  if(tag==='input'||tag==='br'){html+='<'+tag+attributes+'>';continue}
  html+='<'+tag+attributes+'>'+render(node.children,scope)+'</'+tag+'>'
 }
 return html
}
function css(text){return text.replace(/\bpage\s*\{/g,'body{').replace(/(-?[\d.]+)rpx/g,(_,n)=>'calc(100vw * '+Number(n)+' / 750)')}
function preview(name,dark,empty){
 store.clearAll();if(!empty){store.loadDemo();store.addSubject('政治');store.addSubject('计算机学科专业基础综合')}
 const d=store.getData();d.settings.theme=dark?'dark':'light';store.saveData(d)
 let config
 vm.runInNewContext(fs.readFileSync(path.join(root,'pages',name,name+'.js'),'utf8'),{Date,Page(value){config=value},wx:global.wx,require(id){return id.endsWith('/store')?store:id.endsWith('/ui')?ui:{setup(){}}},setTimeout(){},clearTimeout(){}})
 config.setData=function(value,callback){Object.assign(this.data,value);if(callback)callback()}
 if(config.onLoad)config.onLoad({});config.onShow()
 if(name==='settings'){config.setData({showPreferences:true,showDataTools:true})}
 const template=fs.readFileSync(path.join(root,'pages',name,name+'.wxml'),'utf8').replace(/^\uFEFF/,'')
 const style=css(fs.readFileSync(path.join(root,'app.wxss'),'utf8')+'\n'+fs.readFileSync(path.join(root,'pages',name,name+'.wxss'),'utf8'))
 const baseline='body{margin:0}button{display:block;width:100%;text-align:center;border:0}button[size="mini"]{display:inline-block;width:auto;min-width:96px;padding:0 1.34em}input,textarea{font:inherit}textarea{display:block}canvas{display:block}span{box-sizing:border-box}button{cursor:pointer}.preview-tabs{display:flex;position:fixed;bottom:0;left:0;right:0;background:'+(dark?'#252433':'#fff')+';color:#9995ac;border-top:1px solid '+(dark?'#373444':'#eeedf5')+';height:52px;align-items:center;justify-content:space-around;font:14px sans-serif;z-index:9}.screen{padding-bottom:80px}'
 return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾光 v2.0 布局预览</title><style>'+baseline+style+'</style></head><body>'+render(parse(template),config.data)+'<nav class="preview-tabs"><span>首页</span><span>计划</span><span>我的</span></nav></body></html>'
}
module.exports={parse,render,preview}
if(require.main===module)http.createServer((request,response)=>{
 try{
  const url=new URL(request.url,'http://127.0.0.1:4187'),name=url.searchParams.get('page')||'home'
  if(!['home','list','settings','history','data','task','record','subjects'].includes(name)){response.writeHead(404);response.end();return}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(preview(name,url.searchParams.get('dark')==='1',url.searchParams.get('empty')==='1'))
 }catch(error){response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});response.end(error.stack)}
}).listen(4187,'127.0.0.1',()=>console.log('Local layout preview: http://127.0.0.1:4187'))
