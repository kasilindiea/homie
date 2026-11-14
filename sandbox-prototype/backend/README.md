# 小公寓离家检查本地模拟服务

在项目根目录用 Node.js 22 或更新版本启动。服务只使用 Node 自带模块，状态保存在进程内。默认地址为 `http://127.0.0.1:8787`，端口可通过 PowerShell 的 `$env:DEMO_PORT` 指定。

```powershell
node .\backend\server.mjs
```

可在另一个 PowerShell 窗口执行 HTTP 验收。脚本使用独立会话，不影响前端的模拟状态。

```powershell
node .\backend\verify-demo.mjs
```

## 路由

下表中的任务 ID、执行 ID 都使用运行时响应返回的值。模板为 `baseline_apartment`。并行联调时，每个调用方可用相同的 `X-Demo-Session` 请求头串起自己的调用。省略时使用 `default` 会话。

| 方法与路径 | 用途与更新范围 |
| --- | --- |
| `GET /demo/leave-check/state?template_id=baseline_apartment` | 全量快照。可加 `task_id` 读取该任务视图及最近一次执行。 |
| `POST /demo/leave-check/plans` | 新建或更新计划。更新时带 `task_id`。 |
| `PUT /demo/leave-check/tasks/{task_id}/manual-records/entry_door` | 人工核实。返回任务记录和玄关对象增量。 |
| `PUT /demo/leave-check/tasks/{task_id}/user-away` | 单独记录本人已出门。返回任务更新。 |
| `POST /demo/leave-check/tasks/{task_id}/executions` | 确认选中项。返回执行 ID、选中集与逐项结果。 |
| `GET /demo/leave-check/tasks/{task_id}/executions/{execution_id}` | 按执行查询。默认附对象读数，分步场景仅给执行结果。 |
| `POST /demo/leave-check/state/refresh` | 刷新 `object_ids`。有任务检查行时附 `checks`；带 `task_id` 与 `execution_id` 时还可复核对应执行。 |
| `POST /demo/leave-check/reset` | 复位当前模拟会话，返回全量基线。普通请求体为 `{"template_id":"baseline_apartment"}`。旧任务与执行 ID 失效。 |
| `POST /demo/leave-check/debug/advance` | 推进模拟时钟。请求含 `template_id` 和 `ms`，每次 0–60000。 |
| `POST /demo/energy/samples` | 评估模拟采样，返回能源数据和提醒。 |
| `POST /demo/energy/plans` | 生成独立的能源预览。 |
| `POST /demo/energy/authorization/check` | 返回预览授权校验。模拟环境仅返回 `preview_only`。 |

## 前端 HTTP 接线

- 所有 `POST` 和 `PUT` 都使用 JSON 请求体。计划、刷新、复位、时钟推进和三条能源路由要求 `template_id: "baseline_apartment"`，缺失或不匹配返回 `422 INVALID_TEMPLATE`。任务路径下的人工核实、本人出门和执行提交以路径任务 ID 定位，当前实现不读取请求体的 `template_id`。前端可以为所有写请求统一附上该字段。读取全量状态需要同名查询参数，查询执行结果使用路径中的两个 ID。
- `generation` 是响应体字段。成功复位使当前会话代次加一，普通读写和时钟推进沿用当前代次。服务在解析到会话后也会给业务错误附上代次，解析 JSON 或校验会话头失败时可能缺席。前端以成功复位返回的代次更新本地会话，丢弃更早代次的在途响应。请求不用回传代次，代次也不会在服务重启后持久化。
- CORS 允许任意来源，`OPTIONS` 返回 `204`，允许 `GET, POST, PUT, OPTIONS` 与请求头 `Content-Type, X-Demo-Session`。浏览器使用默认凭据模式或 `credentials: "omit"`。使用独立 `X-Demo-Session`，同一次走查中的读取、写入和复位都带同一个值。

## 从生成计划到成功回读

`clock="manual"` 让步骤可重复，推进时钟的位置决定回读何时可见。默认 `clock="realtime"` 下正常回读约 700 ms 可查询。

```powershell
$base = 'http://127.0.0.1:8787'
$headers = @{ 'X-Demo-Session' = 'leave-check-walkthrough' }
$template = 'baseline_apartment'

function Invoke-DemoWrite($Method, $Path, $Body) {
    Invoke-RestMethod -Method $Method -Uri "$base$Path" -Headers $headers `
        -ContentType 'application/json; charset=utf-8' -Body ($Body | ConvertTo-Json -Depth 8)
}

$null = Invoke-DemoWrite POST '/demo/leave-check/reset' @{
    template_id = $template
    clock = 'manual'
}
$plan = Invoke-DemoWrite POST '/demo/leave-check/plans' @{
    template_id = $template
    intent_text = '我出门两小时，猫留在卧室。'
    occupancy = 'occupied'
    retain_room_ids = @('bedroom')
    room_occupancy = @{ living_room = 'empty'; bedroom = 'occupied' }
}
$task = "/demo/leave-check/tasks/$($plan.task_id)"
$null = Invoke-DemoWrite PUT "$task/manual-records/entry_door" @{ result = 'deferred' }
$null = Invoke-DemoWrite PUT "$task/user-away" @{ user_away = $true }
$run = Invoke-DemoWrite POST "$task/executions" @{
    plan_version = $plan.plan.plan_version
    confirmation_id = 'confirm-light'
    selected_item_ids = @('item_living_room_light')
}
$run.execution[0].status  # awaiting_readback

