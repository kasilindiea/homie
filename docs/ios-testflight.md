# Homie iOS 构建与 TestFlight

Homie 的 App Store Connect Apple ID 为 `6834775869`，Apple Developer Team ID 为 `4X33LDKNXN`，已注册的 Bundle ID 为 `com.homing.furniture`。内测组为 [Homie-Internal](https://appstoreconnect.apple.com/teams/1a9dc26e-2d4a-4bb8-b62f-b05f66d8a36f/apps/6834775869/testflight/groups/8b0d57cf-e99c-4bdf-94b2-d773022b9bad)，使用手动构建分配。王永亮账号已在组内。新 App 初次核对时没有可见构建，App 为本次新建，候选版本为 `0.4.0 (1)`。

工程使用 Capacitor 8.6.2 和 Swift Package Manager，部署目标 iOS 15.4，以满足沙盒状态库使用的 structuredClone。2026-11-14 查阅 Apple 要求，上传需要 Xcode 26 或更新版本及 iOS 26 SDK 或更新 SDK。归档前用 `xcodebuild -version` 和 `xcodebuild -showsdks` 确认安装。 [Apple 当前要求](https://developer.apple.com/news/upcoming-requirements/)

## 在获准的 Mac 或 macOS CI 上归档

1. 将本地合入提交通过已授权的渠道交给构建端。在该提交的干净检出中使用 Node.js 22.12+，依次构建并同步资源。

   ```sh
   npm ci
   npm test
   npm run build
   npx cap sync ios
   xcodebuild -list -project ios/App/App.xcodeproj
   ```

2. 在 App Store Connect 的 Homie TestFlight 构建和上传记录确认 build 1 仍空闲。Xcode 打开 `ios/App/App.xcodeproj`，在 App target 的 Signing & Capabilities 核对 Team、Bundle ID 和签名状态。可用 Xcode 自动签名，或通过团队现有密钥管理渠道在构建端配置 Apple Distribution 证书及其私钥，并准备匹配 Homie App ID 的 App Store 分发描述文件。JHS 历史分发证书同属此团队，复用取决于构建端是否可用其私钥。JHS 的 App Store 描述文件绑定其自身的 Bundle ID。
3. 通过 Xcode 的 **Product → Archive** 启动归档，或在签名已配置的构建端运行下方命令。归档后核对 App 的 CFBundleIdentifier、版本与构建号、签名、Team、SDK，以及 `public/assets/` 的两份 GLB 和 JS 资源。

   ```sh
   xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
     -destination 'generic/platform=iOS' -archivePath artifacts/Homie.xcarchive archive
   ```

4. 在 Organizer 对归档执行 **Distribute App → TestFlight Internal Only**。上传前确认目标是 Homie Apple ID `6834775869`。使用团队既有的上传配置时，同样以 Homie 的 App 记录和签名为准。
5. 跟进 Apple 处理和需要人工回答的合规项。在 Homie 的 TestFlight 中确认对应构建已处理，进入 `Homie-Internal` 手动添加构建，并回读内测组构建列表和状态，记录版本、构建号和截图。 [Apple 内测组操作](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)

## iPhone 走查

收到构建可测通知后，用已加入内测组的 Apple 账户在 iPhone 打开 TestFlight，点 Homie → 安装。安装完成后开启飞行模式，彻底退出再打开 Homie，用演示账号 `aaaa / bbbb` 登录。进入沙盒切换大户型，点全屋复位，定位玄关，分别点客厅灯和餐厅灯，再查洗衣机和冰箱。将样例改为冰箱分区离线，确认冷藏为未知、冷冻仍有读数。最后回切小公寓，执行一次离家任务和模拟回读。
