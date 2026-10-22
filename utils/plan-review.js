// Pure validation, shared by the AI workflow and the general text importer.
const { parseDateToken } = require('./importPlan')
const nameKey = value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
const taskKey = (title, subject, deadline) => String(title || '').replace(/\s+/g, '').toLowerCase() + '|' + subject + '|' + deadline
function validMinutes(value) { return Number.isInteger(value) && value >= 5 && value <= 1440 && value % 5 === 0 }

function reviewRows(input, options) {
 const opts=options||{},subjects=opts.subjects||[],tasks=opts.tasks||[],rules=opts.constraints||null
 const existing=new Set(tasks.filter(t=>t.title&&t.deadline).map(t=>taskKey(t.title,t.subjectId,t.deadline))),seen=new Set()
 const byDay=Object.create(null)
 const dayFor=date=>byDay[date]||(byDay[date]={date,existingMinutes:0,draftMinutes:0,unknownCount:0,taskCount:0})
 tasks.filter(t=>!t.completed&&!t.abandoned&&t.plannedDate).forEach(t=>{
  const day=dayFor(t.plannedDate)
  if(validMinutes(t.estimatedMinutes))day.existingMinutes+=t.estimatedMinutes
  else day.unknownCount++
 })
 const rows=(input||[]).map(row=>{
  const r=Object.assign({},row,{editing:false}),errors=[],warnings=[]
  const defaulted=r.defaulted===true||(r.defaulted===undefined&&r.hasDate===false)
  r.title=String(r.title||'').replace(/\s+/g,' ').trim()
  r.deadline=String(r.deadline||'')
  if(!r.title||r.title.length>60)errors.push('任务名称需为 1–60 个字')
  const parsed=parseDateToken(r.deadline,opts.today)
  const validDate=/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/.test(r.deadline)&&parsed&&parsed.deadline===r.deadline
  if(!validDate)errors.push('日期或时间无效，请编辑修正')
  if(rules&&r.hasDate===false)errors.push('未识别到任务日期，请编辑确认日期')
  if(!rules&&defaulted)warnings.push('没有写截止时间，默认安排在 7 天后')
  if(r.dateWarning)warnings.push(r.dateWarning)
  if(validDate&&r.deadline.slice(0,10)<opts.today){
   if(rules)errors.push('任务日期早于今天，请重新安排')
   else warnings.push('截止时间已过，导入后会显示为逾期')
  }
  if(rules&&validDate&&r.deadline.slice(0,10)>rules.targetDate)errors.push('任务日期超出目标日期 '+rules.targetDate)
  const target=subjects.find(s=>s.id===r.subjectId)||subjects.find(s=>nameKey(s.name)===nameKey(r.subjectName))
  if(target){r.subjectId=target.id;r.subjectName=target.name;r.newSubject=false}
  else if(rules){r.subjectId='';r.newSubject=false}
  else if(opts.createSubjects!==false&&r.subjectName&&r.subjectName.length<=20){r.subjectId='';r.newSubject=true;warnings.push('将新建科目「'+r.subjectName+'」')}
  else{const fallback=subjects.find(s=>s.id==='other')||subjects[0];r.subjectId=fallback?fallback.id:'other';r.subjectName=fallback?fallback.name:'其他';r.newSubject=false;warnings.push('未匹配科目，归入「'+r.subjectName+'」')}
  if(rules&&(r.hasSubject===false||!target||!rules.subjectIds.includes(target.id)))errors.push('科目不在已选范围，请编辑选择科目')
  if(r.estimatedMinutes===''||r.estimatedMinutes===undefined)r.estimatedMinutes=null
  if(r.durationError||(r.estimatedMinutes!==null&&!validMinutes(r.estimatedMinutes)))errors.push('预计时长需为 5–1440 分钟，且为 5 的倍数')
  else if(rules&&r.estimatedMinutes===null)errors.push('缺少预计时长，请编辑补充分钟数')
  if(validDate&&(rules||r.hasDate!==false||!r.plannedDate))r.plannedDate=r.deadline.slice(0,10)
  const key=taskKey(r.title,r.subjectId||'name:'+nameKey(r.subjectName),r.deadline)
  r.duplicate=false
  if(!r.excluded&&!errors.length){
   if(existing.has(key)||seen.has(key))r.duplicate=true
   else seen.add(key)
  }
  r.errors=errors;r.warnings=warnings;r.defaulted=defaulted
  if(!r.excluded&&!r.duplicate&&!errors.length&&validDate){
   const day=dayFor(r.plannedDate);day.taskCount++
   if(validMinutes(r.estimatedMinutes))day.draftMinutes+=r.estimatedMinutes
   else day.unknownCount++
  }
  return r
 })
 const dailyLoads=Object.values(byDay).filter(day=>day.taskCount).sort((a,b)=>a.date.localeCompare(b.date)).map(day=>Object.assign(day,{
  totalMinutes:day.existingMinutes+day.draftMinutes,
  overloaded:!!rules&&day.existingMinutes+day.draftMinutes>rules.dailyMinutes,
 }))
 const overloaded=new Set(dailyLoads.filter(day=>day.overloaded).map(day=>day.date))
 rows.forEach(r=>{
  if(rules&&!r.excluded&&!r.duplicate&&!r.errors.length&&overloaded.has(r.plannedDate))r.errors.push('当天预计总时长超过 '+rules.dailyMinutes+' 分钟，请减少时长、改期或排除部分任务')
  r.importable=!r.excluded&&!r.duplicate&&!r.errors.length
  r.status=r.excluded?'excluded':r.duplicate?'duplicate':r.errors.length?'invalid':r.edited||r.warnings.length?'warn':'ok'
  r.tone=r.excluded||r.duplicate?'muted':r.errors.length?'danger':r.status==='warn'?'warning':'success'
  r.badge=r.excluded?'已排除':r.duplicate?'重复':r.errors.length?'待修正':r.edited?'已修改':r.warnings.length?'需注意':'可导入'
  r.reason=r.excluded?'这条不会导入，可恢复后继续检查':r.duplicate?'与已有任务或本次其他任务重复，导入时跳过':r.errors.concat(r.warnings).join('；')
  r.metaText=r.subjectName+' · '+r.deadline.slice(5)+(r.estimatedMinutes!==null?' · '+r.estimatedMinutes+' 分钟':'')+(r.defaulted?'（默认）':'')
 })
 const newSubjects=[]
 rows.filter(r=>r.importable&&r.newSubject).forEach(r=>{if(!newSubjects.includes(r.subjectName))newSubjects.push(r.subjectName)})
 return {rows,dailyLoads,summary:{
  total:rows.length,importable:rows.filter(r=>r.importable).length,skipped:rows.filter(r=>!r.importable).length,
  blocked:rows.filter(r=>!r.excluded&&!r.duplicate&&r.errors.length).length,
  warnings:rows.filter(r=>r.status==='warn').length,defaulted:rows.filter(r=>r.importable&&r.defaulted).length,
  newSubjects,newSubjectsText:newSubjects.join('、'),
 }}
}
module.exports={reviewRows,validMinutes}
