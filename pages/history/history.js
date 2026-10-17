const store=require('../../utils/store'),ui=require('../../utils/ui')
Page({
 data:{theme:'light',range:'all',selectedDate:'',subjectIndex:0,subjectOptions:[],groups:[],total:0,totalText:'0分钟',limit:30,shown:0,today:''},
 onShow(){this.refresh()},
 onPullDownRefresh(){this.setData({limit:30});this.refresh();wx.stopPullDownRefresh()},
 onReachBottom(){if(this.data.shown<this.data.total){this.setData({limit:this.data.limit+30});this.refresh()}},
 refresh(){
  try{
   ui.applyTheme(this);const d=store.getData(),today=store.dateKey()
   const previous=this.data.subjectOptions[this.data.subjectIndex],selectedId=previous?previous.id:'all'
   const archived=(d.archivedSubjects||[]).filter(s=>d.records.some(r=>r.subjectId===s.id)).map(s=>({id:s.id,name:s.name+'（已删除）'}))
   const options=[{id:'all',name:'所有科目'}].concat(d.subjects,archived)
   if(d.records.some(r=>store.recordSubject(d,r).id==='unknown'))options.push({id:'unknown',name:'未知科目（旧记录）'})
   const subjectIndex=Math.max(0,options.findIndex(s=>s.id===selectedId)),subjectId=options[subjectIndex].id
   let records=d.records.map(r=>ui.recordView(d,r))
   if(this.data.range==='week')records=records.filter(r=>r.date>=store.addDays(today,-6)&&r.date<=today)
   if(this.data.range==='date')records=records.filter(r=>r.date===this.data.selectedDate)
   if(subjectId!=='all')records=records.filter(r=>store.recordSubject(d,r).id===subjectId)
   records.sort((a,b)=>b.date.localeCompare(a.date)||(b.createdAt||'').localeCompare(a.createdAt||''))
   const visible=records.slice(0,this.data.limit),groups=[]
   visible.forEach(r=>{let group=groups[groups.length-1];if(!group||group.date!==r.date){group={date:r.date,records:[]};groups.push(group)}group.records.push(r)})
   this.setData({today,subjectOptions:options,subjectIndex,groups,total:records.length,shown:visible.length,totalText:store.durationText(records.reduce((sum,r)=>sum+r.duration,0))})
  }catch(e){ui.toast(e.message)}
 },
 rangeChange(e){this.setData({range:e.currentTarget.dataset.range,selectedDate:'',limit:30});this.refresh()},
 chooseDate(e){this.setData({range:'date',selectedDate:e.detail.value,limit:30});this.refresh()},
 subjectChange(e){this.setData({subjectIndex:Number(e.detail.value),limit:30});this.refresh()},
 edit(e){wx.navigateTo({url:'/pages/record/record?id='+e.currentTarget.dataset.id})},
 record(){wx.navigateTo({url:'/pages/record/record'})}
})
