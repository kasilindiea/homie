# Homie · 智能家具 App

Android 优先的家具管理原型，使用 TypeScript、Vite 和 Capacitor。页面资源随安装包打包，现有功能无需联网。

## 当前功能

- 开发者账号登录：`aaaa / bbbb`、`cccc / dddd`。两个演示账号共用当前设备的家庭记录和设置。
- 底部四个入口按顺序为：添加、沙盒、导入、账号。
- 添加：15 类智能家具（含家庭储能、太阳能发电板），手动记录名称、类型、房间、品牌/型号和备注；支持查看、编辑、搜索、房间筛选、确认删除。
- 默认房间：客厅、厨房、玄关、浴室、阳台、房间1、房间2、房间3。已有家具分类和自定义房间继续保留。
- 账号：个人资料、版本信息；页面最下方的设置提供中英文切换、显示名称、默认添加房间和退出登录。
- 语言切换立即生效并保存在本机，覆盖登录、导航、表单和提示；保留家具名称、备注等用户填写的原文。
- 沙盒：默认进入“全屋检查”，底部只显示本机已添加设备；点击旁边的“沙盒演示”才打开场景演示设备及本地模拟离家任务。演示中的指令和读数不会控制真实设备。
- 户型：下拉菜单提供一房一厅、两房一厅、三房两厅，分别加载独立离线模型。两房有 8 个房间区域、三房有 10 个，两套各有 9 个设备或检查点；不启用旧大户型或四房选项。
- 离家演示：三个户型均提供玄关门、阳台门磁、客厅灯、主卧/卧室空调的本地检查流程。新户型另外五个设备只展示演示读数；不发送实际设备指令。每个户型独立保存本次页面内的计划、勾选和回读进度，来回切换不串用状态。
- 导入：API 地址及可选密钥填写页，校验 HTTP/HTTPS 地址后展示路演反馈；不发送请求，不导入或修改家具，不保存输入，离开页面清空。
- 家具、设置和登录状态保存在当前设备；退出登录保留数据，卸载或清除应用数据会删除记录。

0.0.6 基于 0.0.5 的 `ec9a395`，接入 `codex/generic-house-models` 分支 `4bf23c8` 的两套真实建模资产；原有登录、家具管理、全屋检查/沙盒演示分区及路演导入页继续保留。

本版本的登录是本地演示校验，并非服务端账户鉴权。构建变量和客户端代码不能保密，请勿填入真实账户密码。家具添加是手动登记。沙盒使用交付 GLB、移动端对象映射和本地模拟运行时，不会扫描或控制真实设备，不需要启动服务器。离开沙盒或切换界面语言会销毁本次页面的各户型模拟会话，重新进入从基线开始；家具与各户型手动关联保留。

## 本地运行

需要 Node.js 22.12+（本项目在 Node.js 24 上验证）。

Windows 用户安装 Node.js 后可以双击根目录的 `start-homie.cmd`。它会在缺少依赖时安装依赖，然后启动预览并打开浏览器。使用期间保留命令窗口，关闭窗口或按 Ctrl+C 会停止服务。

```powershell
npm ci
npm run dev
```

浏览器打开终端显示的本地地址。修改演示账号可复制新版 `.env.example` 为 `.env.local`，修改两组 `VITE_DEVELOPER_USERNAME` / `VITE_DEVELOPER_PASSWORD` 和带 `_2` 后缀的变量，再重新构建。显式配置会替换默认账号名单；若只配第一组，则只有该组账号生效。

预览地址通常为 `http://127.0.0.1:5173`，只在运行服务的这台电脑上可用；关闭开发服务后地址就无法打开。不要直接双击 `index.html`。上传源码到 GitHub 也不会自动发布网站。

```powershell
npm test
npm run test:e2e
npm run build
```

端到端测试使用本机 Microsoft Edge，覆盖手机尺寸下登录、增改删、持久化、导航、设置及中英文切换；截图写入 `artifacts/screenshots/`。

