# 智能家具目录

本轮参考 Home Assistant 官方设备实体分类与家庭能源管理资料，为 homie 选取 15 个常见类别。这是本项目的首版目录，不是 Home Assistant 发布的使用率排行榜，也不代表已支持连接这些设备。

| 本地类型值 | 中文名称 | English |
| --- | --- | --- |
| light | 灯具 | Light |
| outlet | 智能插座 | Smart plug |
| switch | 智能开关 | Smart switch |
| air_conditioner | 空调 | Air conditioner |
| cover | 窗帘 | Curtain |
| fan | 风扇 | Fan |
| air_purifier | 空气净化器 | Air purifier |
| humidifier | 加湿器 | Humidifier |
| vacuum | 扫地机器人 | Robot vacuum |
| lock | 门锁 | Door lock |
| camera | 摄像头 | Camera |
| sensor | 传感器 | Sensor |
| water_heater | 热水器 | Water heater |
| home_battery | 家庭储能 | Home battery |
| solar_panel | 太阳能发电板 | Solar panel |

这些是 homie 的产品分类，不能直接作为 Home Assistant 的实体 domain 使用。例如空气净化器可能由风扇相关实体提供功能，家庭储能与光伏可能包含多个能源传感器；实际对应关系留待真正接入时确认。

默认房间为：客厅、厨房、玄关、浴室、阳台、房间1、房间2、房间3。旧的卧室、书房等房间和用户自定义名字继续保留。

旧分类 `sofa / chair / table / bed / cabinet / other` 从新增入口移除，但仍允许读取、展示和编辑历史记录。`homing.app.v1` 的键、版本及家具字段结构不变。

沙盒中的读数仅为演示：普通设备显示 24 小时用电量和当前功率，家庭储能示意充电量/充电功率，光伏示意发电量/发电功率。能量使用 kWh，功率使用 W 或 kW；没有对应示例数据的字段显示缺失值，不据此判断设备真实状态。

参考资料：

- [Home Assistant 官方实体分类](https://developers.home-assistant.io/docs/core/entity/)
- [Home Assistant 家庭储能](https://www.home-assistant.io/docs/energy/battery/)
- [Home Assistant 太阳能发电](https://www.home-assistant.io/docs/energy/solar-panels/)