$null = Invoke-DemoWrite POST '/demo/leave-check/debug/advance' @{
    template_id = $template
    ms = 700
}
$done = Invoke-RestMethod -Uri "$base$task/executions/$($run.execution_id)" -Headers $headers
$done.execution[0].status           # confirmed
$done.objects.living_room_light.state  # off
```

## 已实跑的异常与分步场景

使用同一复位路由传入可选的 `scenario`。以下时间均从确认执行算起。

| `scenario` | 操作与已验证结果 |
| --- | --- |
| `preconfirm_changed` | 生成基线计划后确认关灯。模拟外部已关灯，返回 `409 RECONFIRM_REQUIRED`、新版本和对象读数，执行记录为空。 |
| `normal` | 相同确认 ID、版本和选中集合并发提交，复用执行 ID。相同 ID 换内容得到 `CONFIRMATION_CONFLICT`；正在执行时另发确认得到 `ACTION_IN_PROGRESS`。 |
| `readback_timeout` | 推进 2400 ms 后查询得到 `unknown`。带执行 ID 刷新读到 `off`，确认原执行。 |
| `readback_timeout_retry` | 推进 2400 ms 后刷新读到 `on`，开放显式重试。刷新之前提交重试得到 `REFRESH_REQUIRED`。 |
| `partial_failure` | 生成全员离家计划，空调默认不勾选。主动选择灯和空调后，灯确认关闭，空调逐项返回失败且实况仍开。 |
| `object_readback_first` | 700 ms 刷新对象得到 `off`，执行仍待回读；1300 ms 查询执行确认。 |
| `execution_confirmation_first` | 700 ms 查询执行确认，当前对象仍为 `on`；1000 ms 刷新变未知；1500 ms 得到有效 `off`。 |
| `balcony_offline` / `balcony_offline_no_history` | 两种离线状态都为未知。仅前者返回可信历史。 |
| `balcony_refresh_with_check` / `balcony_refresh_without_check` | 有计划行时刷新复用行 ID，缺行时仅给对象读数。 |

另已验证能源采样可插在离家待回读期间，超额 2 kWh、同日提示合并和未授权预览均保留原任务、勾选及对象实况。页面与 3D 的渲染和交互仍需前端接线后验收。

### 异常请求顺序

每条链从 `POST /demo/leave-check/reset` 开始，提交 `{"template_id":"baseline_apartment","scenario":"对应场景","clock":"manual"}`。按上面的正常请求链生成计划和提交动作。下文的「推进」均指调用 `POST /demo/leave-check/debug/advance`，`ms` 为本次追加的时间。

1. **确认前变化。** 选 `preconfirm_changed`，生成计划后直接确认客厅灯。提交返回 `409`，用响应的 `plan` 和 `objects` 更新页面，执行查询从这次提交取不到执行 ID。
2. **重复确认。** 选 `normal`，用同一任务、版本、`confirmation_id` 和选中集合提交两次，再推进 700 ms 查询原执行。两次提交的 `execution_id` 一致。
3. **超时与重试。** 选 `readback_timeout` 或 `readback_timeout_retry`，确认关灯 → 推进 2400 ms → 查询执行，检查 `status=unknown`。调用 `POST /demo/leave-check/state/refresh`，传 `template_id`、原 `task_id`、原 `execution_id`、`object_ids: ["living_room_light"]`。前者确认原执行，后者返回 `retry_eligible_item_ids`，再用新 `confirmation_id` 提交其中的灯条目，推进 700 ms 后查询新执行。
4. **部分失败。** 选 `partial_failure`，用 `occupancy: "empty"` 和 `retain_room_ids: []` 生成计划。提交 `selected_item_ids: ["item_living_room_light","item_bedroom_ac"]`，推进 700 ms 后查询执行。灯为 `confirmed`，空调为 `failed`。
5. **对象读数先到。** 选 `object_readback_first`，确认关灯 → 推进 700 ms → 刷新灯对象（省略 `execution_id`），得到 `off` → 查询执行仍待回读 → 再推进 600 ms → 查询执行确认。
6. **执行确认先到。** 选 `execution_confirmation_first`，确认关灯 → 推进 700 ms → 查询执行确认（仅任务结果）→ 再推进 300 ms 并刷新灯对象，得到过期未知 → 再推进 500 ms 并刷新，得到 `off`。

## 与 v0.2 的差异及前端影响

- v0.2 业务路径与主要状态码沿用。运行时任务、执行和能源预览 ID 由服务分配。能耗提醒 ID 由计量口径和统计周期生成。请求链需从响应取 ID，使用静态样例中的 ID 会查不到记录。
- 增加 `X-Demo-Session` 与响应 `generation`。同一业务流程沿用同一会话头。复位成功后，应忽略旧代次响应，再用基线快照清空该会话内任务。
- 提交执行返回执行结果与选中集，省略 `objects`。分步回读场景的执行查询也省略 `objects`。前端只在收到 `objects` 时应用对象增量，按任务和执行 ID 独立处理结果。
- 同次刷新同时关联执行与阳台检查时，`plan_version` 是执行确认的版本，`checks_plan_version` 是当前检查行所属计划的版本。只刷新检查行时两者相同。
- 复位可选 `scenario`、`clock`，新增模拟时钟推进入口。省略时走正常模拟流程。会话重启后重新读取基线并开始新任务。
- 能源分支接受上海时区的模拟读数，提供日/月预算提醒和预览。低备电触发、可用预授权和自动省电动作留待后续。能源路由不返回设备增量或离家执行字段。
