const store = require('../../utils/store')
const ui = require('../../utils/ui')

Page({
  data: {
    theme: 'light', today: '', goals: [], subjects: [], title: '', date: '', subjectIds: [], note: '', editingId: '',
  },
  onShow() { ui.applyTheme(this); this.refresh() },
  refresh() {
    try {
      const d = store.getData(), today = store.dateKey(), selected = this.data.subjectIds.slice()
      this.setData({
        today, goals: store.goalList(d, today),
        subjects: d.subjects.filter(s => s.id !== 'other').map(s => Object.assign({}, s, { selected: selected.indexOf(s.id) >= 0 })),
      })
    } catch (e) { ui.toast(e.message) }
  },
  input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  dateChange(e) { this.setData({ date: e.detail.value }) },
  toggleSubject(e) {
    const id = e.currentTarget.dataset.id, ids = this.data.subjectIds.slice(), i = ids.indexOf(id)
    if (i >= 0) ids.splice(i, 1); else ids.push(id)
    this.setData({ subjectIds: ids })
    this.refresh()
  },
  edit(e) {
    const goal = this.data.goals.find(g => g.id === e.currentTarget.dataset.id)
    if (!goal) return
    this.setData({
      editingId: goal.id, title: goal.title, date: goal.date, note: goal.note || '',
      subjectIds: (goal.subjectIds || []).slice(),
    })
    this.refresh()
  },
  cancel() { this.setData({ editingId: '', title: '', date: '', subjectIds: [], note: '' }); this.refresh() },
  save() {
    try {
      if (!this.data.editingId && this.data.date && this.data.date < this.data.today) throw new Error('目标日期不能早于今天')
      store.saveGoal({
        id: this.data.editingId, title: this.data.title, date: this.data.date,
        subjectIds: this.data.subjectIds, note: this.data.note,
      })
      ui.toast(this.data.editingId ? '目标已更新' : '目标已添加')
      this.cancel()
    } catch (e) { ui.toast(e.message) }
  },
  remove(e) {
    const id = e.currentTarget.dataset.id
    ui.confirm('删除这个目标？', '只移除倒计时和关联科目，学习记录不会受影响。', () => {
      store.deleteGoal(id)
      if (this.data.editingId === id) this.cancel()
      else this.refresh()
      ui.toast('目标已删除')
    })
  },
  manageSubjects() { wx.navigateTo({ url: '/pages/subjects/subjects' }) },
})
