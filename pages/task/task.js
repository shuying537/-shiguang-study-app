const store = require('../../utils/store')
const ui = require('../../utils/ui')
Page({
  data: {theme:'light',editing:false,subjects:[],subjectIndex:0,title:'',plannedDate:'',deadlineDate:'',deadlineTime:'23:59',estimatedMinutes:'',note:'',reminder:false,status:'',totalText:'0分钟',records:[],completed:false,abandoned:false,loadError:false},
  onLoad(query) {this.query=query||{}},
  onShow() {this.load()},
  load() {
    try {
      ui.applyTheme(this)
      const d=store.getData(),today=store.dateKey(),edit=this.query.id?d.tasks.find(t=>t.id===this.query.id):null
      if(this.query.id&&!edit)throw new Error('这项任务已不存在')
      if(this.loaded){
        const previous=this.data.subjects[this.data.subjectIndex]
        const index=d.subjects.findIndex(s=>s.id===(previous&&previous.id))
        this.setData({subjects:d.subjects,subjectIndex:Math.max(0,index),
          status:edit?store.statusText(store.taskStatus(edit)):'新任务',completed:edit?!!edit.completed:false,abandoned:edit?!!edit.abandoned:false,
          totalText:edit?store.durationText(d.records.filter(r=>r.taskId===edit.id).reduce((sum,r)=>sum+r.duration,0)):'0分钟',
          records:edit?d.records.filter(r=>r.taskId===edit.id).map(r=>ui.recordView(d,r)):[]})
        return
      }
      const deadline=edit?edit.deadline:today+' 23:59'
      this.setData({
        editing:!!edit,id:edit?edit.id:'',subjects:d.subjects,
        subjectIndex:Math.max(0,d.subjects.findIndex(s=>s.id===(edit?edit.subjectId:d.settings.lastSubjectId))),
        title:edit?edit.title:'',plannedDate:edit?edit.plannedDate:today,
        deadlineDate:deadline.slice(0,10),deadlineTime:deadline.slice(11)||'23:59',
        estimatedMinutes:edit&&edit.estimatedMinutes?String(edit.estimatedMinutes):'',note:edit?edit.note||'':'',
        reminder:edit?!!edit.reminder:false,status:edit?store.statusText(store.taskStatus(edit)):'新任务',
        completed:edit?!!edit.completed:false,abandoned:edit?!!edit.abandoned:false,
        totalText:edit?store.durationText(d.records.filter(r=>r.taskId===edit.id).reduce((sum,r)=>sum+r.duration,0)):'0分钟',
        records:edit?d.records.filter(r=>r.taskId===edit.id).map(r=>ui.recordView(d,r)):[]
      })
      this.loaded=true
    }catch(e){this.setData({loadError:true});ui.toast(e.message)}
  },
  input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value})},
  subjectChange(e){this.setData({subjectIndex:Number(e.detail.value)})},
  plannedChange(e){const date=e.detail.value;this.setData({plannedDate:date,deadlineDate:date>this.data.deadlineDate?date:this.data.deadlineDate})},
  datePartChange(e){this.setData({deadlineDate:e.detail.value})},
  timePartChange(e){this.setData({deadlineTime:e.detail.value})},
  reminderChange(e){this.setData({reminder:e.detail.value})},
  save(){
    if(this.data.loadError)return
    try{
      const d=store.getData(),original=d.tasks.find(t=>t.id===this.data.id),selected=this.data.subjects[this.data.subjectIndex]
      if(original&&selected&&original.subjectId!==selected.id&&d.records.some(r=>r.taskId===original.id)){
        ui.confirm('更换任务科目？','已有学习记录会保留原科目与时长，并解除与该任务的关联。',()=>this.persist())
        return
      }
      this.persist()
    }catch(e){ui.toast(e.message)}
  },
  persist(){
    try{
      const selected=this.data.subjects[this.data.subjectIndex]
      store.saveTask({
        id:this.data.id,title:this.data.title,subjectId:selected?selected.id:'',
        plannedDate:this.data.plannedDate,deadline:this.data.deadlineDate+' '+this.data.deadlineTime,
        estimatedMinutes:this.data.estimatedMinutes,note:this.data.note,reminder:this.data.reminder
      })
      ui.toast(this.data.editing?'任务已更新':'任务已创建');setTimeout(()=>wx.navigateBack(),350)
    }catch(e){ui.toast(e.message)}
  },
  toggle(){try{store.toggleTask(this.data.id);this.loaded=false;this.load();ui.toast('状态已更新')}catch(e){ui.toast(e.message)}},
  restore(){try{store.restoreTask(this.data.id);this.loaded=false;this.load();ui.toast('已恢复为未完成任务')}catch(e){ui.toast(e.message)}},
  remove(){ui.confirm('删除任务？','关联学习记录会保留，任务不会计入完成统计。',()=>{store.deleteTask(this.data.id);ui.toast('任务已删除');setTimeout(()=>wx.navigateBack(),350)})},
  addRecord(){const s=this.data.subjects[this.data.subjectIndex];wx.navigateTo({url:'/pages/record/record?subjectId='+s.id+'&taskId='+this.data.id})},
  editRecord(e){wx.navigateTo({url:'/pages/record/record?id='+e.currentTarget.dataset.id})},
  createSubject(){wx.navigateTo({url:'/pages/subjects/subjects'})}
})

