const store = require('../../utils/store')
const ui = require('../../utils/ui')

Page({
  data: {
    theme: 'light', dateLabel: '', todayText: '0分钟', weekText: '0分钟',
    subjects: [], tasks: [], todayTotal: 0, todayCompleted: 0, overdueCount: 0,
    carriedCount: 0, quickTip: '', canUndo: false, expanded: false, showNudge: false
  },
  onShow() { this.refresh() },
  onPullDownRefresh() { this.refresh(); wx.stopPullDownRefresh() },
  refresh() {
    try {
      ui.applyTheme(this)
      const d = store.getData(), today = store.dateKey(), plan = store.todayPlan(d, today)
      const subjects = d.subjects.slice().sort((a,b) => Number(!!a.is_default)-Number(!!b.is_default)).map(s => {
        const records = d.records.filter(r => r.date === today && r.subjectId === s.id)
        const minutes = records.reduce((sum,r) => sum+r.duration,0)
        const quickMinutes = records.filter(store.isQuickRecord).reduce((sum,r) => sum+r.duration,0)
        return Object.assign({},s,{minutes,quickMinutes,canDecrease:quickMinutes>0,text:minutes%30===0?(minutes/60).toFixed(1)+'h':minutes+'m'})
      })
      const tasks = plan.tasks.slice().sort((a,b) => Number(a.completed)-Number(b.completed)||store.timestamp(a.deadline)-store.timestamp(b.deadline)).map(t => ui.taskView(d,t))
      this.allTodayTasks = tasks
      this.setData({
        today, dateLabel: (new Date().getMonth()+1)+'月'+new Date().getDate()+'日 · '+['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date().getDay()],
        todayText: store.durationText(store.totalForDate(d,today)),
        weekText: store.stats(d,store.weekDays(today)).totalText,
        subjects, tasks: this.data.expanded?tasks:tasks.slice(0,3),
        todayTotal: plan.total, todayCompleted: plan.completed,
        overdueCount: plan.overdue.length, carriedCount: plan.carried.length,
        noCustomSubjects: d.subjects.length===1
      })
      this.checkNudge(d,today)
    } catch(e) { ui.toast(e.message) }
  },
  checkNudge(d,today) {
    this.setData({showNudge:false})
    if(!d.settings.dailyReminderEnabled||store.totalForDate(d,today)>0)return
    const now=new Date(),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0')
    if(time>=d.settings.dailyReminderTime&&wx.getStorageSync('nudge_seen')!==today){
      this.setData({showNudge:true});wx.setStorageSync('nudge_seen',today)
    }
  },
  adjustDuration(e) {
    try {
      const id=e.currentTarget.dataset.id,minutes=Number(e.currentTarget.dataset.minutes)
      const subject=this.data.subjects.find(s=>s.id===id),result=store.adjustTodayDuration(id,minutes)
      if(!result.changed){ui.toast('详细记录请在历史记录中修改');return}
      this.undoToken=result.undoToken
      clearTimeout(this.undoTimer)
      this.setData({canUndo:true,quickTip:subject.name+' · '+(result.changed>0?'已增加 ':'已减少 ')+store.durationText(Math.abs(result.changed))})
      this.refresh()
      this.undoTimer=setTimeout(()=>{this.undoToken=null;this.setData({canUndo:false,quickTip:''})},5000)
    }catch(e){ui.toast(e.message)}
  },
  undo() {
    try {store.undoQuickDuration(this.undoToken);this.clearUndo();this.refresh();ui.toast('已撤销')}
    catch(e){this.clearUndo();ui.toast(e.message)}
  },
  clearUndo() {clearTimeout(this.undoTimer);this.undoToken=null;this.setData({canUndo:false,quickTip:''})},
  toggleTask(e) {try{store.toggleTask(e.currentTarget.dataset.id);this.clearUndo();this.refresh()}catch(err){ui.toast(err.message)}},
  expandTasks() {this.setData({expanded:!this.data.expanded});this.refresh()},
  addRecord() {wx.navigateTo({url:'/pages/record/record'})},
  viewSubject(e) {wx.navigateTo({url:'/pages/record/record?subjectId='+e.currentTarget.dataset.id})},
  manageSubjects() {wx.navigateTo({url:'/pages/subjects/subjects'})},
  addTask() {wx.navigateTo({url:'/pages/task/task'})},
  taskDetail(e) {wx.navigateTo({url:'/pages/task/task?id='+e.currentTarget.dataset.id})},
  allTasks(e) {
    if(e&&e.currentTarget.dataset.filter)wx.setStorageSync('study_plan_filter_v2',e.currentTarget.dataset.filter)
    wx.switchTab({url:'/pages/list/list'})
  },
  showStats() {wx.navigateTo({url:'/pages/data/data'})},
  scrollTasks() {wx.pageScrollTo({selector:'#today-plan',duration:250})},
  history() {wx.navigateTo({url:'/pages/history/history'})},
  onHide() {this.clearUndo()},
  onUnload() {clearTimeout(this.undoTimer)}
})
