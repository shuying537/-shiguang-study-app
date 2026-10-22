const ui=require('../../utils/ui')
const planImport=require('../../utils/plan-import-page')

Page(Object.assign({},planImport.methods,{
 data:Object.assign({theme:'light'},planImport.data),
 onShow(){ui.applyTheme(this)},
}))
