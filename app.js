const store = require('./utils/store')

let reminderTimer = null

// 应用内提醒：只在前台运行或重新打开时提示，不发系统后台通知
function notifyDue() {
  try {
    const due = store.takeDueReminders()
    due.slice(0, 3).forEach((task, i) => {
      setTimeout(() => {
        wx.showToast({
          title: task.overdue ? '「' + task.title + '」已到截止时间' : '「' + task.title + '」还有不到 30 分钟截止',
          icon: 'none', duration: 4200,
        })
      }, i * 900)
    })
  } catch (e) { /* 提醒失败不影响记录 */ }
}

function startReminders() {
  notifyDue()
  if (!reminderTimer) reminderTimer = setInterval(notifyDue, 30000)
}

function stopReminders() {
  if (reminderTimer) { clearInterval(reminderTimer); reminderTimer = null }
}

App({
  onLaunch() {
    try { store.ensureData() } catch (e) { console.error('本地数据读取失败', e) }
    startReminders()
  },
  onShow() { startReminders() },
  onHide() { stopReminders() },
})
