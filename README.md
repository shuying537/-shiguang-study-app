# 拾光 · 学习记录（安卓版）

微信小程序「学习记录」的安卓封装版：小程序源码 → Web 运行时 → Capacitor WebView → APK。
源码转换自 `学习记录小程序-v1.2`，未修改小程序源程序。

## 目录结构

```
build-web.mjs        # 构建脚本：小程序源码 → www/（index.html + bundle.js + style.css）
tools/runtime.js     # 运行时纯函数：WXML 解析 / 表达式求值 / rpx→vw
tools/runtime-web.js # 浏览器运行时：wx API shim、虚拟 DOM 渲染、hash 路由
www/                 # 构建产物（.gitignore，CI 中由 npm run build 生成）
android/             # Capacitor 安卓工程（需提交）
.github/workflows/   # GitHub Actions：自动编译 APK
```

## 手动构建 APK（GitHub Actions 免费编译）

1. 把本项目推送到 GitHub（私有仓库也可以）：

   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

2. 打开 GitHub 仓库 → **Actions** 页签 → 看到 `Build Android APK` 工作流在跑（或在 Actions 里手动点 **Run workflow**）。

3. 跑完后点进工作流，在 **Artifacts** 里下载 `shiguang-debug-apk`，解压得到 `app-debug.apk`，安装到手机即可。

## 本地构建

```bash
npm install
npm run build        # 生成 www/
npx cap sync android # 同步到 android/
npm test             # 单元测试
```

## 说明

- 所有数据保存在 App 本地（WebView localStorage），无需网络。
- 安装 debug APK 需要允许「安装未知来源应用」。
- 正式发布（上应用商店等）需另行签名 `assembleRelease`，本仓库默认产 debug 包。
