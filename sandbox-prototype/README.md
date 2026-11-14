# Future Home sandbox prototype

这是 Homie 沙盒接入用的小公寓离家检查原型，包含产品页面、3D 资产和本地模拟服务。可独立运行，供 Android 应用组接入时对照。Homie 现有沙盒模块的生命周期与家具数据边界见 [App 沙盒交接说明](../docs/sandbox-handoff.md)。

## 在电脑上运行

使用 Node.js 22.12+。在仓库根目录开两个终端，分别运行：

```powershell
node .\sandbox-prototype\backend\server.mjs
```

```powershell
node .\sandbox-prototype\frontend\server.mjs
```

打开 [小公寓原型](http://127.0.0.1:8780/frontend/)。默认使用本地样例。要验证 HTTP，打开 [模拟服务模式](http://127.0.0.1:8780/frontend/?mode=http)，或在「演示设置」切换到「模拟服务 HTTP」，服务默认地址为 `http://127.0.0.1:8787`。模拟服务与界面都标注模拟数据，前端会生成独立会话。

## 应用包接入

- 应用组可从仓库根目录沿用原来的 Android 构建流程，详见 [Homie README](../README.md)。该分支将原型放在独立子目录，当前 Android 包仍使用 Homie 原有沙盒入口。要让原型出现在 APK 中，需要应用组接入 `src/features/sandbox.ts`，并将运行所需的页面、模型和模块纳入 Capacitor 打包资源。
- 可先复用本地样例模式验证移动端布局、模型加载和退出沙盒时的资源清理。HTTP 模式默认连接当前设备自身的回环地址，手机上的 `127.0.0.1` 无法访问开发电脑上运行的 Node 服务。真机调 HTTP 前，需要另行配置能从测试设备访问的模拟服务。
- 小公寓 GLB 与实际映射位于 `house-modeling/releases/v0.1/`。渲染与状态模块位于 `house-modeling/viewer/`。对象标识和状态语义见[共享约定](./未来家庭离家检查对接约定.md)。HTTP 运行行为见[模拟服务说明](./backend/README.md)。
- 本次交接范围为小公寓运行所需源码、模型、接口样例及相关交接材料。大户型源工程和生成的安装包单独交付。

## 回归命令

前端数据流测试可独立运行。后两项需先启动模拟服务。

```powershell
node --test .\sandbox-prototype\frontend\tests\data-flow.test.mjs
node .\sandbox-prototype\backend\verify-demo.mjs
node .\sandbox-prototype\frontend\verify-http.mjs
```

第三条命令生成 `frontend/qa/http-regression.json`。预览与 HTTP 回归用于验证本地模拟链路，APK 内的 WebView、资源加载和实机行为需接入后验证。