若 Windows 环境缺少 System32 命令路径，在运行浏览器测试前于当前 PowerShell 执行 `$env:PATH = (Join-Path $env:SystemRoot 'System32') + ';' + $env:PATH`，以便测试结束时关闭预览进程。

## Android

原生项目在 `android/`，应用包名 `com.homing.furniture`，显示名称“Homie”。更新显示名称时保留原包名、本地存储格式及签名，便于覆盖安装。Android SDK 和 JDK 的项目内安装、构建操作由 `scripts/` 中的 PowerShell 脚本提供。首次安装 SDK 需接受 Google 的 Android SDK 许可。

源码包不包含原签名密钥或 `.tools/`。同伴在新电脑上打出的调试包签名可能不同，不能据此保证覆盖安装原 APK，签名管理见 [合作开发说明](CONTRIBUTING.md)。

每次修改页面后，需要重新构建前端并同步资源：

```powershell
npm run android:sync
npm run android:build
```

首次在此 Windows 项目内安装工具链（先阅读并接受 Android SDK 许可）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-android.ps1 -AcceptSdkLicenses
```

工具下载、缓存及调试签名保存在 `.tools/`，不会修改系统环境变量。构建脚本按 `package.json` 中的版本号命名安装包，当前为 `artifacts/homie-0.0.6.apk`，并验证 APK 签名。

已有 JDK 21、Android SDK 与 Android Studio 的同伴，也可以在 `npm ci` 后先运行 `npm run android:sync`，再用 Android Studio 打开 `android/` 完成构建。同步步骤会生成源码包中未包含的网页资源和 Capacitor/Cordova 工程文件；请勿跳过后直接运行 Gradle。`npm run android:build` 是使用项目内 `.tools/` 的 Windows 便捷脚本。

首版交付为带调试签名的测试 APK，不是商店发布包。正式发布前需配置长期保管的发布签名、服务端鉴权，并完成目标设备测试。

## 代码交接

- `src/main.ts`：登录页、四个导航入口和家具管理交互。
- `src/domain.ts`：家具模型、字段校验、本地存储、账号与设置。
- `src/i18n.ts`：中英文界面文案、语言偏好与内置房间标签。
- `src/features/sandbox.ts`：沙盒目录、只读详情及任务面板的独立入口。
- `src/features/sandbox-scene.ts`：场景加载和失败重试展示。
- `src/features/sandbox-runtime/scene.js`：可取消、可暂停、可销毁的离线 3D 渲染器。
- `src/features/sandbox-runtime/session.js`：复用原型状态库和 LocalGateway 的每轮模拟会话。
- `src/features/sandbox-runtime/templates.ts`：三个户型的模型、映射、房间/设备目录、双语名称与可关联类型。
- `src/features/sandbox-runtime/bindings.ts`：按模板独立保存家具与模型对象的显式关联，保留原一房存储键。
- `models/`：两房、三房的交付资产及 `mobile-object-map.json`；映射由 `scripts/extract-model-maps.mjs` 从 GLB 提取并附加手机相机参数。
- `src/features/sandbox-demo.ts`：独立演示读数，不写入家具存储。
- `src/features/import.ts`、`import.css`：仅作路演的 API 表单及独立挂载/卸载。
- `src/styles.css`：移动端布局及视觉样式。
- `tests/`：数据层测试及手机尺寸的浏览器流程测试。

GLB、对象映射、状态运行时接入位置及生命周期见 [沙盒交接说明](docs/sandbox-handoff.md)。15 类目录及参考来源见 [智能家具目录](docs/smart-furniture-catalog.md)。三个户型都是固定模型，不会随新增家具自动生成模型，也不会因对象同名自动继承关联；一房储能仅有信息卡片，光伏暂没有空间对象。仓库保留上一版大户型原始资源备用，但本轮只打包菜单中的三套模型。当前没有 Home Assistant 接入、插件系统、设备协议或云端同步，导入表单也不代表已实现 API 连接。

上传 GitHub、分支协作和源码包范围见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 沙盒原型交接

小公寓离家检查原型的运行、联调和 Android 接入说明见 [sandbox-prototype/README.md](sandbox-prototype/README.md)。
