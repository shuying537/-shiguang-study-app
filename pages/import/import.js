const store = require('../../utils/store')
const ui = require('../../utils/ui')
const importPlan = require('../../utils/importPlan')

Page({
  data: {
    theme: 'light', text: '', lineCount: 0, showPreview: false, createSubjects: true,
    subjectOptions: [],
    rows: [], summary: { total: 0, importable: 0, skipped: 0, warnings: 0, defaulted: 0, newSubjects: [], newSubjectsText: '' },
  },
  onShow() { ui.applyTheme(this) },
  input(e) {
    const text = e.detail.value
    this.setData({ text, lineCount: text.split(/\r?\n/).filter(s => s.trim()).length, showPreview: false })
  },
  toggleCreate(e) {
    this.setData({ createSubjects: e.detail.value })
    if (this.data.showPreview) this.parse()
  },
  parse() {
    const text = String(this.data.text || '').trim()
    if (!text) { ui.toast('请先粘贴计划文本'); return }
    try {
      const d = store.getData()
      const result = importPlan.parsePlan(text, {
        today: store.dateKey(), subjects: d.subjects, tasks: d.tasks, createSubjects: this.data.createSubjects,
      })
      this.editIndex = -1
      this.editDraft = null
      this.setData({
        rows: result.rows, summary: result.summary, showPreview: true,
        subjectOptions: this.buildSubjectOptions(result.rows),
      })
      if (!result.summary.total) ui.toast('没有识别到任务，检查一下每行是否都有任务名')
    } catch (e) { ui.toast(e.message) }
  },
  // 预览行可以手动改标题/科目/截止时间，避免解析猜错后只能先导入再修
  buildSubjectOptions(rows) {
    const list = [], seen = {}
    const add = s => { if (s && s.name && !seen[s.name]) { seen[s.name] = true; list.push(s) } }
    const d = store.getData()
    add({ id: 'other', name: '其他' })
    d.subjects.filter(s => s.id !== 'other').forEach(s => add({ id: s.id, name: s.name }))
    ;(rows || this.data.rows).forEach(r => { if (!r.subjectId && r.subjectName) add({ id: '', name: r.subjectName }) })
    return list
  },
  startEdit(e) {
    const index = Number(e.currentTarget.dataset.index)
    const row = this.data.rows[index]
    if (!row) return
    const options = this.buildSubjectOptions()
    const idx = Math.max(0, options.findIndex(o => o.id ? o.id === row.subjectId : o.name === row.subjectName))
    const deadline = String(row.deadline || '')
    const date = deadline.slice(0, 10) || store.dateKey()
    const time = deadline.slice(11) || '23:59'
    this.editIndex = index
    this.editDraft = { title: row.title || '', date, time, subjectIndex: idx }
    const rows = this.data.rows.map((r, i) => i === index ? Object.assign({}, r, {
      editing: true, editTitle: row.title || '', editDate: date, editTime: time,
      editSubjectIndex: idx, editSubjectName: (options[idx] && options[idx].name) || '其他',
    }) : Object.assign({}, r, { editing: false }))
    this.setData({ rows, subjectOptions: options })
  },
  editTitle(e) { if (this.editDraft) this.editDraft.title = e.detail.value },
  editDate(e) {
    if (!this.editDraft) return
    this.editDraft.date = e.detail.value
    this.patchEditingRow({ editDate: e.detail.value })
  },
  editTime(e) {
    if (!this.editDraft) return
    this.editDraft.time = e.detail.value
    this.patchEditingRow({ editTime: e.detail.value })
  },
  editSubject(e) {
    if (!this.editDraft) return
    const idx = Number(e.detail.value)
    const option = this.data.subjectOptions[idx] || { id: 'other', name: '其他' }
    this.editDraft.subjectIndex = idx
    this.patchEditingRow({ editSubjectIndex: idx, editSubjectName: option.name })
  },
  patchEditingRow(patch) {
    const rows = this.data.rows.map((r, i) => i === this.editIndex
      ? Object.assign({}, r, { editTitle: this.editDraft ? this.editDraft.title : r.editTitle }, patch)
      : r)
    this.setData({ rows })
  },
  cancelEdit() {
    const rows = this.data.rows.map((r, i) => i === this.editIndex ? Object.assign({}, r, { editing: false }) : r)
    this.editIndex = -1
    this.editDraft = null
    this.setData({ rows })
  },
  saveEdit() {
    const draft = this.editDraft
    if (!draft) return
    const title = String(draft.title || '').replace(/\s+/g, ' ').trim()
    if (!title) { ui.toast('任务名称不能为空'); return }
    if (title.length > 60) { ui.toast('任务名称不能超过 60 个字'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
      ui.toast('请选择有效的截止日期和时间'); return
    }
    const option = this.data.subjectOptions[draft.subjectIndex] || { id: 'other', name: '其他' }
    const deadline = draft.date + ' ' + draft.time
    const rows = this.data.rows.map((r, i) => {
      if (i !== this.editIndex) return r
      return Object.assign({}, r, {
        editing: false, title, subjectId: option.id || '', subjectName: option.name, newSubject: !option.id,
        deadline, plannedDate: draft.date, metaText: option.name + ' · ' + deadline.slice(5),
        status: 'warn', tone: 'warning', badge: '已修改',
        reason: !option.id && !this.data.createSubjects ? '科目「' + option.name + '」不存在，将归入「其他」' : '手动修改过，导入前请再确认',
        importable: true,
      })
    })
    this.editIndex = -1
    this.editDraft = null
    this.applyRows(rows)
  },
  applyRows(rows) {
    const importable = rows.filter(r => r.importable), newSubjects = []
    if (this.data.createSubjects) importable.forEach(r => {
      if (r.newSubject && r.subjectName && newSubjects.indexOf(r.subjectName) < 0) newSubjects.push(r.subjectName)
    })
    this.setData({
      rows,
      summary: {
        total: rows.length, importable: importable.length, skipped: rows.length - importable.length,
        warnings: rows.filter(r => r.status === 'warn').length,
        defaulted: importable.filter(r => /（默认）$/.test(r.metaText)).length,
        newSubjects, newSubjectsText: newSubjects.join('、'),
      },
    })
  },
  confirmImport() {
    const rows = (this.data.rows || []).filter(r => r.importable)
    if (!rows.length) { ui.toast('没有可导入的任务'); return }
    try {
      const result = store.importTasks(rows.map(r => ({
        title: r.title, subjectId: r.subjectId, subjectName: r.subjectName, deadline: r.deadline, plannedDate: r.plannedDate,
      })), { createSubjects: this.data.createSubjects })
      if (!result.added.length) {
        ui.toast('没有新增任务，可能都已存在')
        return
      }
      const subjectText = result.created.length ? '，新建科目 ' + result.created.length + ' 个' : ''
      const skipText = result.skipped.length ? '，跳过 ' + result.skipped.length + ' 条' : ''
      ui.toast('已导入 ' + result.added.length + ' 条' + subjectText + skipText)
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) { ui.toast(e.message) }
  },
})
