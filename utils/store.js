const KEY = 'study_tracker_data_v12'
const DRAFT_KEY = 'study_tracker_draft_v12'
const COLORS = ['#7061D8','#E5A65B','#67AD99','#7CA0DC','#CC8CA8','#A5A0B7']
function pad(n) { return String(n).padStart(2,'0') }
function dateKey(value) { const d=value ? new Date(value) : new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}` }
function addDays(key,n) { const d=new Date(`${key}T12:00:00`); d.setDate(d.getDate()+n); return dateKey(d) }
function timeKey(d) { return `${dateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
function timestamp(s) { return new Date(String(s).replace(' ','T')).getTime() }
function durationText(n) { n=Number(n)||0; const h=Math.floor(n/60), m=n%60; return h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分钟` }
function shortDuration(n) { n=Number(n)||0; return n>=60 ? `${(n/60).toFixed(1).replace(/\.0$/,'')}h` : `${n}m` }
function uid(p) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,10)}` }
function clone(d) { return JSON.parse(JSON.stringify(d)) }
function initial() { return { schema:3, subjects:[{id:'other',name:'其他',color:COLORS[5],is_default:true}], archivedSubjects:[], tasks:[], records:[],imports:[],settings:{theme:'system',dailyReminderEnabled:false,dailyReminderTime:'20:00'},revision:0 } }
function validDate(key) { return /^\d{4}-\d{2}-\d{2}$/.test(key||'') && dateKey(`${key}T12:00:00`)===key }
function getData() {
 const raw=wx.getStorageSync(KEY),d=raw?clone(raw):initial();
 if(!Array.isArray(d.subjects)||!Array.isArray(d.tasks)||!Array.isArray(d.records))throw new Error('本地数据格式异常，请先导出备份');
 d.imports=d.imports||[];d.archivedSubjects=d.archivedSubjects||[];d.settings=Object.assign({},initial().settings,d.settings);d.revision=d.revision||0;
 if(!d.subjects.some(s=>s.id==='other'))d.subjects.push(initial().subjects[0]);
 d.tasks.forEach(t=>{
  if(t.plannedDate===undefined)t.plannedDate=validDate((t.deadline||'').slice(0,10))?t.deadline.slice(0,10):'';
  if(t.estimatedMinutes===undefined)t.estimatedMinutes=null;
  if(t.note===undefined)t.note='';
 });
 d.schema=3;
 return d;
}
function saveData(d) { d.revision=(d.revision||0)+1;d.updatedAt=new Date().toISOString();wx.setStorageSync(KEY,d);return d }
function ensureData() {
 const raw=wx.getStorageSync(KEY),d=getData();
 if(raw&&raw.schema!==3&&!wx.getStorageSync(`${KEY}_before_v2`))wx.setStorageSync(`${KEY}_before_v2`,raw);
 if(!raw||raw.schema!==3)wx.setStorageSync(KEY,d);
 return d;
}
function subject(d,id) { return d.subjects.find(s=>s.id===id)||{id:'unknown',name:'未知科目',color:COLORS[5]} }
function recordSubject(d,r) { return d.subjects.find(s=>s.id===r.subjectId)||(d.archivedSubjects||[]).find(s=>s.id===r.subjectId)||(r.subjectName?{id:r.subjectId||'unknown',name:r.subjectName,color:r.subjectColor||COLORS[5]}:subject(d,r.subjectId)) }
function isQuickRecord(r) { return r.source==='quick'&&!r.taskId&&!r.note&&!r.startTime&&!r.endTime }
function addSubject(name,color) { name=String(name||'').trim();if(!name||name.length>20)throw new Error('科目名称需为 1–20 个字');const d=getData();const old=d.subjects.find(s=>s.name===name);if(old)return old;const s={id:uid('subject'),name,color:color||COLORS[(d.subjects.length-1)%COLORS.length],is_default:false};d.subjects.push(s);saveData(d);return s }
function updateSubject(id,name) {
 const d=getData(),s=d.subjects.find(item=>item.id===id);name=String(name||'').trim();
 if(!s||s.is_default||s.id==='other')throw new Error('系统科目不可修改');
 if(!name||name.length>20)throw new Error('科目名称需为 1–20 个字');
 if(d.subjects.some(item=>item.id!==id&&item.name===name))throw new Error('已有同名科目');
 s.name=name;saveData(d);return s;
}
function deleteSubject(id) {
 const d=getData(),s=d.subjects.find(item=>item.id===id);
 if(!s||s.is_default||s.id==='other')throw new Error('其他科目为系统保留，不可删除');
 const tasks=d.tasks.filter(t=>t.subjectId===id),ids=tasks.map(t=>t.id);
 d.archivedSubjects.push(Object.assign({},s,{deleted:true}));
 d.records.forEach(r=>{
  if(r.subjectId===id){r.subjectName=s.name;r.subjectColor=s.color}
  if(ids.indexOf(r.taskId)>=0){const t=tasks.find(item=>item.id===r.taskId);r.taskName=t.title;r.taskId=null}
 });
 d.tasks=d.tasks.filter(t=>t.subjectId!==id);d.subjects=d.subjects.filter(item=>item.id!==id);
 if(d.settings.lastSubjectId===id)d.settings.lastSubjectId='other';
 saveData(d);
}
function validateRecord(r,original) {
 const today=dateKey(), min=addDays(today,-6);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||dateKey(`${r.date}T12:00:00`)!==r.date||r.date>today||(r.date<min&&(!original||original.date!==r.date)))throw new Error('只能记录今天及前 6 个自然日');
 if(!Number.isInteger(Number(r.duration))||r.duration<5||r.duration>1440||r.duration%5!==0)throw new Error('时长需为 5–1440 分钟，且为 5 的倍数');
 if((r.note||'').length>100)throw new Error('备注不能超过 100 字');
 if(r.startTime&&r.endTime&&r.endTime<r.startTime)throw new Error('结束时间不能早于开始时间；跨午夜请分两条记录');
}
function saveRecord(record) {
 const d=getData(),i=d.records.findIndex(r=>r.id===record.id),original=i>=0?d.records[i]:null;
 if(record.id&&!original)throw new Error('这条记录已不存在');
 validateRecord(record,original);
 const active=d.subjects.some(s=>s.id===record.subjectId),retained=original&&original.subjectId===record.subjectId;
 if(!active&&!retained)throw new Error('请选择有效科目');
 if(record.taskId&&!d.tasks.some(t=>t.id===record.taskId&&t.subjectId===record.subjectId))throw new Error('关联任务需属于所选科目');
 const s=recordSubject(d,Object.assign({},original,record)),task=d.tasks.find(t=>t.id===record.taskId);
 const r=Object.assign({},original,record,{id:record.id||uid('record'),duration:Number(record.duration),source:'manual',subjectName:s.name,subjectColor:s.color,taskName:task?task.title:(original&&original.subjectId===record.subjectId&&original.taskId===record.taskId?original.taskName||'':''),createdAt:original?original.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 if(i>=0)d.records[i]=r;else d.records.push(r);
 if(active)d.settings.lastSubjectId=r.subjectId;
 saveData(d);return r;
}
function adjustTodayDuration(subjectId,delta) {
 const d=getData(),today=dateKey(),amount=Number(delta),now=new Date().toISOString(),before=clone(d.records);
 if(!d.subjects.some(s=>s.id===subjectId))throw new Error('科目不存在，请刷新后重试');
 if([30,60,-30].indexOf(amount)<0)throw new Error('请选择有效的快捷时长');
 const total=d.records.filter(r=>r.date===today&&r.subjectId===subjectId).reduce((sum,r)=>sum+r.duration,0);
 let changed=0;
 if(amount>0){
  let remaining=amount;
  while(remaining>0){
   const record=d.records.slice().reverse().find(r=>r.date===today&&r.subjectId===subjectId&&isQuickRecord(r)&&r.duration<1440);
   const room=record?1440-record.duration:1440,add=Math.min(room,remaining);
   if(record){record.duration+=add;record.updatedAt=now}
   else d.records.push({id:uid('record'),subjectId,taskId:null,date:today,duration:add,startTime:null,endTime:null,note:'',source:'quick',createdAt:now,updatedAt:now});
   remaining-=add;changed+=add;
  }
 }else{
  let remaining=Math.min(Math.abs(amount),total);
  for(let i=d.records.length-1;i>=0&&remaining>0;i--){
   const record=d.records[i];
   if(record.date!==today||record.subjectId!==subjectId||!isQuickRecord(record))continue;
   const take=Math.min(record.duration,remaining);
   if(take===record.duration)d.records.splice(i,1);
   else {record.duration-=take;record.updatedAt=now}
   remaining-=take;changed-=take;
  }
 }
 if(changed){d.settings.lastSubjectId=subjectId;saveData(d)}
 return {changed,total:total+changed,undoToken:changed?{records:before,revision:d.revision}:null};
}
function undoQuickDuration(token) {
 const d=getData();
 if(!token||token.revision!==d.revision)throw new Error('记录已有更新，请到历史记录中调整');
 d.records=clone(token.records);saveData(d);
}
function deleteRecord(id) { const d=getData();d.records=d.records.filter(r=>r.id!==id);saveData(d) }
function taskStatus(t,now=Date.now()) { if(t.abandoned)return 'abandoned';if(t.completed)return 'completed';return timestamp(t.deadline)<now?'overdue':'active' }
function statusText(s) { return {active:'待完成',overdue:'已逾期',completed:'已完成',abandoned:'旧版已放弃',pending:'待补全'}[s] }
function reminderCandidates(deadline,now=Date.now()) { const dt=timestamp(deadline), day=timestamp(`${deadline.slice(0,10)} 09:00`);return [dt-86400000,day].filter((v,i,a)=>v>now&&v<dt&&a.indexOf(v)===i).sort((a,b)=>a-b) }
function saveTask(task) {
 const d=getData(),i=d.tasks.findIndex(t=>t.id===task.id),o=i>=0?d.tasks[i]:null;
 if(task.id&&!o)throw new Error('这项任务已不存在');
 const t=Object.assign({completed:false,abandoned:false,source:'manual',note:'',estimatedMinutes:null},o||{},task),title=String(t.title||'').trim();
 if(!title||title.length>60)throw new Error('任务名称需为 1–60 个字');
 if(!d.subjects.some(s=>s.id===t.subjectId))throw new Error('请选择科目');
 if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t.deadline||'')||!validDate(t.deadline.slice(0,10))||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.deadline.slice(11)))throw new Error('请填写有效截止时间');
 if(t.plannedDate===undefined)t.plannedDate=t.deadline.slice(0,10);
 if(!validDate(t.plannedDate)||t.plannedDate>t.deadline.slice(0,10))throw new Error('计划日期需为有效日期，且不能晚于截止日期');
 if(t.estimatedMinutes!==null&&t.estimatedMinutes!==''){
  t.estimatedMinutes=Number(t.estimatedMinutes);
  if(!Number.isInteger(t.estimatedMinutes)||t.estimatedMinutes<5||t.estimatedMinutes>1440||t.estimatedMinutes%5!==0)throw new Error('预计时长需为 5–1440 分钟，且为 5 的倍数');
 }else t.estimatedMinutes=null;
 t.note=String(t.note||'').trim();if(t.note.length>200)throw new Error('任务备注不能超过 200 字');
 Object.assign(t,{id:t.id||uid('task'),title,needsFill:false,createdAt:o?o.createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 t.reminderStatus=t.reminder?'unavailable':'off';
 if(t.completed||t.abandoned){t.reminder=false;t.reminderStatus='cancelled'}
 if(o&&o.subjectId!==t.subjectId)d.records.forEach(r=>{if(r.taskId===t.id){r.taskName=o.title;r.taskId=null}});
 if(i>=0)d.tasks[i]=t;else d.tasks.push(t);saveData(d);return t;
}
function toggleTask(id) { const d=getData(),t=d.tasks.find(t=>t.id===id);if(!t||t.needsFill)throw new Error('请先补全任务信息');if(t.abandoned)throw new Error('这是旧版已放弃的任务，可在详情中恢复');t.completed=!t.completed;t.completedAt=t.completed?new Date().toISOString():null;t.updatedAt=new Date().toISOString();t.reminder=false;t.reminderStatus='cancelled';saveData(d) }
function restoreTask(id) { const d=getData(),t=d.tasks.find(t=>t.id===id);if(!t||!t.abandoned)throw new Error('任务无需恢复');t.abandoned=false;t.completed=false;t.completedAt=null;t.updatedAt=new Date().toISOString();saveData(d) }
function abandonTask(id) {const d=getData(),t=d.tasks.find(t=>t.id===id);if(t){t.abandoned=true;t.completed=false;t.completedAt=null;t.reminder=false;t.reminderStatus='cancelled';saveData(d)}}
function postponeTask(id) { const d=getData(),t=d.tasks.find(t=>t.id===id);if(!t)return;const next=new Date(timestamp(t.deadline)+86400000);t.deadline=timeKey(next);t.reminderStatus=t.reminder?'unavailable':'off';saveData(d);return taskStatus(t) }
function deleteTask(id) {const d=getData(),t=d.tasks.find(item=>item.id===id);d.tasks=d.tasks.filter(item=>item.id!==id);d.records.forEach(r=>{if(r.taskId===id){r.taskName=t?t.title:r.taskName;r.taskId=null}});saveData(d)}
function weekDays(key=dateKey()) {const day=new Date(`${key}T12:00:00`).getDay()||7,start=addDays(key,1-day);return Array.from({length:7},(_,i)=>addDays(start,i))}
function monthDays(key=dateKey()) {const d=new Date(`${key}T12:00:00`),n=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();return Array.from({length:n},(_,i)=>`${key.slice(0,7)}-${pad(i+1)}`)}
function totalForDate(d,key) {return d.records.filter(r=>r.date===key).reduce((a,r)=>a+r.duration,0)}
function completedForDays(d,days) {
 return d.tasks.filter(t=>t.completed&&!t.abandoned&&t.completedAt&&days.indexOf(dateKey(t.completedAt))>=0);
}
function todayPlan(d,today=dateKey()) {
 const tasks=d.tasks.filter(t=>!t.abandoned&&t.plannedDate===today);
 const overdue=d.tasks.filter(t=>!t.completed&&!t.abandoned&&t.plannedDate!==today&&taskStatus(t)==='overdue');
 const carried=d.tasks.filter(t=>!t.completed&&!t.abandoned&&t.plannedDate&&t.plannedDate<today&&taskStatus(t)!=='overdue');
 return {tasks,overdue,carried,total:tasks.length,completed:tasks.filter(t=>t.completed).length};
}
function stats(d,days) {
 const rs=d.records.filter(r=>days.indexOf(r.date)>=0),total=rs.reduce((sum,r)=>sum+r.duration,0),activeDays=new Set(rs.map(r=>r.date)).size,bySubject={};
 rs.forEach(r=>{const s=recordSubject(d,r);if(!bySubject[s.id])bySubject[s.id]={id:s.id,name:s.name,color:s.color,total:0};bySubject[s.id].total+=r.duration});
 const subjects=Object.values(bySubject).sort((a,b)=>b.total-a.total).map(s=>Object.assign({},s,{text:durationText(s.total),percent:total?Math.round(s.total/total*100):0}));
 const daily=days.map(date=>({date,label:date.slice(5),total:totalForDate(d,date)})),average=days.length?total/days.length:0;
 return {total,totalText:durationText(total),activeDays,average,averageText:durationText(Math.round(average)),averageDays:days.length,completedTasks:completedForDays(d,days).length,subjects,daily,records:rs};
}
function demoData() {const d=initial(),today=dateKey();d.subjects.unshift({id:'math',name:'高等数学',color:COLORS[0],is_default:false},{id:'english',name:'英语',color:COLORS[1],is_default:false},{id:'coding',name:'程序设计',color:COLORS[2],is_default:false});d.tasks=[{id:'demo-task-1',title:'完成积分章节习题',subjectId:'math',deadline:`${today} 22:00`,completed:false,abandoned:false,reminder:false},{id:'demo-task-2',title:'复习 30 个英语单词',subjectId:'english',deadline:`${addDays(today,1)} 20:00`,completed:false,abandoned:false,reminder:false},{id:'demo-task-3',title:'完成数组与函数练习',subjectId:'coding',deadline:`${addDays(today,-1)} 23:00`,completed:false,abandoned:false,reminder:false},{id:'demo-task-4',title:'整理本周阅读笔记',subjectId:'english',deadline:`${addDays(today,-2)} 18:00`,completed:true,abandoned:false,reminder:false}];for(let i=0;i<7;i++){d.records.push({id:`demo-r${i}`,subjectId:['math','english','coding'][i%3],taskId:i===0?'demo-task-1':null,date:addDays(today,-i),duration:[90,60,120,45,100,75,60][i],note:i===0?'极限与连续，完成两组练习':'',createdAt:new Date().toISOString()})}d.records.push({id:'demo-extra',subjectId:'english',taskId:'demo-task-2',date:today,duration:35,note:'单词复习',createdAt:new Date().toISOString()});d.tasks.forEach(t=>{t.plannedDate=t.id==='demo-task-2'?today:t.deadline.slice(0,10);t.estimatedMinutes=45;t.note='';if(t.completed)t.completedAt=new Date(`${t.deadline.slice(0,10)}T12:00:00`).toISOString()});return d }
function loadDemo() {const d=getData();if(d.records.length||d.tasks.length||d.subjects.length>1)throw new Error('请先备份并清空数据，再载入示例');return saveData(demoData())}
function clearAll() {
 const d=initial();d.revision=getData().revision;
 const saved=saveData(d);
 wx.removeStorageSync(DRAFT_KEY);wx.removeStorageSync(`${KEY}_before_v2`);wx.removeStorageSync('nudge_seen');wx.removeStorageSync('study_plan_filter_v2');
 return saved;
}
function csv(d,days) {const rs=days?d.records.filter(r=>days.indexOf(r.date)>=0):d.records;const rows=[['学习日期','科目','时长（分钟）','关联任务','备注']];rs.forEach(r=>{const t=d.tasks.find(t=>t.id===r.taskId);rows.push([r.date,recordSubject(d,r).name,r.duration,t?t.title:r.taskName||'',r.note||''])});return '\uFEFF'+rows.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n')}
module.exports={KEY,DRAFT_KEY,COLORS,dateKey,addDays,timeKey,timestamp,durationText,shortDuration,uid,getData,saveData,ensureData,subject,recordSubject,isQuickRecord,addSubject,updateSubject,deleteSubject,validateRecord,saveRecord,adjustTodayDuration,undoQuickDuration,deleteRecord,taskStatus,statusText,reminderCandidates,saveTask,toggleTask,restoreTask,abandonTask,postponeTask,deleteTask,weekDays,monthDays,totalForDate,completedForDays,todayPlan,stats,loadDemo,clearAll,csv}
