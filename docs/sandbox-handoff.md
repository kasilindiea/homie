# Homie 0.0.6：三户型沙盒交接

0.4 阶段基于 0.3.0，合入 `integration/future-home-sandbox` 的 `929627ee328b20b7182e37f8bb880f2cf23053fd` 原型资产。保留新版家具数据层、15 类目录、8 个默认房间、登录和导航；没有用原型分支旧的 0.2 App 替换现有 App。

0.0.6 基于 0.0.5 的 `ec9a3956e7458bde3842e5c4f88bf1b7f015c759`，在独立分支 `codex/three-layout-sandbox` 接入 `codex/generic-house-models` 的 `4bf23c8e8e92aeb1f588b59892c133fae6d82c31` 资产。只提取模型资产和适用配置，保留 0.0.5 的页面、数据层、登录、模式分区和路演导入功能。新分支原始交付只含几何与节点标识；手机对象映射、相机参数及本地模拟适配由本轮补齐，没有加入后端连接。

## 页面分区与户型

- 默认“全屋检查”底部只列出本机已添加设备和只读详情。点击 3D 对象不会绕过入口直接打开场景演示设备。
- 相邻“沙盒演示”入口承接原离家任务模拟；可切换离家任务和场景演示设备。
- 在同一沙盒页切换全屋检查/沙盒演示，以及来回切换户型，保留各户型本轮计划、勾选与设备读数；不同户型之间不共享模拟会话。全屋复位只复位视角。
- 菜单提供一房一厅（`baseline_apartment`）、两房一厅（`generic_two_bedroom`）、三房两厅（`generic_three_bedroom`），分别使用真实独立 GLB。两房是 8 个房间区域、9 个设备/检查点；三房是 10 个房间区域、9 个设备/检查点。旧 `large_flat_128` 保留源码备用，不启用、不打包，也没有四房选项。
- 选择户型和模式不改家具、房间或已保存的绑定。未来新增户型时提供对应 GLB、实际对象映射和状态样例，再扩展模板目录；不能仅改标签就声称模型准确。

## 当前体验

- 三个固定户型的 3D 可离线加载、触摸旋转/缩放、定位当前户型房间或设备、全屋视角复位。
- 手机上方保留模型，下方设备/任务面板独立滚动；短屏采用整页滚动。支持中英文及系统返回。
- 本机家具继续在“添加”页登记。沙盒提供只读详情与显式模型关联，不提供新增、编辑或删除家具。
- 本地离家流程：查看计划 → 选择动作 → 计划高亮 → 确认模拟执行 → 手动逐条接收模拟回读。默认先收到执行确认，再收到过期读数，最后收到有效关闭读数；可切换为对象读数先到。
- 计划高亮不改变设备状态；指令受理/执行确认只改变任务反馈；有效对象读数驱动画面。未知、过期读数不等于关闭。
- 普通玄关门只提供模拟人工检查。定位不完成检查；人工确认不自动声明本人离家。本人出门需独立点击。
- 两房、三房沿用并按模板适配四个公共对象的离家流程：`entry_door`、`balcony_door`、`living_room_light`、`bedroom_ac`。玄关门为人工确认、阳台门磁用于核实、客厅灯和空调按计划条件参与本地模拟。洗衣机、冰箱、餐区灯、窗帘和电视这另外五个对象仅提供只读演示，不自动增加离家动作或实际控制能力。
- 全屋复位只调整镜头，保留本轮计划；“重新开始本轮演示”清空当前户型任务。离开沙盒或切换语言时销毁全部页面会话，再次进入从基线开始。

所有数据和操作明确标为本地演示，不连接或控制真实设备。家庭用电、充电、发电及功率仍为分类示例值；已关联灯/空调的状态跟随模拟读数，关闭时演示功率为零，未知时功率缺失。门磁展示开合状态。储能充电和电量示例不与模型的开关状态混用。

## 文件与资源

