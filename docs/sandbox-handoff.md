# Homie 0.4：离线 3D 沙盒交接

通用两房一厅、三房两厅的独立资产交付见 [模型目录](../models/README.md)，文件名与模板标识对照见 [catalog.json](../models/catalog.json)。这两套资产尚未接入下述 App 沙盒流程。

本轮基于 0.3.0，合入 `integration/future-home-sandbox` 的 `929627ee328b20b7182e37f8bb880f2cf23053fd` 原型资产。保留新版家具数据层、15 类目录、8 个默认房间、登录和导航；没有用原型分支旧的 0.2 App 替换现有 App。

## 当前体验

- 固定小公寓 3D 可离线加载、触摸旋转/缩放、定位房间或设备、全屋视角复位。
- 手机上方保留模型，下方设备/任务面板独立滚动；短屏采用整页滚动。支持中英文及系统返回。
- 本机家具继续在“添加”页登记。沙盒提供只读详情与显式模型关联，不提供新增、编辑或删除家具。
- 本地离家流程：查看计划 → 选择动作 → 计划高亮 → 确认模拟执行 → 手动逐条接收模拟回读。默认先收到执行确认，再收到过期读数，最后收到有效关闭读数；可切换为对象读数先到。
- 计划高亮不改变设备状态；指令受理/执行确认只改变任务反馈；有效对象读数驱动画面。未知、过期读数不等于关闭。
- 普通玄关门只提供模拟人工检查。定位不完成检查；人工确认不自动声明本人离家。本人出门需独立点击。
- 全屋复位只调整镜头，保留本轮计划；“重新开始本轮演示”清空任务。离开沙盒也销毁当前演示会话，再次进入从基线开始。

所有数据和操作明确标为本地演示，不连接或控制真实设备。家庭用电、充电、发电及功率仍为分类示例值；已关联灯/空调的状态跟随模拟读数，关闭时演示功率为零，未知时功率缺失。门磁展示开合状态。储能充电和电量示例不与模型的开关状态混用。

## 文件与资源

| 内容 | 实际位置 |
| --- | --- |
| 页面入口、目录、详情、任务及生命周期 | `src/features/sandbox.ts` 的 `renderSandbox()` / `mountSandbox()` |
| 页面样式、加载/失败状态 | `src/features/sandbox.css`、`sandbox-scene.ts` |
| 手机渲染适配 | `src/features/sandbox-runtime/scene.js`、`scene.d.ts`、`scene.css` |
| 每轮模拟会话 | `src/features/sandbox-runtime/session.js`、`session.d.ts` |
| 本机家具与对象关联 | `src/features/sandbox-runtime/bindings.ts` |
| 原始 GLB 与实际映射 | `sandbox-prototype/house-modeling/releases/v0.1/` |
| 原始状态库、动画、Three.js 与许可证 | `sandbox-prototype/house-modeling/viewer/` |
| 原始本地流程、样例 | `sandbox-prototype/frontend/data-model.js`、`local-gateway.js`、`backend/离家检查联调样例.json` |

原型目录保留交付版本，移动端适配放在 `src/features/sandbox-runtime/`。App 没有嵌入整个桌面网页，也没有启动 Node 服务或导入 HTTP 网关。浏览器页面仅请求本地打包资源。

GLB 使用静态 `?url` 导入，由 Vite 输出带哈希的文件；映射和模拟样例作为模块输入。`vite.config.ts` 将 `three` 指向交付内的同一份本地模块，核心、控制器和 GLTFLoader 不走 CDN；许可证在源码及 `public/licenses/three.txt` 保留并随 APK 打包。Vite 的 `base: './'` 保持相对资源路径，模型加载器从解析后的模型地址定位附属资源。

Android 构建必须运行 `npm run android:sync`，把最新 `dist/` 复制入 APK。`scripts/build-android.ps1` 已包括生产构建和同步。不能只编译 Gradle而跳过同步。不要使用电脑绝对路径、`file:///` 或写死网站根路径。

## 数据与显式关联

家具目录继续由主 App 唯一 store 提供；`homing.app.v1`、版本 1 和家具字段不变。`model` 仍为品牌/型号文字，不能作为 GLB 路径。两个开发者演示账号共用本机家庭记录和设置，不是独立云账户。

关联单独保存在 `homie.sandbox.bindings.v1`：版本 1、固定 `template_id: baseline_apartment`、`objects` 为对象 ID 到家具本地 ID 的字典。只能由用户显式选择，一对一，不按名字或房间猜测，也不改写家具字段。写入失败不会在内存里假装保存成功；已删除家具、类型不匹配或无效关联在读取时忽略。

| 模型对象 | 可关联的家具类型 | 范围 |
| --- | --- | --- |
| `living_room_light` | `light` | 定位与模拟开关读数 |
| `bedroom_ac` | `air_conditioner` | 定位与模拟开关读数 |
| `balcony_door` | `sensor` | 阳台门磁开合读数 |
| `home_battery` | `home_battery` | 信息卡片，无空间节点 |

普通玄关门保留人工检查，不绑定智能锁控制。太阳能发电板等其他分类没有对应空间对象，继续保留信息卡片。模型四个房间和 App 八个默认房间是独立来源，不把模型卧室自动重命名成“房间1”，也不改变用户房间名。

## 生命周期

主 App 切换页面或语言前调用 `mountSandbox()` 返回的清理函数。当前实现：

- 每次挂载创建独立 `ProductStore` 与 `LocalGateway`，订阅只活在本次页面内；演示状态不写入家具存储。
- 动态加载渲染模块和 GLB；请求可取消，解析晚到时释放结果，不挂回已退出页面。
- 加载失败或 WebGL 上下文丢失时保留目录/任务，显示重试入口。
- 渲染上限 30fps、像素比上限 1.25、阴影 1024。`visibilitychange`、`pagehide` 和 Android `homie:app-state` 通知暂停，恢复时不重复启动循环。
- 卸载清理事件、订阅、观察器、动画帧、渲染器、几何体、材质、纹理、阴影与模型引用；清空模拟回读队列。
- Android `homing:back` 优先通过 `homie:sandbox-back` 关闭设备或对象详情，再由主 App 返回添加页。
- `inspectSandboxScene(container)` 是无控制能力的只读诊断入口，供浏览器检查实际灯材质和帧数；没有全局控制钩子。

## 下一轮接线

真实设备状态、HTTP 服务、Home Assistant 和真实控制尚未接入。后续必须保留任务、受理反馈和有效对象读数的分离；明确有效性、过期和错误规则后再加入真实传输。原型 HTTP 默认地址 `127.0.0.1:8787` 在手机表示手机自身，不能直接访问开发电脑。当前 APK 无需运行此服务。

浏览器测试覆盖模型加载、绑定、失败重试、退出竞态、后台暂停、双语和任务边界；APK 构建及资源核对不能代替 Android 真机性能、触摸和系统生命周期验收。最终验证记录见 `docs/validation.md`。
