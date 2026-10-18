const store = require('../../utils/store')
const ui = require('../../utils/ui')

Page({
  data: { theme: 'light', exportText: '', importText: '', info: { tasks: 0, records: 0, subjects: 0, backup: { exists: false } } },
  onShow() { ui.applyTheme(this); this.refresh() },
  refresh() {
    try {
      const d = store.getData()
      this.setData({
        exportText: store.exportJson(),
        info: { tasks: d.tasks.length, records: d.records.length, subjects: d.subjects.length, updatedAt: d.updatedAt || '', backup: store.backupInfo() },
      })
    } catch (e) { ui.toast(e.message) }
  },
  copy() {
    try {
      wx.setClipboardData({
        data: this.data.exportText,
        success: () => ui.toast('备份文本已复制，可粘贴保存'),
        fail: () => ui.toast('复制失败，请稍后重试'),
      })
    } catch (e) { ui.toast(e.message) }
  },
  exportFile() {
    const text = this.data.exportText, name = 'shiguang-backup-' + store.dateKey() + '.json'
    try {
      if (typeof navigator !== 'undefined' && typeof File !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        const file = new File([text], name, { type: 'application/json' })
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: '拾光备份' })
            .then(() => ui.toast('已打开系统分享'))
            .catch(err => { if (!err || err.name !== 'AbortError') this.downloadFile(text, name) })
          return
        }
      }
    } catch (e) { }
    this.downloadFile(text, name)
  },
  downloadFile(text, name) {
    try {
      if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) throw new Error('unsupported')
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url; a.download = name; a.style.display = 'none'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      ui.toast('已生成备份文件；若无保存提示，请用复制备份文本')
    } catch (e) { ui.toast('当前环境不支持导出文件，请用「复制备份文本」') }
  },
  fileChange(e) {
    const file = (e.detail.files || [])[0]
    if (!file) { ui.toast('没有读到文件'); return }
    if (file.size > 5 * 1024 * 1024) { ui.toast('备份文件不能超过 5MB'); return }
    if (typeof FileReader === 'undefined') { ui.toast('当前环境不支持读取文件，请粘贴备份文本'); return }
    const reader = new FileReader()
    reader.onload = () => {
      this.setData({ importText: String(reader.result || '') })
      ui.toast('已读取备份文件，点「恢复这份备份」')
    }
    reader.onerror = () => ui.toast('文件读取失败')
    reader.readAsText(file)
  },
  input(e) { this.setData({ importText: e.detail.value }) },
  restore() {
    const text = String(this.data.importText || '').trim()
    if (!text) { ui.toast('请先粘贴备份文本'); return }
    ui.confirm('用这份备份覆盖当前数据？', '当前数据会先保存为自动备份，恢复后仍可在「我的」里找回。', () => {
      try {
        store.importJson(text)
        this.setData({ importText: '' })
        this.refresh()
        ui.toast('已恢复备份数据')
      } catch (e) { ui.toast(e.message) }
    })
  },
  restoreAuto() {
    if (!this.data.info.backup || !this.data.info.backup.exists) { ui.toast('还没有自动备份'); return }
    ui.confirm('恢复上一版数据？', '会用自动备份覆盖当前数据，当前改动将丢失。', () => {
      try {
        store.restoreBackup()
        this.refresh()
        ui.toast('已恢复上一版数据')
      } catch (e) { ui.toast(e.message) }
    })
  },
})
