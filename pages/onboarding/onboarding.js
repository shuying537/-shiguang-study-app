const store = require('../../utils/store')
const ui = require('../../utils/ui')

const PRESETS = ['数学', '英语', '政治', '专业课']

Page({
  data: {
    theme: 'light', step: 0, today: '', goalTitle: '', goalDate: '', newSubject: '',
    chips: [], subjectIds: [], imported: false, finished: false,
  },
  onShow() { ui.applyTheme(this); this.setData({ today: store.dateKey() }); this.refreshChips() },
  refreshChips() {
    try {
      const d = store.getData(), selected = this.data.subjectIds.slice()
      const chips = d.subjects.filter(s => s.id !== 'other').map(s => ({
        id: s.id, name: s.name, selected: selected.indexOf(s.id) >= 0,
      }))
      PRESETS.forEach(name => {
        if (!chips.some(c => c.name === name)) chips.push({ id: '', name, selected: false })
      })
      this.setData({ chips })
    } catch (e) { ui.toast(e.message) }
  },
  input(e) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }) },
  dateChange(e) { this.setData({ goalDate: e.detail.value }) },
  toggleSubject(e) {
    const name = e.currentTarget.dataset.name, id = e.currentTarget.dataset.id
    try {
      if (!id) {
        const subject = store.addSubject(name)
        this.setData({ subjectIds: this.data.subjectIds.concat(subject.id) })
        this.refreshChips()
        return
      }
      const ids = this.data.subjectIds.slice(), i = ids.indexOf(id)
      if (i >= 0) ids.splice(i, 1); else ids.push(id)
      this.setData({ subjectIds: ids })
      this.refreshChips()
    } catch (err) { ui.toast(err.message) }
  },
  addSubject() {
    const name = String(this.data.newSubject || '').trim()
    if (!name) return
    try {
      const subject = store.addSubject(name)
      this.setData({ newSubject: '', subjectIds: this.data.subjectIds.concat(subject.id) })
      this.refreshChips()
    } catch (e) { ui.toast(e.message) }
  },
  next() { this.setData({ step: Math.min(2, this.data.step + 1) }) },
  back() { this.setData({ step: Math.max(0, this.data.step - 1) }) },
  skip() {
    if (this.leaving) return
    this.leaving = true
    store.dismissOnboarding()
    ui.toast('已跳过，之后可在「我的」里重新设置')
    setTimeout(() => wx.navigateBack(), 300)
  },
  done() { this.finish('done') },
  importPlan() { this.finish('import') },
  finish(mode) {
    if (this.data.finished) {
      if (mode === 'import') { wx.navigateTo({ url: '/pages/import/import' }); return }
      if (this.leaving) return
      this.leaving = true
      wx.navigateBack()
      return
    }
    try {
      const title = String(this.data.goalTitle || '').trim()
      if (title || this.data.goalDate) {
        if (!title) throw new Error('给目标起个名字，或清空日期跳过目标')
        if (!this.data.goalDate) throw new Error('选择目标日期，或清空名称跳过目标')
        if (this.data.goalDate < store.dateKey()) throw new Error('目标日期不能早于今天')
        store.saveGoal({ title, date: this.data.goalDate, subjectIds: this.data.subjectIds })
      }
      store.completeOnboarding()
      this.setData({ finished: true })
      if (mode === 'import') {
        this.setData({ imported: true })
        wx.navigateTo({ url: '/pages/import/import' })
        return
      }
      this.leaving = true
      ui.toast('设置完成')
      setTimeout(() => wx.navigateBack(), 300)
    } catch (e) { ui.toast(e.message) }
  },
})
