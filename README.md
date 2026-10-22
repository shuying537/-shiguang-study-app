# 拾光 · 学习记录（安卓版）

[![Build APK](https://github.com/shuying537/-shiguang-study-app/actions/workflows/build.yml/badge.svg)](https://github.com/shuying537/-shiguang-study-app/actions/workflows/build.yml)

微信小程序「学习记录」的安卓 App。**未修改任何小程序源码**，通过自研 Web 运行时把小程序跑在 WebView 里，再用 Capacitor 打包成 APK：

```
小程序源码（pages/ + utils/）  →  build-web.mjs  →  www/（纯前端页面）
                                                        ↓
                                              Capacitor Android WebView
                                                        ↓
                                                     APK
```

## 功能

沿袭小程序版本的功能，离线可用，数据全部存在手机本地：

- **首页** —— 快速记一笔学习记录，支持撤销与修改
- **计划** —— 学习计划排期，自动区分逾期 / 待完成 / 已完成
- **任务** —— 带预估时间的任务，可关联学习记录、跨科目迁移
- **科目** —— 自定义科目，支持重命名、归档与删除保护
- **历史** —— 按学习日期筛选，归档科目不丢失记录
- **统计** —— 学习时长、平均、完成数，与「我的」页数据同源
- **三分钟上手** —— 首次打开设置目标日期和科目，返回首页看到倒计时
- **目标** —— 考试 / 截止日期倒计时，关联科目并统计本周投入
- **复盘** —— 每周自动汇总时长、完成率和科目分布，填写三条复盘
- **AI 计划** —— 本机生成提示词，复制到任意大模型；将结果粘贴回同一页，检查日期、科目、预计用时与每日负荷，逐条修改或排除后确认导入，无需 API Key 或服务器
- **导入 / 备份** —— 粘贴计划文本自动识别科目与日期，支持预览修改与撤销；JSON 文本或文件备份/恢复、自动保留上一版；CSV 导出
- **提醒** —— 应用打开时，在任务截止前 30 分钟提醒一次
- **主题** —— 浅色 / 深色切换

## 获取 APK（GitHub Actions 免费编译）

1. 打开本仓库 **Actions** 页签 → 选择 **Build Android APK** → 点 **Run workflow**（推送到 `main` 时也会自动触发）。
2. 等待约 5–10 分钟，点进本次运行，在页面底部 **Artifacts** 下载 `shiguang-debug-apk`。
3. 解压得到 `app-debug.apk`，传到手机，允许「安装未知来源应用」后安装即可。

## 本地构建

需要 Node.js 20+ 和 Java 17：

```bash
npm install
npm run build          # 小程序源码 → www/
npx cap sync android   # 同步到 android/ 工程
cd android && ./gradlew assembleDebug
# 产物：android/app/build/outputs/apk/debug/app-debug.apk
```

## 开发与测试

```bash
npm run build    # 重新构建 www/
npm test         # 单元测试（含 jsdom 真实渲染）
```

AI 计划每行格式：`复习基础 [数学] 2026-10-25 20:00 预计30分钟`。预计用时以 5 分钟为单位；检查会计入已有未完成任务的预计时长，未填写时长的任务会单独提示。导入前仍需自行确认学习内容是否适合，预计用时不会记作实际学习时长。

安卓系统返回键会先关闭弹窗，再逐级返回上一页；在「计划」或「我的」主页面返回首页，到首页后交给系统处理。安装包含原生返回键修改的新 APK 后生效。

## 目录结构

```
app.js / app.json / app.wxss   # 小程序源码，同时作为 Web 构建入口
pages/ utils/                  # 页面与工具模块，小程序与 Web 构建共用
build-web.mjs                  # 构建脚本：小程序 → Web 页面
tools/runtime.js               # 运行时：WXML 解析 / 表达式求值 / rpx→vw
tools/runtime-web.js           # 浏览器运行时：wx API shim / 虚拟 DOM / hash 路由
android/                       # Capacitor Android 原生工程
.github/workflows/build.yml    # CI：自动编译并上传 APK
www/                           # 构建产物（gitignore，CI 中现构建）
```

## 说明

- 数据保存在 App 本地（WebView localStorage），卸载 App 会清空；建议定期在「我的 → 备份与恢复」复制备份文本，或导出 CSV。
- 默认编译 **debug** 包，签名是调试证书；上架应用商店需自行配置 release 签名（`assembleRelease`）。
- 小程序源项目保留完整，同一套 `pages/` 同时供小程序与 Web 构建使用；改完重新 `npm run build` 即可生效。
