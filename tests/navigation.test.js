const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {JSDOM}=require('jsdom')
const root=path.resolve(__dirname,'..')
const read=file=>fs.readFileSync(path.join(root,file),'utf8')
const tick=()=>new Promise(resolve=>setTimeout(resolve,40))
async function until(check){
 for(let i=0;i<100;i++){
  if(check())return
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 assert.ok(check(),'history traversal did not settle')
}

function setup(t,real=false){
 const dom=new JSDOM('<div id="app"></div><div id="tabbar"></div>',{url:'https://localhost/',runScripts:'outside-only',pretendToBeVisual:true})
 const w=dom.window
 t.after(()=>w.close())
 w.eval(read('tools/runtime.js'));w.eval(read('tools/runtime-web.js'))
 if(real)w.eval(read('www/bundle.js'))
 else{
  const pages={},templates={}
  for(const name of ['home','plan','my','a','b','c']){
   const route='pages/'+name
   pages[route]={data:{draft:''},input(e){this.setData({draft:e.detail.value})}}
   templates[route]='<view><input value="{{draft}}" bindinput="input"/></view>'
  }
  w.__wxboot({pages,templates,startRoute:'pages/home',app:{tabBar:{list:['home','plan','my'].map(name=>({pagePath:'pages/'+name,text:name}))}}})
 }
 const appEl=w.document.getElementById('app')
 return {w,appEl,q:selector=>appEl.querySelector(selector),route:()=>appEl.firstChild.dataset.route}
}

test('Android Back walks nested pages, preserves forms and scroll, then yields only at home',async t=>{
 const {w,appEl,q,route}=setup(t)
 assert.equal(w.__studyBack(),false)
 w.wx.switchTab({url:'/pages/plan'})
 w.wx.navigateTo({url:'/pages/a'})
 q('input').value='尚未保存的内容';q('input').dispatchEvent(new w.Event('input',{bubbles:true}))
 await tick()
 appEl.scrollTop=240
 w.wx.navigateTo({url:'/pages/b'})
 assert.equal(w.__studyBack(),true)
 assert.equal(w.__studyBack(),true,'a repeated press during history traversal is consumed')
 await tick()
 assert.equal(route(),'pages/a')
 assert.equal(q('input').value,'尚未保存的内容')
 assert.equal(appEl.scrollTop,240)
 assert.equal(w.document.getElementById('tabbar').hidden,true)
 assert.match(w.location.hash,/pages\/a$/)
 w.__studyBack();await tick()
 assert.equal(route(),'pages/plan')
 assert.equal(appEl.style.paddingBottom,'60px')
 assert.equal(w.document.getElementById('tabbar').hidden,false)
 w.__studyBack();await tick()
 assert.equal(route(),'pages/home')
 assert.equal(w.__studyBack(),false)
})

test('browser Back and Forward share the same stack as native and programmatic Back',async t=>{
 const {w,q,route}=setup(t)
 w.wx.navigateTo({url:'/pages/a'})
 w.wx.navigateTo({url:'/pages/b'})
 q('input').value='B 草稿';q('input').dispatchEvent(new w.Event('input',{bubbles:true}))
 await tick()
 w.history.back();await tick()
 assert.equal(route(),'pages/a')
 w.history.forward();await tick()
 assert.equal(route(),'pages/b')
 assert.equal(q('input').value,'B 草稿')
 w.wx.navigateBack({delta:2});await tick()
 assert.equal(route(),'pages/home')
 w.history.forward();await tick()
 assert.equal(route(),'pages/a')
 w.__studyBack();await tick()
 assert.equal(route(),'pages/home')
})

test('Back dismisses confirmation dialogs before navigating and never confirms the action',async t=>{
 const {w,route}=setup(t)
 w.wx.navigateTo({url:'/pages/a'})
 const results=[]
 w.wx.showModal({title:'删除？',success:result=>results.push(result.confirm)})
 assert.equal(w.__studyBack(),true)
 assert.deepEqual(results,[false])
 assert.equal(route(),'pages/a')
 assert.equal(w.document.querySelector('.wx-modal-mask'),null)
 w.wx.showModal({title:'恢复？',success:result=>results.push(result.confirm)})
 w.history.back();await tick()
 assert.equal(route(),'pages/a','browser Back also dismisses the modal first')
 assert.deepEqual(results,[false,false])
 w.__studyBack();await tick()
 assert.equal(route(),'pages/home')
})

test('switching tabs closes detail paths; Back returns home and Forward skips closed pages',async t=>{
 const {w,route}=setup(t)
 w.wx.switchTab({url:'/pages/plan'})
 w.wx.navigateTo({url:'/pages/a'})
 w.wx.navigateTo({url:'/pages/b'})
 w.wx.switchTab({url:'/pages/my'})
 assert.equal(route(),'pages/my')
 w.history.back();await until(()=>route()==='pages/home'&&w.history.state.index===0)
 assert.equal(route(),'pages/home')
 w.history.forward();await until(()=>route()==='pages/my')
 assert.equal(route(),'pages/my')
 w.wx.switchTab({url:'/pages/home'});await until(()=>w.history.state.index===0)
 w.history.forward();await tick();await until(()=>w.history.state.index===0)
 assert.equal(route(),'pages/home','Forward must not reopen closed detail or tab paths')
 assert.equal(w.__studyBack(),false)
 w.wx.navigateTo({url:'/pages/c'})
 w.__studyBack();await tick()
 assert.equal(route(),'pages/home')
})

test('redirect replaces the current detail page and retains its parent',async t=>{
 const {w,route}=setup(t)
 w.wx.navigateTo({url:'/pages/a'})
 w.wx.navigateTo({url:'/pages/b'})
 const length=w.history.length
 w.wx.redirectTo({url:'/pages/c'})
 assert.equal(route(),'pages/c')
 assert.equal(w.history.length,length)
 w.__studyBack();await tick()
 assert.equal(route(),'pages/a')
 w.history.forward();await tick()
 assert.equal(route(),'pages/c')
 w.wx.navigateBack({delta:99});await tick()
 assert.equal(route(),'pages/home')
})

test('real task form retains unsaved text when system Back returns from subject management',async t=>{
 const {w,q}=setup(t,true)
 w.wx.switchTab({url:'/pages/list/list'})
 w.wx.navigateTo({url:'/pages/task/task'})
 const title=q('input[data-field="title"]')
 title.value='未保存的数学练习';title.dispatchEvent(new w.Event('input',{bubbles:true}))
 await tick()
 w.wx.navigateTo({url:'/pages/subjects/subjects'})
 assert.equal(w.__studyBack(),true);await tick()
 assert.equal(q('input[data-field="title"]').value,'未保存的数学练习')
 assert.ok(q('.form-page'))
 w.__studyBack();await tick()
 assert.ok(q('.task-page'))
})
