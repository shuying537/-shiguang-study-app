const store = require('../../utils/store')
const ui = require('../../utils/ui')

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
  '5. 将计划拆成明确、可完成的任务，任务名称不超过 60 个字。',
  '',
  '【输出格式】',
  '只输出任务行，不要标题、解释、编号、项目符号或 Markdown 代码块。每行一个任务，严格使用：任务名称 [科目] YYYY-MM-DD HH:mm',
  '日期使用完整年份，时间使用 24 小时制；这里的日期是该任务安排日期。科目名称必须与上面提供的名称完全一致。',
  '示例：复习函数基础并整理错题 [数学] 2026-11-02 19:30',
 ].join('\n')
}

Page({
 data: {
  theme:'light',goals:[],goalIndex:0,goalId:'',title:'',targetDate:'',today:'',subjects:[],selectedSubjectIds:[],
  dailyMinutes:'120',situation:'',prompt:'',promptReady:false,loadError:false
 },
 onShow() { this.load() },
 load() {
  try {
   ui.applyTheme(this)
   const d=store.getData(),today=store.dateKey(),goals=store.goalList(d,today)
   const requested=wx.getStorageSync('study_ai_goal_v1')||''
   const goalIndex=Math.max(0,goals.findIndex(g=>g.id===requested)),goal=goals[goalIndex]
   const preferred=d.settings.lastSubjectId
   const fallback=d.subjects.some(s=>s.id===preferred)?preferred:d.subjects[0].id
   const selectedSubjectIds=goal?goal.subjectIds.slice():this.data.selectedSubjectIds.length?this.data.selectedSubjectIds:[fallback]
   this.setData({
    theme:d.settings.theme==='dark'?'dark':this.data.theme,today,goals,goalIndex,goalId:goal?goal.id:'',
    title:this.data.title||goal&&goal.title||'',targetDate:this.data.targetDate||goal&&goal.date||store.addDays(today,30),
    subjects:d.subjects.map(s=>Object.assign({},s,{selected:selectedSubjectIds.includes(s.id)})),
    selectedSubjectIds,loadError:false
   })
  } catch(e) { this.setData({loadError:true});ui.toast(e.message) }
 },
 goalChange(e) {
  const index=Number(e.detail.value),goal=this.data.goals[index]
  if(!goal)return
  wx.setStorageSync('study_ai_goal_v1',goal.id)
  this.setData({goalIndex:index,goalId:goal.id,title:goal.title,targetDate:goal.date,selectedSubjectIds:goal.subjectIds.slice(),subjects:this.data.subjects.map(s=>Object.assign({},s,{selected:goal.subjectIds.includes(s.id)})),prompt:'',promptReady:false})
 },
 dateChange(e) { this.setData({targetDate:e.detail.value,prompt:'',promptReady:false}) },
 toggleSubject(e) {
  const id=e.currentTarget.dataset.id,selectedSubjectIds=this.data.selectedSubjectIds.slice(),index=selectedSubjectIds.indexOf(id)
  if(index>=0)selectedSubjectIds.splice(index,1);else selectedSubjectIds.push(id)
  this.setData({selectedSubjectIds,subjects:this.data.subjects.map(s=>Object.assign({},s,{selected:selectedSubjectIds.includes(s.id)})),prompt:'',promptReady:false})
 },
 input(e) { this.setData({[e.currentTarget.dataset.field]:e.detail.value,prompt:'',promptReady:false}) },
 generate() {
  if(!String(this.data.title).trim()){ui.toast('请填写目标名称');return}
  if(!this.data.targetDate){ui.toast('请选择目标日期');return}
  if(this.data.targetDate<this.data.today){ui.toast('目标日期不能早于今天');return}
  const selected=this.data.subjects.filter(s=>this.data.selectedSubjectIds.includes(s.id))
  if(!selected.length){ui.toast('至少选择一个科目');return}
  const dailyMinutes=Number(this.data.dailyMinutes)
  if(!Number.isInteger(dailyMinutes)||dailyMinutes<15||dailyMinutes>720){ui.toast('每日可用时长需为 15–720 分钟');return}
  const prompt=buildPrompt({
   title:String(this.data.title).trim(),targetDate:this.data.targetDate,today:this.data.today,
   subjects:selected,dailyMinutes,situation:String(this.data.situation||'').trim(),
  })
  this.setData({prompt,promptReady:true})
 },
 copyPrompt() {
  if(!this.data.prompt)return
  wx.setClipboardData({data:this.data.prompt,success:()=>ui.toast('提示词已复制'),fail:()=>ui.toast('复制失败，可长按提示词手动复制')})
 },
 openImport() { wx.navigateTo({url:'/pages/import/import'}) },
})
