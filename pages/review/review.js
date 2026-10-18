const store = require('../../utils/store')
const ui = require('../../utils/ui')

Page({
  data: {
    theme: 'light', today: '', weekStart: '', weekLabel: '', isCurrent: true,
    stats: {}, plannedCount: 0, plannedDone: 0, plannedRate: 0, subjectRows: [],
    worked: '', blocked: '', change: '', reviewed: false, history: [],
  },
  onLoad(query) { this.query = query || {} },
  onShow() { ui.applyTheme(this); this.load(this.data.weekStart) },
  load(week) {
    try {
      const d = store.getData(), today = store.dateKey()
      const info = store.weekSummary(d, week || store.weekStartKey(today))
      const review = info.review || {}
      const summary = info.summary
      this.setData({
        today, weekStart: info.weekStart, weekLabel: info.weekLabel,
        isCurrent: info.weekStart === store.weekStartKey(today),
        stats: { totalText: summary.totalText, activeDays: summary.activeDays, completedTasks: summary.completedTasks },
        plannedCount: info.plannedCount, plannedDone: info.plannedDone,
        plannedRate: info.plannedRate, subjectRows: info.summary.subjects,
        worked: review.worked || '', blocked: review.blocked || '', change: review.change || '',
        reviewed: !!info.review,
        history: store.reviewList(d).filter(r => r.weekStart !== info.weekStart).slice(0, 4),
      })
    } catch (e) { ui.toast(e.message) }
  },
  shift(e) {
    const step = Number(e.currentTarget.dataset.step)
    if (step > 0 && this.data.isCurrent) return
    const week = store.weekStartKey(store.addDays(this.data.weekStart, step * 7))
    this.load(week)
  },
  input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  save() {
    try {
      store.saveReview({
        weekStart: this.data.weekStart, worked: this.data.worked,
        blocked: this.data.blocked, change: this.data.change,
      })
      ui.toast('本周复盘已保存')
      this.load(this.data.weekStart)
    } catch (e) { ui.toast(e.message) }
  },
  openHistory(e) { this.load(e.currentTarget.dataset.week) },
})
