# 小公寓 HTTP 联调与 DS 走查交接

2026-11-14。本轮仅 baseline_apartment、本地模拟服务。所有新增代码和请求证据在 frontend；backend、house-modeling、根目录约定及 qa 原始走查稿未修改。

## 启动与数据模式

在项目根目录的两个 PowerShell 窗口分别启动：

```powershell
node .\backend\server.mjs
```

```powershell
node .\frontend\server.mjs
```

后端默认 http://127.0.0.1:8787；页面 http://127.0.0.1:8780/frontend/ 。无需安装依赖。

- 本地样例：普通页面地址，沿用 LocalGateway 与原有回归。
- HTTP 模拟服务：http://127.0.0.1:8780/frontend/?mode=http ，顶部明确标注「模拟服务」。也可在右上演示设置选择模式、填写地址，点击「连接所选模式」。
- 会话：每次进入 HTTP 模式默认生成独立 `frontend-UUID`，整条业务链保留同一 `X-Demo-Session`。可在演示设置填写自己的会话名（1–80 位字母数字下划线连字符）后连接，DS 应使用自己的会话，不能复用 Astra 会话。
- HTTP 模式默认先读取当前会话基线，不擅自复位已有服务数据。选定 scenario 后点击「重新开始本地演示」，请求服务 reset 并设 `clock=manual`。按钮仅复位该会话；全屋复位始终不发 HTTP 请求。
- 连接失败会显示错误与「重试上次请求」。同次执行网络重试保留原 confirmation_id，不能通过再次点击生成新 ID 来冒充重试。

## 数据与版本

模型仍为 `house-modeling/releases/v0.1/future-home-v0.1.glb`，actual 映射同目录，状态和动画为 state-driven-v0.3，Three.js r160。准确模型哈希沿用 `qa/dependency-manifest.json`。共享约定 v0.5；HTTP 行为以当前 backend README 和运行服务为准，未使用静态样例任务/执行 ID。

`http-gateway.js` 是新增边界，返回当前服务响应给 ProductStore。响应携带的 task_id、execution_id、plan.plan_version 均从服务读取。对象增量、任务执行、能源分别投影；confirmed 不合成对象 off，对象 off 不自动完成任务。

重置时通过请求 epoch、ProductStore 本地 generation、服务 response.generation 三层检查丢弃旧响应。reset 请求失败不清任务；成功后才清状态。检查行使用 `checks_plan_version`，不混同执行确认版本。

## Astra 自动回归

```powershell
npm --prefix frontend test
node .\frontend\verify-http.mjs
```

本地数据流回归 15/15。实际 HTTP 适配回归 13 条链通过，请求、会话、状态码及完整关键响应见 `frontend/qa/http-regression.json`。测试由 HttpGateway 请求实际 8787 服务后应用 ProductStore，不仅检查原始 HTTP 响应。

覆盖正常主线与复位、稍后核实、离线有/无历史、409重新确认、超时刷新确认、超时刷新后重试、部分失败、两种回读顺序、待回读插入能源，以及丢响应重试同确认ID、失败复位保留状态、双复位迟到隔离。浏览器自测证据由主前端聊天补充；该文件不把自动回归或 Astra 自测记为 DS 独立验收。

## DS 独立浏览器步骤

先创建自己的会话，选择场景后复位为手动时钟。所有推进时间是从确认执行算起的累计时间；按钮输入的是本次增加的毫秒数。设置面板可随时关闭，不影响任务。

| 检查 | 页面操作 | 预期 |
| --- | --- | --- |
| 主线 | normal复位 → 猫留卧室 → 查看计划 → 玄关确认 → 关灯 → 推进700ms → 查询执行 → 刷新对象与执行 | 灯先awaiting且亮，确认和有效off分别更新；空调保留。本人出门另点顶栏按钮。最后演示复位清任务，镜头复位不清任务 |
| 稍后核实 | normal复位，玄关选稍后核实，再关灯、推进700ms、查询 | 玄关仍待办，关灯独立完成 |
| 离线有历史 | balcony_offline复位，生成计划，点阳台详情并重新读取对象 | 当前未知，有可信最后读数和时间 |
| 离线无历史 | balcony_offline_no_history同上 | 当前未知，不显示伪造历史行 |
| 409 | preconfirm_changed复位，生成计划，确认关灯 | 409错误清晰可见，最新计划版本和对象off更新；无执行成功记录，不重发无需动作项 |
| 超时 | readback_timeout复位，关灯后推进2400ms，查询，再刷新对象与执行 | 先结果待核实，刷新后原执行确认；不把超时自动当失败 |
| 超时允许重试 | readback_timeout_retry同上，刷新后点确认重试允许项 | 只重试服务返回的 eligible 项，新重试意图一个确认ID；网络重试复用该ID |
| 部分失败 | partial_failure复位，生成全员离家计划，主动勾选空调，执行后推进700ms并查询 | 灯confirmed/off，空调failed/on，默认空调未选；成功项保留 |
| 对象先到 | object_readback_first复位并关灯，推进700ms，点灯详情的重新读取对象；再推进600ms并查询执行 | off先改变模型，任务仍等待；累计1300ms任务才confirmed |
| 执行先到 | execution_confirmation_first复位并关灯，推进700ms查询；再推进300ms重新读取灯；再推进500ms重新读取灯 | confirmed时灯仍on，累计1000ms未知，1500ms有效off后关闭；待同步提示随证据变化 |
| 能源插入 | normal手动复位，关灯后不推进，点击插入能源超额采样 | 提醒+2kWh，原任务ID、执行ID、选择集、灯on及空调实况保留 |

请 DS 在项目 `qa/小公寓离家检查走查.md` 更新本轮独立结果，先主线再异常；逐项区分通过、失败、阻塞，记录接口、页面、3D及截图。旧“缺 index.html”已过时。Astra 的结果不可替代该记录。

## 问题交接边界

目前自动 HTTP 链未发现需改后端的阻断。已处理的前端问题包括 fetch 浏览器调用绑定、确认ID的网络重试保留、checks_plan_version 区分。模型历史来源的既有差异仍见上一轮交接 M-01，前端继续保守校验证据；没有修改模型运行时。

遇到新失败，请附独立 session、scenario、generation、方法与路径、JSON请求体、HTTP状态、关键响应及期望。浏览器只读 `window.frontendDiagnostics.inspect()` 包含 mode/session/generation/trace，可导出请求链作定位证据。没有自动省电控制、真机、大户型或夜间引路接线。
