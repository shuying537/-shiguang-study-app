const store=require('./store')
const ui=require('./ui')
const importPlan=require('./importPlan')
const {reviewRows,validMinutes}=require('./plan-review')

const data={text:'',lineCount:0,showPreview:false,createSubjects:true,subjectOptions:[],rows:[],dailyLoads:[],importing:false,importDone:false,editingPlan:false,
 summary:{total:0,importable:0,skipped:0,warnings:0,blocked:0,defaulted:0,newSubjects:[],newSubjectsText:''}}
const methods={
 planInput(e){this.setData({text:e.detail.value,lineCount:e.detail.value.split(/\r?\n/).filter(s=>s.trim()).length,showPreview:false,importDone:false})},
 toggleCreate(e){this.setData({createSubjects:e.detail.value});if(this.data.showPreview)this.parse()},
 importOptions(){const d=store.getData();return {today:store.dateKey(),subjects:d.subjects,tasks:d.tasks,createSubjects:this.data.createSubjects,constraints:this.getPlanConstraints?this.getPlanConstraints():null}},
 parse(){
  if(!String(this.data.text||'').trim()){ui.toast('请先粘贴计划文本');return}
  try{
   const options=this.importOptions()
   const result=importPlan.parsePlan(this.data.text,Object.assign({},options,{createSubjects:options.constraints?true:options.createSubjects}))
   this.editIndex=-1;this.editDraft=null
   this.setData({showPreview:true,importDone:false,editingPlan:false})
   this.applyRows(result.rows)
   if(!result.rows.length)ui.toast('没有识别到任务，请检查每行是否都有任务名')
  }catch(e){ui.toast(e.message)}
 },
 buildSubjectOptions(rows){
  const options=this.importOptions(),rules=options.constraints
  if(rules)return options.subjects.filter(s=>rules.subjectIds.includes(s.id)).map(s=>({id:s.id,name:s.name}))
  const list=options.subjects.map(s=>({id:s.id,name:s.name}))
  ;(rows||this.data.rows).forEach(r=>{if(r.subjectName&&!list.some(s=>s.name===r.subjectName))list.push({id:'',name:r.subjectName})})
  return list
 },
 applyRows(rows){
  const result=reviewRows(rows,this.importOptions())
  const subjectOptions=this.buildSubjectOptions(result.rows),draft=this.editDraft
  if(draft&&result.rows[this.editIndex])Object.assign(result.rows[this.editIndex],{
   editing:true,editTitle:draft.title,editDate:draft.date,editTime:draft.time,editMinutes:draft.minutes,
   editSubjectIndex:draft.subjectIndex,editSubjectName:subjectOptions[draft.subjectIndex]?subjectOptions[draft.subjectIndex].name:'请选择科目',
  })
  this.setData(Object.assign({},result,{subjectOptions}))
  return result
 },
 startEdit(e){
  const index=Number(e.currentTarget.dataset.index),row=this.data.rows[index]
  if(!row)return
  const options=this.buildSubjectOptions(),idx=Math.max(0,options.findIndex(s=>s.id?s.id===row.subjectId:s.name===row.subjectName))
  const date=String(row.deadline||'').slice(0,10)||store.dateKey(),time=String(row.deadline||'').slice(11)||'23:59'
  this.editIndex=index;this.editDraft={title:row.title,date,time,subjectIndex:idx,minutes:row.estimatedMinutes==null?'':String(row.estimatedMinutes)}
  this.setData({subjectOptions:options,editingPlan:true,rows:this.data.rows.map((r,i)=>Object.assign({},r,{editing:i===index},i===index?{
   editTitle:row.title,editDate:date,editTime:time,editMinutes:this.editDraft.minutes,editSubjectIndex:idx,editSubjectName:options[idx]?options[idx].name:'请选择科目',
  }:{}))})
 },
 editTitle(e){if(this.editDraft)this.editDraft.title=e.detail.value},
 editMinutes(e){if(this.editDraft)this.editDraft.minutes=e.detail.value},
 editDate(e){if(this.editDraft){this.editDraft.date=e.detail.value;this.patchEditingRow({editDate:e.detail.value})}},
 editTime(e){if(this.editDraft){this.editDraft.time=e.detail.value;this.patchEditingRow({editTime:e.detail.value})}},
 editSubject(e){
  if(!this.editDraft)return
  const index=Number(e.detail.value),option=this.data.subjectOptions[index]
  if(!option)return
  this.editDraft.subjectIndex=index;this.patchEditingRow({editSubjectIndex:index,editSubjectName:option.name})
 },
 patchEditingRow(patch){this.setData({rows:this.data.rows.map((r,i)=>i===this.editIndex?Object.assign({},r,{editTitle:this.editDraft.title,editMinutes:this.editDraft.minutes},patch):r)})},
 cancelEdit(){this.setData({editingPlan:false,rows:this.data.rows.map(r=>Object.assign({},r,{editing:false}))});this.editIndex=-1;this.editDraft=null},
 saveEdit(){
  const draft=this.editDraft
  if(!draft)return
  const title=String(draft.title||'').replace(/\s+/g,' ').trim(),deadline=draft.date+' '+draft.time
  const parsed=importPlan.parseDateToken(deadline,store.dateKey())
  if(!title||title.length>60){ui.toast('任务名称需为 1–60 个字');return}
  if(!/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(deadline)||!parsed||parsed.deadline!==deadline){ui.toast('请选择有效的日期和时间');return}
  const estimatedMinutes=String(draft.minutes).trim()===''?null:Number(draft.minutes)
  if(estimatedMinutes!==null&&!validMinutes(estimatedMinutes)){ui.toast('预计时长需为 5–1440 分钟，且为 5 的倍数');return}
  const option=this.data.subjectOptions[draft.subjectIndex]
  if(!option){ui.toast('请选择有效科目');return}
  const rows=this.data.rows.map((r,i)=>i===this.editIndex?Object.assign({},r,{title,deadline,plannedDate:draft.date,subjectId:option.id,subjectName:option.name,hasSubject:true,hasDate:true,defaulted:false,dateWarning:'',estimatedMinutes,durationError:false,edited:true}):r)
  this.editIndex=-1;this.editDraft=null;this.setData({editingPlan:false});this.applyRows(rows)
 },
 toggleExclude(e){
  if(this.editDraft){ui.toast('请先完成或取消当前编辑');return}
  const index=Number(e.currentTarget.dataset.index)
  this.applyRows(this.data.rows.map((r,i)=>i===index?Object.assign({},r,{excluded:!r.excluded}):r))
 },
 confirmImport(){
  if(this.data.importing||this.data.importDone)return
  if(this.editDraft){ui.toast('请先完成或取消当前编辑');return}
  try{
   const result=this.applyRows(this.data.rows)
   if(this.getPlanConstraints&&result.summary.blocked){ui.toast('请先修正或排除待处理的任务');return}
   const rows=result.rows.filter(r=>r.importable)
   if(!rows.length){ui.toast('没有可导入的任务');return}
   this.setData({importing:true})
   const saved=store.importTasks(rows,{createSubjects:this.data.createSubjects})
   if(!saved.added.length){ui.toast('没有新增任务，可能都已存在');return}
   this.setData({importDone:true})
   ui.toast('已导入 '+saved.added.length+' 条'+(saved.created.length?'，新建科目 '+saved.created.length+' 个':''))
   if(this.getPlanConstraints){this.applyRows(this.data.rows)}else setTimeout(()=>wx.navigateBack(),700)
  }catch(e){ui.toast(e.message)}finally{this.setData({importing:false})}
 },
}
module.exports={data,methods}
