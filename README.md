# gz-3d-city

一个基于 Three.js 的 3D 城市漫游系统，支持瓦片动态加载与建筑生长动画。

## 功能简介
- 城市漫游：相机可在城市区域自由切换视角，支持 6 档鸟瞰到街景的平滑过渡。
- 瓦片加载：根据相机位置动态加载/卸载城市瓦片数据，提升性能。
- 建筑动画：建筑加载时采用“拔地而起”生长动画，视觉更流畅。
- 天空盒：支持 HDRI 天空背景，提升真实感。

## 目录结构
```
gz-3d-city/
├── index.html           # 入口页面
├── package.json         # 项目依赖与脚本
├── public/
│   ├── data/tiles/      # 城市瓦片数据（GeoJSON）
│   ├── skybox/          # 天空盒贴图
│   └── ...
├── src/
│   ├── main.js          # 主 Three.js 漫游逻辑
│   ├── style.css        # 页面样式
│   └── ...
```

## 快速启动
1. 安装依赖：
   ```bash
   npm install
   ```
2. 启动开发服务器：
   ```bash
   npm run dev
   ```
3. 浏览器访问：
   ```
   http://localhost:5173/ 或 5174
   ```

## 主要技术点
- Three.js 场景、相机、灯光、天空盒
- MapControls 控制器自定义视角切换
- 城市瓦片数据动态加载与卸载
- 建筑生长动画（scale.y 动态变化）
- 响应式 UI 信息面板

## 数据说明
- 城市瓦片数据存放于 `public/data/tiles/`，每个瓦片为 GeoJSON 格式，包含建筑多边形及高度、颜色等属性。
- 天空盒贴图建议使用 HDRI 或高质量 JPG/PNG，放于 `public/skybox/`。

## 交互说明
- 鼠标左键拖动：平移视角
- 鼠标右键拖动：旋转视角
- 鼠标滚轮：切换视角档位（鸟瞰→街景，平滑过渡）

## 依赖
- [Three.js](https://threejs.org/)
- [Vite](https://vitejs.dev/)（开发服务器）

---
如需自定义数据或贴图，请参考 `src/main.js` 配置。
