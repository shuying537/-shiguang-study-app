const store = require('../../utils/store')
const ui = require('../../utils/ui')
const planImport = require('../../utils/plan-import-page')

function buildPrompt(input) {
 const subjects=input.subjects.map(s=>s.name).join('、')
 return [
  '请根据以下信息制定一份可执行、节奏合理的学习计划。',
  '',
  '【学习信息】',
  '目标：'+input.title,
  '目标日期：'+input.targetDate,
  '可安排科目：'+subjects,
  '每天可学习：'+input.dailyMinutes+' 分钟',
  '当前学习情况：'+(input.situation||'未填写'),
  '',
  '【安排要求】',
  '1. 从今天（'+input.today+'）开始安排，所有任务日期不得晚于目标日期。',
  '2. 只安排在上述科目中，不要增加其他科目。',
  '3. 每天的任务总量要符合每天可学习时间，留出休息和机动时间，避免排得过满。',
  '4. 根据我提供的学习情况安排复习、练习和回顾；不要臆造教材章节、考试范围或我的学习进度。',
  '5. 将计划拆成明确、可完成的任务，任务名称不超过 60 个字；每条附预计用时，以 5 分钟为单位，每条 5–1440 分钟。',
  '6. 先生成最近 7 天的详细安排（目标日期更早则只到目标日期），下次根据实际完成情况再生成下一周。每天预计时长合计不得超过 '+input.dailyMinutes+' 分钟。',
  '',
  '【输出格式】',
  '只输出任务行，不要标题、解释、编号、项目符号或 Markdown 代码块。每行一个任务，严格使用：任务名称 [科目] YYYY-MM-DD HH:mm 预计30分钟',
  '日期使用完整年份，时间使用 24 小时制；这里的日期是该任务安排日期，时间是当天的截止时间。科目名称必须与上面提供的名称完全一致。',
  '格式示例（日期、科目与时长请替换为本次安排）：复习基础并整理错题 ['+input.subjects[0].name+'] '+input.today+' 19:30 预计30分钟',
 ].join('\n')
}

Page(Object.assign({},planImport.methods,{
 data: Object.assign({},planImport.data,{
  theme:'light',goals:[],goalIndex:0,goalId:'',title:'',targetDate:'',today:'',subjects:[],selectedSubjectIds:[],
  dailyMinutes:'120',situation:'',prompt:'',promptReady:false,loadError:false
 }),
 onShow() { this.load() },
 load() {
  try {
   ui.applyTheme(this)
   const d=store.getData(),today=store.dateKey(),goals=store.goalList(d,today)
   const requested=wx.getStorageSync('study_ai_goal_v1')||''
   const goalIndex=Math.max(0,goals.findIndex(g=>g.id===requested)),goal=goals[goalIndex]
   const preferred=d.settings.lastSubjectId
   const fallback=d.subjects.some(s=>s.id===preferred)?preferred:d.subjects[0].id
   const selectedSubjectIds=this.loaded?this.data.selectedSubjectIds.filter(id=>d.subjects.some(s=>s.id===id)):goal&&goal.subjectIds.length?goal.subjectIds.slice():[fallback]
   this.setData({
    theme:d.settings.theme==='dark'?'dark':this.data.theme,today,goals,goalIndex,goalId:goal?goal.id:'',
    title:this.data.title||goal&&goal.title||'',targetDate:this.data.targetDate||goal&&goal.date||store.addDays(today,30),
    subjects:d.subjects.map(s=>Object.assign({},s,{selected:selectedSubjectIds.includes(s.id)})),
    selectedSubjectIds,loadError:false
   })
   this.loaded=true
   if(this.data.showPreview)this.applyRows(this.data.rows)
  } catch(e) { this.setData({loadError:true});ui.toast(e.message) }
 },
 goalChange(e) {
  const index=Number(e.detail.value),goal=this.data.goals[index]
  if(!goal)return
  wx.setStorageSync('study_ai_goal_v1',goal.id)
  this.setData({goalIndex:index,goalId:goal.id,title:goal.title,targetDate:goal.date,selectedSubjectIds:goal.subjectIds.slice(),subjects:this.data.subjects.map(s=>Object.assign({},s,{selected:goal.subjectIds.includes(s.id)})),prompt:'',promptReady:false,showPreview:false,importDone:false})
 },
 dateChange(e) { this.setData({targetDate:e.detail.value,prompt:'',promptReady:false,showPreview:false,importDone:false}) },
 toggleSubject(e) {
  const id=e.currentTarget.dataset.id,selectedSubjectIds=this.data.selectedSubjectIds.slice(),index=selectedSubjectIds.indexOf(id)
  if(index>=0)selectedSubjectIds.splice(index,1);else selectedSubjectIds.push(id)
  this.setData({selectedSubjectIds,subjects:this.data.subjects.map(s=>Object.assign({},s,{selected:selectedSubjectIds.includes(s.id)})),prompt:'',promptReady:false,showPreview:false,importDone:false})
 },
 input(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value,prompt:'',promptReady:false,showPreview:false,importDone:false}) },
 getPlanConstraints() {
  const today=store.dateKey()
  if(!String(this.data.title).trim())throw new Error('请填写目标名称')
  const date=require('../../utils/importPlan').parseDateToken(this.data.targetDate,today)
  if(!date||date.date!==this.data.targetDate)throw new Error('请选择有效目标日期')
  if(this.data.targetDate<today)throw new Error('目标日期不能早于今天')
  const selected=this.data.subjects.filter(s=>this.data.selectedSubjectIds.includes(s.id))
  if(!selected.length)throw new Error('至少选择一个科目')
  const dailyMinutes=Number(this.data.dailyMinutes)
  if(!Number.isInteger(dailyMinutes)||dailyMinutes<15||dailyMinutes>720)throw new Error('每日可用时长需为 15–720 分钟')
  return {targetDate:this.data.targetDate,subjectIds:selected.map(s=>s.id),dailyMinutes}
 },
 generate() {
  try{
  const rules=this.getPlanConstraints(),selected=this.data.subjects.filter(s=>rules.subjectIds.includes(s.id))
  const prompt=buildPrompt({
   title:String(this.data.title).trim(),targetDate:this.data.targetDate,today:store.dateKey(),
   subjects:selected,dailyMinutes:rules.dailyMinutes,situation:String(this.data.situation||'').trim(),
  })
  this.setData({prompt,promptReady:true})
  }catch(e){ui.toast(e.message)}
 },
 copyPrompt() {
  if(!this.data.prompt)return
  wx.setClipboardData({data:this.data.prompt,success:()=>ui.toast('提示词已复制'),fail:()=>ui.toast('复制失败，可长按提示词手动复制')})
 },
 openImport() { wx.pageScrollTo({selector:'.ai-result-section'}) },
 viewPlan(){wx.switchTab({url:'/pages/list/list'})},
}))
