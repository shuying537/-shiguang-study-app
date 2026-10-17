const store=require('../../utils/store'),ui=require('../../utils/ui')
Page({
 data:{theme:'light',settings:{},recordCount:0,taskCount:0,subjectCount:0,version:'v2.0 · 执行闭环版',summary:{},showPreferences:false,showDataTools:false},
 onShow(){this.refresh()},
 refresh(){
  try{
   ui.applyTheme(this);const d=store.getData(),days=store.weekDays()
   this.setData({settings:d.settings,recordCount:d.records.length,taskCount:d.tasks.length,subjectCount:d.subjects.length,summary:store.stats(d,days),rangeLabel:days[0].slice(5).replace('-','/')+' — '+days[6].slice(5).replace('-','/')})
  }catch(e){ui.toast(e.message)}
 },
 stats(){wx.navigateTo({url:'/pages/data/data'})},
 history(){wx.navigateTo({url:'/pages/history/history'})},
 subjects(){wx.navigateTo({url:'/pages/subjects/subjects'})},
 imports(){wx.navigateTo({url:'/pages/import/import'})},
 togglePreferences(){this.setData({showPreferences:!this.data.showPreferences})},
 toggleDataTools(){this.setData({showDataTools:!this.data.showDataTools})},
 themeChange(e){const d=store.getData();d.settings.theme=e.detail.value?'dark':'light';store.saveData(d);this.refresh()},
 themeSystem(){const d=store.getData();d.settings.theme=d.settings.theme==='system'?'light':'system';store.saveData(d);this.refresh()},
 reminderChange(e){const d=store.getData();d.settings.dailyReminderEnabled=e.detail.value;store.saveData(d);this.refresh()},
 timeChange(e){const d=store.getData();d.settings.dailyReminderTime=e.detail.value;store.saveData(d);this.refresh()},
 exportCsv(){try{const csv=store.csv(store.getData());wx.setClipboardData({data:csv,success:()=>ui.toast('CSV 已复制，可粘贴保存')})}catch(e){ui.toast(e.message)}},
 loadDemo(){try{store.loadDemo();this.refresh();ui.toast('已载入示例数据')}catch(e){ui.toast(e.message)}},
 clear(){ui.confirm('清空全部数据？','将删除科目、任务、历史记录和草稿，只保留“其他”科目。请先导出需要保留的学习记录。',()=>{store.clearAll();this.refresh();ui.toast('已清空')})}
})

