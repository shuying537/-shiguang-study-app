const test=require('node:test')
const assert=require('node:assert/strict')
const {parsePlan}=require('../utils/importPlan')
const {reviewRows}=require('../utils/plan-review')
const today='2026-10-22'
const subjects=[{id:'other',name:'其他'},{id:'math',name:'数学'},{id:'english',name:'英语'}]
const constraints={targetDate:'2026-11-01',subjectIds:['math'],dailyMinutes:120}
const options={today,subjects,tasks:[],constraints,createSubjects:true}
const parsed=text=>parsePlan(text,options).rows
const review=(text,extra={})=>reviewRows(parsed(text),Object.assign({},options,extra))

test('AI drafts retain estimates and accept Markdown fences without creating tasks from them',()=>{
 const result=review('```text\n复习函数 [数学] 2026-10-23 20:00 预计30分钟\n练习导数 [数学] 2026-10-23 21:00 【预计时长：45 分钟】\n```')
 assert.equal(result.summary.importable,2)
 assert.deepEqual(result.rows.map(r=>[r.title,r.estimatedMinutes]),[['复习函数',30],['练习导数',45]])
 assert.equal(result.dailyLoads[0].totalMinutes,75)
})

test('AI drafts require explicit valid dates within today and the goal deadline',()=>{
 const result=review([
  '复习 [数学] 预计30分钟',
  '错日期 [数学] 2026-02-30 20:00 预计30分钟',
  '过期 [数学] 2026-10-21 20:00 预计30分钟',
  '过远 [数学] 2026-11-02 20:00 预计30分钟',
  '只有时间 [数学] 截止18:00 预计30分钟',
 ].join('\n'))
 assert.equal(result.summary.blocked,5)
 assert.match(result.rows[0].reason,/未识别到任务日期/)
 assert.match(result.rows[1].reason,/未识别到任务日期/)
 assert.match(result.rows[2].reason,/早于今天/)
 assert.match(result.rows[3].reason,/超出目标日期/)
 assert.match(result.rows[4].reason,/未识别到任务日期/)
})

test('missing, unknown and unselected subjects need correction in AI drafts',()=>{
 const result=review('复习 2026-10-23 20:00 预计30分钟\n听力 [英语] 2026-10-23 20:00 预计30分钟\n阅读 [法语] 2026-10-23 20:00 预计30分钟')
 assert.equal(result.summary.blocked,3)
 result.rows.forEach(r=>assert.match(r.reason,/科目不在已选范围/))
 assert.deepEqual(result.summary.newSubjects,[])
})

test('AI estimates must be present, integral, in range and multiples of five',()=>{
 for(const suffix of ['', '预计0分钟','预计32分钟','预计30.5分钟','预计1445分钟','预计半小时']){
  const result=review('复习 [数学] 2026-10-23 20:00 '+suffix)
  assert.equal(result.summary.blocked,1,suffix)
  assert.match(result.rows[0].reason,/时长/)
 }
})

test('daily workloads count active existing tasks and report unknown estimates',()=>{
 const tasks=[
  {plannedDate:'2026-10-23',estimatedMinutes:60},
  {plannedDate:'2026-10-23',estimatedMinutes:null},
  {plannedDate:'2026-10-23',estimatedMinutes:500,completed:true},
  {plannedDate:'2026-10-23',estimatedMinutes:500,abandoned:true},
 ]
 const result=review('复习 [数学] 2026-10-23 20:00 预计45分钟\n练习 [数学] 2026-10-23 21:00 预计30分钟',{tasks})
 assert.equal(result.summary.blocked,2)
 assert.equal(result.dailyLoads[0].totalMinutes,135)
 assert.equal(result.dailyLoads[0].unknownCount,1)
 const rows=result.rows.map((r,i)=>Object.assign({},r,{excluded:i===1}))
 const revised=reviewRows(rows,Object.assign({},options,{tasks}))
 assert.equal(revised.summary.blocked,0)
 assert.equal(revised.summary.importable,1)
 assert.equal(revised.dailyLoads[0].totalMinutes,105)
})

test('edits and exclusions recalculate duplicate and invalid row status',()=>{
 const original=review('复习 [数学] 2026-10-23 20:00 预计30分钟\n复习 [数学] 2026-10-23 20:00 预计30分钟\n说明文字')
 assert.equal(original.rows[1].duplicate,true)
 assert.equal(original.summary.blocked,1)
 const excluded=reviewRows(original.rows.map((r,i)=>Object.assign({},r,{excluded:i===0||i===2})),options)
 assert.equal(excluded.rows[1].importable,true)
 assert.equal(excluded.summary.blocked,0)
 const edited=Object.assign({},original.rows[2],{title:'修正后的任务',subjectId:'math',subjectName:'数学',hasSubject:true,hasDate:true,deadline:'2026-10-24 20:00',estimatedMinutes:30})
 assert.equal(reviewRows([edited],options).summary.importable,1)
})

test('existing duplicates and excluded invalid rows do not block AI imports',()=>{
 const tasks=[{title:'复习',subjectId:'math',deadline:'2026-10-23 20:00',plannedDate:'2026-10-23',estimatedMinutes:30}]
 const result=review('复习 [数学] 2026-10-23 20:00 预计30分钟\n练习 [数学] 2026-10-23 21:00 预计30分钟',{tasks})
 assert.equal(result.summary.importable,1)
 assert.equal(result.summary.blocked,0)
 assert.equal(result.dailyLoads[0].totalMinutes,60)
})

test('generic imports keep default planned dates, allow missing estimates and create subjects',()=>{
 const generic={today,subjects,tasks:[],createSubjects:true}
 const rows=parsePlan('整理笔记\n阅读 [法语] 2026-10-24 20:00',generic).rows
 const result=reviewRows(rows,generic)
 assert.equal(result.rows[0].plannedDate,today)
 assert.equal(result.rows[0].deadline,'2026-10-29 23:59')
 assert.equal(result.rows[0].estimatedMinutes,null)
 assert.equal(result.summary.importable,2)
 assert.deepEqual(result.summary.newSubjects,['法语'])
})

test('generic imports retain unrecognized date warnings and do not mislabel time-only deadlines',()=>{
 const generic={today,subjects,tasks:[],createSubjects:true}
 const rows=parsePlan('错日期 [数学] 2026-02-30 20:00\n整理笔记 [数学] 截止18:00',generic).rows
 const result=reviewRows(rows,generic)
 assert.match(result.rows[0].reason,/没能识别日期/)
 assert.equal(result.rows[1].deadline,today+' 18:00')
 assert.doesNotMatch(result.rows[1].reason,/7 天后/)
 assert.equal(result.summary.defaulted,1)
})

test('more than 300 tasks are rejected instead of silently truncating the draft',()=>{
 assert.throws(()=>parsePlan(Array.from({length:301},(_,i)=>'任务'+i).join('\n'),options),/最多导入 300 条/)
})

test('generic imports fall back to the first subject when other is removed',()=>{
 const custom={today,subjects:[{id:'math',name:'数学'}],tasks:[],createSubjects:false}
 const result=reviewRows(parsePlan('整理笔记\n阅读 [法语] 2026-10-24 20:00',custom).rows,custom)
 assert.equal(result.rows[0].subjectId,'math')
 assert.equal(result.rows[0].subjectName,'数学')
 assert.equal(result.rows[1].subjectId,'math')
 assert.equal(result.rows[1].subjectName,'数学')
})
