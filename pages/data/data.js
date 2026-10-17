const store=require('../../utils/store'),ui=require('../../utils/ui'),charts=require('../../utils/charts')
Page({
 data:{theme:'light',period:'week',anchor:'',subjects:[],daily:[],records:[],completed:[],selectedDate:'',showDetails:false,summary:{},legacyCompletedCount:0},
 onLoad(){this.setData({anchor:store.dateKey()})},
 onShow(){this.refresh()},
 onPullDownRefresh(){this.refresh();wx.stopPullDownRefresh()},
 refresh(){
  try{
   ui.applyTheme(this);const d=store.getData(),days=this.data.period==='week'?store.weekDays(this.data.anchor):store.monthDays(this.data.anchor),summary=store.stats(d,days)
   const label=this.data.period==='week'?days[0].slice(5).replace('-','/')+' — '+days[6].slice(5).replace('-','/'):this.data.anchor.slice(0,4)+'年'+Number(this.data.anchor.slice(5,7))+'月'
   const completed=store.completedForDays(d,days).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)).map(t=>Object.assign(ui.taskView(d,t),{completedDate:store.dateKey(t.completedAt)}))
   this.setData({summary,subjects:summary.subjects,daily:summary.daily,records:summary.records.map(r=>ui.recordView(d,r)),completed,rangeLabel:label,isCurrent:days.indexOf(store.dateKey())>=0,selectedDate:'',showDetails:false,detailRecords:[],legacyCompletedCount:d.tasks.filter(t=>t.completed&&!t.abandoned&&!t.completedAt).length})
   wx.nextTick(()=>this.draw())
  }catch(e){ui.toast(e.message)}
 },
 draw(){const dark=this.data.theme==='dark';charts.setup(this,'ring',(ctx,w,h)=>charts.ring(ctx,w,h,this.data.subjects,dark));charts.setup(this,'trend',(ctx,w,h)=>charts.line(ctx,w,h,this.data.daily,dark))},
 period(e){this.setData({period:e.currentTarget.dataset.id});this.refresh()},
 shift(e){
  const n=Number(e.currentTarget.dataset.step);if(n>0&&this.data.isCurrent)return
  let anchor=this.data.anchor
  if(this.data.period==='week')anchor=store.addDays(anchor,n*7)
  else{const d=new Date(anchor.slice(0,7)+'-01T12:00:00');d.setMonth(d.getMonth()+n);anchor=store.dateKey(d)}
  this.setData({anchor});this.refresh()
 },
 showAll(){this.setData({showDetails:!this.data.showDetails,selectedDate:'',detailRecords:this.data.records})},
 trendTap(e){
  const query=wx.createSelectorQuery().in(this)
  query.select('#trend').boundingClientRect(rect=>{if(!rect)return;const x=e.detail.x-rect.left,i=Math.max(0,Math.min(this.data.daily.length-1,Math.round((x-34)/(rect.width-46)*(this.data.daily.length-1)))),date=this.data.daily[i].date;this.setData({selectedDate:date,showDetails:true,detailRecords:this.data.records.filter(r=>r.date===date)})}).exec()
 },
 edit(e){wx.navigateTo({url:'/pages/record/record?id='+e.currentTarget.dataset.id})},
 taskDetail(e){wx.navigateTo({url:'/pages/task/task?id='+e.currentTarget.dataset.id})},
 history(){wx.navigateTo({url:'/pages/history/history'})},
 record(){wx.navigateTo({url:'/pages/record/record'})},
 plan(){wx.switchTab({url:'/pages/list/list'})}
})