| 内容 | 实际位置 |
| --- | --- |
| 页面入口、目录、详情、任务及生命周期 | `src/features/sandbox.ts` 的 `renderSandbox()` / `mountSandbox()` |
| 页面样式、加载/失败状态 | `src/features/sandbox.css`、`sandbox-scene.ts` |
| 手机渲染适配 | `src/features/sandbox-runtime/scene.js`、`scene.d.ts`、`scene.css` |
| 每轮模拟会话 | `src/features/sandbox-runtime/session.js`、`session.d.ts` |
| 统一模板目录、双语名称、可关联类型 | `src/features/sandbox-runtime/templates.ts` |
| 本机家具与对象关联 | `src/features/sandbox-runtime/bindings.ts` |
| 原始 GLB 与实际映射 | `sandbox-prototype/house-modeling/releases/v0.1/` |
| 两房 GLB 与手机映射 | `models/generic-two-bedroom/两房一厅.glb`、同目录 `mobile-object-map.json` |
| 三房 GLB 与手机映射 | `models/generic-three-bedroom/三房两厅.glb`、同目录 `mobile-object-map.json` |
| 资产目录、原始校验与手机映射生成 | `models/catalog.json`、`models/verify_models.py`、`scripts/extract-model-maps.mjs` |
| 上版大户型文件（仅借用本地状态样例，不启用旧模型） | `sandbox-prototype/house-modeling/releases/large-flat-128/` |
| 上版大户型运行时与设备展示（本轮不导入） | `src/features/sandbox-runtime/large-flat.js`、`src/features/sandbox-large-flat.ts` |
| 原始状态库、动画、Three.js 与许可证 | `sandbox-prototype/house-modeling/viewer/` |
| 原始本地流程、样例 | `sandbox-prototype/frontend/data-model.js`、`local-gateway.js`、`backend/离家检查联调样例.json` |

原始 GLB、Blender 工程、截图、原校验清单和 QA 文件保持交付内容。新 `mobile-object-map.json` 从 GLB 的真实 `shared_id`、`room_id`、对象类型、热点和相机目标节点提取；双语名称与手机相机偏移是适配层配置，文件中单独记录来源提交和 GLB 哈希。不能套用旧大户型含书房或额外阳台的对象表。

在仓库根目录运行 `python models/verify_models.py` 核对原始交付文件，运行 `node scripts/extract-model-maps.mjs` 重新生成手机映射；`node scripts/extract-model-maps.mjs --check` 只检查映射与当前资产是否一致。这些脚本不启动服务，也不改 GLB。

`templates.ts` 的 `SANDBOX_TEMPLATES` 是菜单和场景的统一入口：每项包含 `layoutId`、稳定 `templateId`、双语标题、静态模型 URL、映射、从映射派生的房间/设备列表以及 `bindableObjects`。用 `getSandboxTemplate()` 按菜单 ID 选择，`templateObjectName()` 负责对象双语名称。移动端适配放在 `src/features/sandbox-runtime/`；App 没有嵌入整个桌面网页，也没有启动 Node 服务或导入 HTTP 网关。

`createSandboxSession(template?)` 省略参数时保留一房行为；新模板按实际映射保留 9 个设备/检查点并对齐 `room_id`。四个公共对象的样例来自原离家联调数据，额外五个对象借用 `large-flat-128/state-fixtures.json` 的基线示例，且 `allowed_actions` 为空。它们是明确标注的本地模拟输入，不是新模型自带的实时设备状态；不会把旧大户型的 GLB、书房设备或储能对象带入新户型。

状态库按映射的 `template_id` 初始化，LocalGateway 跟随当前会话的模板；不同模板的响应 envelope 不可互相应用。房间占用按当前模型房间表生成，计划仍只覆盖四个公共对象，不把另外五个只读设备隐式加入执行范围。

GLB 使用静态 `?url` 导入，由 Vite 输出带哈希的文件；映射和模拟样例作为模块输入。`vite.config.ts` 将 `three` 指向交付内的同一份本地模块，核心、控制器和 GLTFLoader 不走 CDN；许可证在源码及 `public/licenses/three.txt` 保留并随 APK 打包。Vite 的 `base: './'` 保持相对资源路径，模型加载器从解析后的模型地址定位附属资源。

Android 构建必须运行 `npm run android:sync`，把最新 `dist/` 复制入 APK。`scripts/build-android.ps1` 已包括生产构建和同步。不能只编译 Gradle而跳过同步。不要使用电脑绝对路径、`file:///` 或写死网站根路径。

## 数据与显式关联

家具目录继续由主 App 唯一 store 提供；`homing.app.v1`、版本 1 和家具字段不变。`model` 仍为品牌/型号文字，不能作为 GLB 路径。两个开发者演示账号共用本机家庭记录和设置，不是独立云账户。

关联按模板独立存储，envelope 仍为版本 1，含对应 `template_id` 和对象 ID 到家具本地 ID 的 `objects` 字典：

