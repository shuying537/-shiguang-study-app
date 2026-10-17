const store = require('./utils/store')
App({
  onLaunch() { try { store.ensureData() } catch (e) { console.error('本地数据读取失败', e) } }
})
