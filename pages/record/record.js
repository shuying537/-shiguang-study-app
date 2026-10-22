const store=require('../../utils/store')
const ui=require('../../utils/ui')
Page({
 data:{theme:'light',editing:false,subjects:[],recordRows:[],quickDurations:[30,60,90,120],date:'',maxDate:'',minDate:'',subjectIndex:0,taskIndex:0,taskOptions:[{id:'',title:'不关联任务'}],duration:'',startTime:'',endTime:'',note:'',subjectId:'',taskId:'',detailsExpanded:false,loadError:false},
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
    const index=subjects.findIndex(s=>s.id===this.data.subjectId),subjectIndex=Math.max(0,index)
    this.setData({subjects,subjectIndex,subjectId:index>=0?subjects[index].id:subjects[0].id,recordRows:this.rowsWithOptions(this.data.recordRows,subjects)})
    this.updateTasks();return
   }
   const draft=!edit&&!this.queryParams.subjectId&&!this.queryParams.taskId?wx.getStorageSync(store.DRAFT_KEY):null
   const requested=edit?edit.subjectId:this.queryParams.subjectId||(draft&&draft.subjectId)||d.settings.lastSubjectId||(d.subjects[0]&&d.subjects[0].id)||'other'
   const index=subjects.findIndex(s=>s.id===requested),subjectIndex=Math.max(0,index),subjectId=subjects[subjectIndex].id
   const draftRows=!edit&&Array.isArray(draft&&draft.rows)?draft.rows.filter(row=>row&&subjects.some(s=>s.id===row.subjectId)):[]
   const recordRows=this.rowsWithOptions(draftRows.length?draftRows:[{key:'record-1',subjectId,duration:!edit&&draft?draft.duration||'':''}],subjects)
   const minDate=store.addDays(today,-6)
   const draftDate=draft&&store.dateKey(draft.date)===draft.date&&draft.date>=minDate&&draft.date<=today?draft.date:today
   const taskId=edit?edit.taskId||'':this.queryParams.taskId||(draft&&draft.taskId)||''
   const startTime=edit?edit.startTime||'':(draft&&draft.startTime)||'',endTime=edit?edit.endTime||'':(draft&&draft.endTime)||''
   this.setData({
    editing:!!edit,id:edit?edit.id:'',subjects,today,maxDate:today,
    minDate:edit&&edit.date<minDate?edit.date:minDate,date:edit?edit.date:draftDate,
    duration:edit?String(edit.duration):(draft&&draft.duration)||'',recordRows,
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
 rowsWithOptions(rows,subjects){
  const valid=Array.isArray(rows)&&rows.length?rows:[{key:'record-1',subjectId:this.data.subjectId||subjects[0].id,duration:''}]
  return valid.map((row,index)=>{
   const selected=subjects.some(s=>s.id===row.subjectId)?row.subjectId:subjects[0].id
   const options=subjects.filter(s=>s.id===selected||!valid.some((other,i)=>i!==index&&other.subjectId===s.id))
   return Object.assign({},row,{key:row.key||'record-'+(index+1),subjectId:selected,options,subjectIndex:Math.max(0,options.findIndex(s=>s.id===selected)),duration:String(row.duration||'')})
  })
 },
 saveDraft(){
  if(this.data.editing)return
  try{wx.setStorageSync(store.DRAFT_KEY,{subjectId:this.data.recordRows[0]&&this.data.recordRows[0].subjectId||this.data.subjectId,rows:this.data.recordRows.map(({key,subjectId,duration})=>({key,subjectId,duration})),taskId:this.data.taskId,date:this.data.date,duration:this.data.duration,startTime:this.data.startTime,endTime:this.data.endTime,note:this.data.note})}
  catch(e){ui.toast('草稿暂存失败，请及时保存记录')}
 },
 changeRows(e){
  const rows=this.data.recordRows.slice(),index=Number(e.currentTarget.dataset.index)
  if(e.currentTarget.dataset.action==='remove')rows.splice(index,1)
  else{
   if(rows.length>=this.data.subjects.length){ui.toast('没有更多可添加的科目');return}
   const next=this.data.subjects.find(s=>!rows.some(row=>row.subjectId===s.id))
   if(!next){ui.toast('没有更多可添加的科目');return}
   rows.push({key:'record-'+Date.now(),subjectId:next.id,duration:''})
  }
  const recordRows=this.rowsWithOptions(rows,this.data.subjects),first=recordRows[0]
  this.setData({recordRows,subjectId:first.subjectId,taskId:recordRows.length===1?this.data.taskId:'',detailsExpanded:recordRows.length===1&&this.data.detailsExpanded},()=>{this.updateTasks();this.saveDraft()})
 },
 rowSubjectChange(e){
  const index=Number(e.currentTarget.dataset.index),rows=this.data.recordRows.slice(),row=rows[index],subject=row.options[Number(e.detail.value)]
  if(!row||!subject)return
  rows[index]=Object.assign({},row,{subjectId:subject.id})
  const recordRows=this.rowsWithOptions(rows,this.data.subjects),first=recordRows[0]
  this.setData({recordRows,subjectId:first.subjectId,taskId:recordRows.length===1?this.data.taskId:''},()=>{if(index===0)this.updateTasks();this.saveDraft()})
 },
 rowDurationInput(e){
  const index=Number(e.currentTarget.dataset.index),rows=this.data.recordRows.slice()
  rows[index]=Object.assign({},rows[index],{duration:e.detail.value})
  this.setData({recordRows:rows},()=>this.saveDraft())
 },
 rowQuickDuration(e){
  const index=Number(e.currentTarget.dataset.index),rows=this.data.recordRows.slice()
  rows[index]=Object.assign({},rows[index],{duration:String(e.currentTarget.dataset.value)})
  this.setData({recordRows:rows},()=>this.saveDraft())
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
   if(this.data.editing)store.saveRecord({id:this.data.id,subjectId:this.data.subjectId,taskId:this.data.taskId||null,date:this.data.date,duration:Number(this.data.duration),startTime:this.data.startTime||null,endTime:this.data.endTime||null,note:this.data.note||''})
   else{
    const records=this.data.recordRows.map(row=>({subjectId:row.subjectId,taskId:this.data.recordRows.length===1?this.data.taskId||null:null,date:this.data.date,duration:Number(row.duration),startTime:this.data.recordRows.length===1?this.data.startTime||null:null,endTime:this.data.recordRows.length===1?this.data.endTime||null:null,note:this.data.note||''}))
    if(this.data.recordRows.some(row=>!String(row.duration).trim()))throw new Error('请填写每个科目的学习时长')
    if(records.length===1)store.saveRecord(records[0]);else store.saveRecords(records)
   }
   if(!this.data.editing)wx.removeStorageSync(store.DRAFT_KEY)
   ui.toast(this.data.editing?'已更新记录':this.data.recordRows.length>1?'已保存 '+this.data.recordRows.length+' 条学习记录':'已记下这一段学习');setTimeout(()=>wx.navigateBack(),350)
  }catch(e){ui.toast(e.message)}
 },
 remove(){ui.confirm('删除这条记录？','删除后会从首页和统计中移除，无法恢复。',()=>{store.deleteRecord(this.data.id);ui.toast('记录已删除');setTimeout(()=>wx.navigateBack(),350)})},
 createSubject(){wx.navigateTo({url:'/pages/subjects/subjects'})}
})

