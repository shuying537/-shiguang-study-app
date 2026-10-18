const store=require('../../utils/store'),ui=require('../../utils/ui')
Page({
 data:{theme:'light',settings:{},recordCount:0,taskCount:0,subjectCount:0,version:'v2.2 · 目标与复盘',summary:{},backup:{exists:false},lastImport:{exists:false},showPreferences:false,showDataTools:false},
 onShow(){this.refresh()},
 refresh(){
  try{
   ui.applyTheme(this);const d=store.getData(),days=store.weekDays()
   this.setData({settings:d.settings,recordCount:d.records.length,taskCount:d.tasks.length,subjectCount:d.subjects.length,summary:store.stats(d,days),backup:store.backupInfo(),lastImport:store.lastImportInfo(),rangeLabel:days[0].slice(5).replace('-','/')+' — '+days[6].slice(5).replace('-','/')})
  }catch(e){ui.toast(e.message)}
 },
 stats(){wx.navigateTo({url:'/pages/data/data'})},
 history(){wx.navigateTo({url:'/pages/history/history'})},
 subjects(){wx.navigateTo({url:'/pages/subjects/subjects'})},
 goals(){wx.navigateTo({url:'/pages/goals/goals'})},
 review(){wx.navigateTo({url:'/pages/review/review'})},
 onboarding(){wx.navigateTo({url:'/pages/onboarding/onboarding'})},
 imports(){wx.navigateTo({url:'/pages/import/import'})},
 togglePreferences(){this.setData({showPreferences:!this.data.showPreferences})},
 toggleDataTools(){this.setData({showDataTools:!this.data.showDataTools})},
 themeChange(e){const d=store.getData();d.settings.theme=e.detail.value?'dark':'light';store.saveData(d);this.refresh()},
 themeSystem(){const d=store.getData();d.settings.theme=d.settings.theme==='system'?'light':'system';store.saveData(d);this.refresh()},
 reminderChange(e){const d=store.getData();d.settings.dailyReminderEnabled=e.detail.value;store.saveData(d);this.refresh()},
 timeChange(e){const d=store.getData();d.settings.dailyReminderTime=e.detail.value;store.saveData(d);this.refresh()},
 exportCsv(){try{const csv=store.csv(store.getData());wx.setClipboardData({data:csv,success:()=>ui.toast('CSV 已复制，可粘贴保存')})}catch(e){ui.toast(e.message)}},
 backup(){wx.navigateTo({url:'/pages/backup/backup'})},
 restoreBackup(){if(!this.data.backup.exists)return;ui.confirm('恢复上一版数据？','会用自动备份覆盖当前数据，当前改动将丢失。',()=>{store.restoreBackup();this.refresh();ui.toast('已恢复上一版数据')})},
 undoImport(){if(!this.data.lastImport.exists)return;ui.confirm('撤销上次导入？','会删除上次批量导入的任务，已关联的学习记录会保留。',()=>{const r=store.undoImport();this.refresh();ui.toast('已撤销 '+r.removed+' 条任务')})},
 loadDemo(){try{store.loadDemo();this.refresh();ui.toast('已载入示例数据')}catch(e){ui.toast(e.message)}},
 clear(){ui.confirm('清空全部数据？','将删除科目、任务、历史记录和草稿，只保留“其他”科目。当前数据会保留一份自动备份，可在数据管理中恢复。',()=>{store.clearAll();this.refresh();ui.toast('已清空')})}
})

