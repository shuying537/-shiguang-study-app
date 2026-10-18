const store=require('../../utils/store'),ui=require('../../utils/ui')
Page({
 data:{theme:'light',filter:'all',subjectFilter:'all',tabs:[{id:'all',label:'全部'},{id:'active',label:'待完成'},{id:'completed',label:'已完成'},{id:'overdue',label:'已逾期'}],tasks:[],subjects:[],counts:{all:0,active:0,completed:0,overdue:0},limit:20,total:0},
 onShow(){
  const requested=wx.getStorageSync('study_plan_filter_v2')
  if(requested){wx.removeStorageSync('study_plan_filter_v2');this.setData({filter:requested,subjectFilter:'all',limit:20})}
  this.refresh()
 },
 onPullDownRefresh(){this.setData({limit:20});this.refresh();wx.stopPullDownRefresh()},
 onReachBottom(){if(this.data.limit<this.data.total){this.setData({limit:this.data.limit+20});this.refresh()}},
 refresh(){
  try{
   ui.applyTheme(this);const d=store.getData()
   if(this.data.subjectFilter!=='all'&&!d.subjects.some(s=>s.id===this.data.subjectFilter))this.setData({subjectFilter:'all'})
   let tasks=d.tasks.map(t=>ui.taskView(d,t))
   if(this.data.subjectFilter!=='all')tasks=tasks.filter(t=>t.subjectId===this.data.subjectFilter)
   const counts={all:tasks.length,active:tasks.filter(t=>t.status==='active').length,completed:tasks.filter(t=>t.status==='completed').length,overdue:tasks.filter(t=>t.status==='overdue').length}
   const legacyCount=tasks.filter(t=>t.abandoned).length
   if(this.data.filter!=='all')tasks=tasks.filter(t=>t.status===this.data.filter)
   tasks.sort((a,b)=>Number(a.completed||a.abandoned)-Number(b.completed||b.abandoned)||(store.timestamp(a.deadline)||Infinity)-(store.timestamp(b.deadline)||Infinity))
   this.setData({tasks:tasks.slice(0,this.data.limit),total:tasks.length,counts,subjects:d.subjects,legacyCount})
  }catch(e){ui.toast(e.message)}
 },
 chooseFilter(e){this.setData({filter:e.currentTarget.dataset.id,limit:20});this.refresh()},
 chooseSubject(e){this.setData({subjectFilter:e.currentTarget.dataset.id,limit:20});this.refresh()},
 create(){wx.navigateTo({url:'/pages/task/task'})},
 importPlan(){wx.navigateTo({url:'/pages/import/import'})},
 detail(e){wx.navigateTo({url:'/pages/task/task?id='+e.currentTarget.dataset.id})},
 toggle(e){try{store.toggleTask(e.currentTarget.dataset.id);this.refresh()}catch(err){ui.toast(err.message)}},
 postpone(e){try{store.postponeTask(e.currentTarget.dataset.id);this.refresh();ui.toast('已顺延一天')}catch(err){ui.toast(err.message)}},
 remove(e){ui.confirm('删除任务？','关联的学习记录会保留。',()=>{store.deleteTask(e.currentTarget.dataset.id);this.refresh()})}
})
