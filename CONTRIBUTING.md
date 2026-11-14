# homie 合作开发说明

## 从源码开始

源码包内包含 App 页面、数据层、测试、Android 原生工程和构建脚本。解压后，将包含 `package.json` 的目录作为仓库根目录上传 GitHub；上传解压后的文件，不要只上传 ZIP。记得包含 `.gitignore` 和 `.env.example`。

源码包不包含 `node_modules`、`.tools`、构建产物、机器专用路径、真实环境配置或签名密钥。首次安装依赖需要联网。

Windows 用户安装 Node.js 后也可以双击根目录的 `start-homie.cmd`，自动安装缺少的依赖并启动预览。

```sh
npm ci
npm run dev
```

在运行命令的电脑上打开终端显示的地址，通常为 `http://127.0.0.1:5173`。保持终端运行；直接双击 `index.html` 无法代替开发服务器。登录测试账号为 `aaaa`，密码为 `bbbb`。

完整启动与 Android 打包说明见 [README.md](README.md)。

## 合作方式

- 每个功能使用独立分支，例如 `feature/sandbox`、`feature/import`、`fix/login`。
- 通过 Pull Request 合并，说明改动、验证结果及需要其他人配合的接口变化。
- 尽量分工到独立模块；修改 `src/main.ts`、`src/domain.ts` 或依赖版本前与同伴沟通。
- 提交前运行 `npm test` 和 `npm run build`；界面或交互改动再运行 `npm run test:e2e`。
- 提交依赖修改时同时提交 `package.json` 与 `package-lock.json`。

## 当前接口边界

- `src/main.ts`：登录、导航及家具页面，持有唯一的数据 store。
- `src/domain.ts`：家具增改删、字段校验、本地存储与账号设置。修改存储结构前设计迁移，不能直接清空旧数据。
- `src/i18n.ts`：中文/英文界面文案和语言偏好。家具名称、备注等用户填写的内容保持原文。
- `src/features/sandbox.ts`：留给沙盒开发者，详见 [沙盒模块交接](docs/sandbox-handoff.md)。
- `android/`：Android 壳、应用名、版本及系统返回键处理。

沙盒已有手机布局、家具目录、只读详情与独立演示数据；真实 3D 和状态模块尚未接入。导入当前为占位页面；没有接入 Home Assistant、其他 API、真实设备或服务端账号系统。浏览器网页和 Android App 使用各自的本地存储，不会自动同步数据。

## Android 签名和版本

包名保持 `com.homing.furniture`。发布新版本时一起更新 `package.json`、`package-lock.json`、Android 的 versionCode/versionName 以及界面版本文字。

本源码包不含原测试 APK 的签名密钥。新电脑首次打包会使用自己的调试签名，通常无法直接覆盖安装之前提供的 APK。若需要给现有安装持续更新，应由项目负责人保管同一签名，通过私下的安全渠道交给负责发布的同伴，不要上传到 GitHub。

卸载应用会删除本机家具记录；不要为解决签名不同而直接卸载包含重要数据的版本。

## 源码与网站的区别

上传源码到 GitHub 是共享代码，不会自动得到可访问的网站。网页要通过本地开发服务器运行，或把 `npm run build` 生成的 `dist/` 部署到静态网站托管服务。本项目使用相对资源路径，便于放在子目录中。

当前交付没有配置公共域名或自动发布。对外发布前，请先确定网站访问范围；现有账号校验只是演示界面，前端源码里的账号不能作为真正的访问控制。
