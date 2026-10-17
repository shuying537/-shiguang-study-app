const store=require('../../utils/store')
const ui=require('../../utils/ui')
Page({
 data:{theme:'light',editing:false,subjects:[],quickDurations:[30,60,90,120],date:'',maxDate:'',minDate:'',subjectIndex:0,taskIndex:0,taskOptions:[{id:'',title:'不关联任务'}],duration:'',startTime:'',endTime:'',note:'',subjectId:'',taskId:'',detailsExpanded:false,loadError:false},
 onLoad(query){this.queryParams=query||{}},
 onShow(){this.load()},
 load(){
  try{
   ui.applyTheme(this)
   const d=store.getData(),today=store.dateKey(),edit=this.queryParams.id?d.records.find(r=>r.id===this.queryParams.id):null
   if(this.queryParams.id&&!edit)throw new Error('这条记录已不存在')
   const subjects=d.subjects.slice()
   if(edit&&!subjects.some(s=>s.id===edit.subjectId)){
    const original=store.recordSubject(d,edit)
    subjects.push({id:edit.subjectId,name:original.name+'（原科目）',color:original.color})
   }
   if(this.loaded){
    const index=subjects.findIndex(s=>s.id===this.data.subjectId)
    this.setData({subjects,subjectIndex:Math.max(0,index),subjectId:index>=0?subjects[index].id:subjects[0].id})
    this.updateTasks();return
   }
   const draft=!edit&&!this.queryParams.subjectId&&!this.queryParams.taskId?wx.getStorageSync(store.DRAFT_KEY):null
   const requested=edit?edit.subjectId:this.queryParams.subjectId||(draft&&draft.subjectId)||d.settings.lastSubjectId||'other'
   const index=subjects.findIndex(s=>s.id===requested),subjectIndex=Math.max(0,index),subjectId=subjects[subjectIndex].id
   const minDate=store.addDays(today,-6)
   const draftDate=draft&&store.dateKey(draft.date)===draft.date&&draft.date>=minDate&&draft.date<=today?draft.date:today
   const taskId=edit?edit.taskId||'':this.queryParams.taskId||(draft&&draft.taskId)||''
   const startTime=edit?edit.startTime||'':(draft&&draft.startTime)||'',endTime=edit?edit.endTime||'':(draft&&draft.endTime)||''
   this.setData({
    editing:!!edit,id:edit?edit.id:'',subjects,today,maxDate:today,
    minDate:edit&&edit.date<minDate?edit.date:minDate,date:edit?edit.date:draftDate,
    duration:edit?String(edit.duration):(draft&&draft.duration)||'',
    startTime,endTime,note:edit?edit.note||'':(draft&&draft.note)||'',subjectId,taskId,subjectIndex,
    detailsExpanded:!!(taskId||startTime||endTime),loadError:false,
    olderRecord:!!(edit&&edit.date<minDate)
   },()=>this.updateTasks())
   this.loaded=true
  }catch(e){this.setData({loadError:true});ui.toast(e.message)}
 },
 updateTasks(){
  const d=store.getData(),tasks=d.tasks.filter(t=>t.subjectId===this.data.subjectId&&((!t.completed&&!t.abandoned)||t.id===this.data.taskId))
  const taskOptions=[{id:'',title:'不关联任务'}].concat(tasks),index=taskOptions.findIndex(t=>t.id===this.data.taskId),taskIndex=Math.max(0,index)
  this.setData({taskOptions,taskIndex,taskId:taskOptions[taskIndex].id})
 },
 saveDraft(){
  if(this.data.editing)return
  try{wx.setStorageSync(store.DRAFT_KEY,{subjectId:this.data.subjectId,taskId:this.data.taskId,date:this.data.date,duration:this.data.duration,startTime:this.data.startTime,endTime:this.data.endTime,note:this.data.note})}
  catch(e){ui.toast('草稿暂存失败，请及时保存记录')}
 },
 subjectChange(e){const i=Number(e.detail.value),s=this.data.subjects[i];this.setData({subjectIndex:i,subjectId:s.id,taskId:''},()=>{this.updateTasks();this.saveDraft()})},
 taskChange(e){const i=Number(e.detail.value),task=this.data.taskOptions[i];this.setData({taskIndex:i,taskId:task?task.id:''},()=>this.saveDraft())},
 dateChange(e){this.setData({date:e.detail.value},()=>this.saveDraft())},
 quickDuration(e){this.setData({duration:String(e.currentTarget.dataset.value)},()=>this.saveDraft())},
 startChange(e){this.setData({startTime:e.detail.value},()=>this.saveDraft())},
 endChange(e){this.setData({endTime:e.detail.value},()=>this.saveDraft())},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value},()=>this.saveDraft())},
 toggleDetails(){this.setData({detailsExpanded:!this.data.detailsExpanded})},
 save(){
  if(this.data.loadError)return
  try{
   store.saveRecord({id:this.data.id,subjectId:this.data.subjectId,taskId:this.data.taskId||null,date:this.data.date,duration:Number(this.data.duration),startTime:this.data.startTime||null,endTime:this.data.endTime||null,note:this.data.note||''})
   if(!this.data.editing)wx.removeStorageSync(store.DRAFT_KEY)
   ui.toast(this.data.editing?'已更新记录':'已记下这一段学习');setTimeout(()=>wx.navigateBack(),350)
  }catch(e){ui.toast(e.message)}
 },
 remove(){ui.confirm('删除这条记录？','删除后会从首页和统计中移除，无法恢复。',()=>{store.deleteRecord(this.data.id);ui.toast('记录已删除');setTimeout(()=>wx.navigateBack(),350)})},
 createSubject(){wx.navigateTo({url:'/pages/subjects/subjects'})}
})

