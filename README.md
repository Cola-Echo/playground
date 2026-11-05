# Playground（Windows 免 Docker 版）

AI Studio Playground 桥接，本地 OpenAI 兼容接口：`http://127.0.0.1:8020/v1`，默认 key `pg123456`。

仓库里**不含** Node 运行时、Camoufox 浏览器和 `node_modules`（太大，xul.dll 超过 GitHub 100MB 限制），也不含任何 Google 账号凭据。

## 补齐运行环境

克隆后在仓库根目录：

1. **Node**：下载 Node v20.18.1 Windows x64 zip，把 `node.exe` 放到 `node\node.exe`（或者直接用系统装的 Node，脚本会自动回退）。
2. **依赖**：
   ```
   cd app
   npm ci --omit=dev
   ```
3. **Camoufox**：下载 Camoufox `135.0.1-beta.24` 的 Windows x86_64 包，解压到 `camoufox\`，保证存在 `camoufox\camoufox.exe`。

目录结构应为：

```
Add-Account.bat / Playground.bat / Playground-Stop.bat
app\        源码 + 已构建的前端 (app\ui\dist)
node\node.exe
camoufox\camoufox.exe
```

## 使用

1. 需要代理就改 `app\.env` 里的 `HTTP_PROXY` / `HTTPS_PROXY`
2. 双击 `Add-Account.bat`，在弹出的浏览器里登录 Google
3. 双击 `Playground.bat` 启动，浏览器打开 http://127.0.0.1:8020
4. 用完双击 `Playground-Stop.bat`

更多见 [使用说明.txt](使用说明.txt)。
