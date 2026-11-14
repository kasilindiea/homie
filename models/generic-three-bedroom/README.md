# 三房两厅

主卧、客卧、次卧，独立客厅与餐厅，厨房、一个卫生间、玄关、卧室走廊和生活阳台。床宽分别为 1.8、1.5、1.2 米。

| 用途 | 文件 |
| --- | --- |
| 加载或集成模型 | [下载 三房两厅.glb](./三房两厅.glb?raw=1) |
| 在 Blender 中编辑 | [下载 Blender 工程](./future-home-generic-three-bedroom-v0.1.blend?raw=1) |
| 全屋效果图 | [斜俯视图](./screenshots/default-blender.png) |
| 户型布局 | [俯视图](./screenshots/plan-blender.png) |
| 文件完整性 | [SHA256 校验清单](./SHA256SUMS.txt) |

GLB 已使用中文文件名 **`三房两厅.glb`**。模板标识保持 `generic_three_bedroom`，版本为 `0.1`，与改名前的模型内容一致。Blender 工程保留原文件名，贴图已打包；GLB 材质与贴图也已嵌入，可独立加载。

模型采用米制，glTF 坐标为 X 东、Y 上、Z 南。10 个房间区域，9 个独立设备或检查点，保留 `shared_id`、房间归属、热点与相机目标节点。区域轴线面积约 112.28㎡，阳台全计；不是建筑面积或实测套内面积。

这次交付为模型资产，尚未加入 App 户型选择，也没有新增配套网页或实时设备接口。需要修改模型时打开本目录 `.blend`；需要使用现成模型时直接取 `.glb`，无需安装前端依赖。

几何与回导记录见 [QA](./qa/)。在仓库根目录运行 `python models/verify_models.py`，可核对两个模型的文件名、SHA256、GLB 结构、模板节点和嵌入资源。

![三房两厅实际渲染](./screenshots/default-blender.png)

[返回全部模型](../README.md)