| 户型 | 存储键 |
| --- | --- |
| 一房一厅 | `homie.sandbox.bindings.v1`（旧键不变） |
| 两房一厅 | `homie.sandbox.bindings.v1.generic_two_bedroom` |
| 三房两厅 | `homie.sandbox.bindings.v1.generic_three_bedroom` |

`readBindings()` / `saveBinding()` 末尾接受可选 `{ templateId, bindableObjects }`；省略时保留原一房行为。新户型不会按同名 `object_id` 继承一房关联，读到不匹配的 envelope 也不会应用。只能由用户显式选择，在单个户型内一对一；同一家具可分别关联到不同户型，但操作只写当前户型的键，不改家具字段。写入失败不会在内存里假装保存成功；已删除家具、类型不匹配、重复或无效关联在读取时忽略。

| 模型对象 | 可关联的家具类型 | 范围 |
| --- | --- | --- |
| `living_room_light` | `light` | 三户型的定位与模拟开关读数 |
| `bedroom_ac` | `air_conditioner` | 三户型的定位与模拟开关读数 |
| `balcony_door` | `sensor` | 三户型的阳台门磁读数 |
| `home_battery` | `home_battery` | 仅一房的信息卡片，无空间节点 |
| `dining_room_light` | `light` | 两房/三房的只读演示与定位 |
| `living_room_curtain` | `cover` | 两房/三房的只读演示与定位 |

普通玄关门保留人工检查，不绑定智能锁控制。洗衣机、冰箱、电视尚没有对应的 App 家具分类，不强行绑定“其他”或插座；太阳能发电板等没有对应空间对象的已登记家具继续保留信息卡片。一房的 4 个、两房的 8 个、三房的 10 个模型区域与 App 八个默认房间是独立来源，不把模型卧室自动重命名成“房间1”，也不改变用户房间名。

## 生命周期

主 App 切换页面或语言前调用 `mountSandbox()` 返回的清理函数。当前实现：

- 每次挂载按模板分别建立并缓存独立 `ProductStore` 与 `LocalGateway`；计划、勾选和模拟回读只属于所在模板，不写入家具存储。
- 切户型时退订原页面订阅，中止旧加载、销毁旧渲染场景，再载入新模板；保留原模板的本轮会话。返回已访问模板时恢复其计划与读数，同一菜单项重选不会重开演示。
- 动态加载渲染模块和 GLB；请求可取消，解析晚到时释放结果，不挂回已退出页面。
- 加载失败或 WebGL 上下文丢失时保留目录/任务，显示重试入口。
- 渲染上限 30fps、像素比上限 1.25、阴影 1024。`visibilitychange`、`pagehide` 和 Android `homie:app-state` 通知暂停，恢复时不重复启动循环。
- 离开沙盒或切换语言的卸载会清理事件、订阅、观察器、动画帧、渲染器、几何体、材质、纹理、阴影与模型引用，并销毁全部缓存会话、清空各自的模拟回读队列。
- Android `homing:back` 优先通过 `homie:sandbox-back` 关闭户型菜单或详情，然后退出沙盒演示回到全屋检查，最后由主 App 返回添加页。
- `inspectSandboxScene(container)` 是无控制能力的只读诊断入口，供浏览器检查实际灯材质和帧数；没有全局控制钩子。

## 下一轮接线

真实设备状态、HTTP 服务、Home Assistant 和真实控制尚未接入。后续必须保留任务、受理反馈和有效对象读数的分离；明确有效性、过期和错误规则后再加入真实传输。原型 HTTP 默认地址 `127.0.0.1:8787` 在手机表示手机自身，不能直接访问开发电脑。当前 APK 无需运行此服务。

“导入”页沿用 0.0.5 的 `src/features/import.ts` / `import.css`，复用主 App 的挂载/卸载机制。API 地址和可选密钥仅用于表单路演，不调用网络、不写家具 store、不持久化输入；离开页面或切换语言后清空。后续真实导入需另行设计接口契约、鉴权、错误处理与导入确认，不能把当前演示反馈视为真实连接结果。

验收需覆盖三套模型加载、跨户型绑定/任务隔离、失败重试、退出竞态、后台暂停、双语和任务边界；APK 构建及资源核对不能代替 Android 真机性能、触摸和系统生命周期验收。实际通过情况与未测项以 `docs/validation.md` 为准。
