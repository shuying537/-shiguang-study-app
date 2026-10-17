const store=require('../../utils/store'),ui=require('../../utils/ui')
Page({
 data:{theme:'light',subjects:[],newName:'',editingId:'',editName:''},
 onShow(){this.refresh()},
 refresh(){try{ui.applyTheme(this);this.setData({subjects:store.getData().subjects})}catch(e){ui.toast(e.message)}},
 input(e){this.setData({newName:e.detail.value})},
 add(){try{store.addSubject(this.data.newName);this.setData({newName:''});this.refresh();ui.toast('科目已添加，首页可直接记录')}catch(e){ui.toast(e.message)}},
 edit(e){const s=this.data.subjects.find(item=>item.id===e.currentTarget.dataset.id);if(s)this.setData({editingId:s.id,editName:s.name})},
 editInput(e){this.setData({editName:e.detail.value})},
 cancel(){this.setData({editingId:'',editName:''})},
 saveName(){try{store.updateSubject(this.data.editingId,this.data.editName);this.cancel();this.refresh();ui.toast('科目已更新')}catch(e){ui.toast(e.message)}},
 remove(e){ui.confirm('删除这个科目？','该科目下的任务会删除。学习记录与原科目名称会保留，仍可在历史中查看。',()=>{store.deleteSubject(e.currentTarget.dataset.id);this.cancel();this.refresh();ui.toast('科目已删除，历史记录已保留')})}
})

