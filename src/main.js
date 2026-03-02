import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

// ================== 1. 全局配置 ==================
const CONFIG = {
    TILE_SIZE: 500,        // 必须与 Python 切片脚本一致
    VISIBLE_RADIUS: 3,     // 加载半径：3 表示加载周围 7x7 的瓦片
    UNLOAD_RADIUS: 5,      // 卸载半径：超出这个范围的瓦片会被卸载
    FOG_DENSITY: 0.00015,  // 雾的浓度
    BASE_URL: '/data/tiles', // 瓦片数据的路径
    ROADNET_URL: '/data/roadnet' // 路网数据的路径
};

// ================== 2. 场景初始化 ==================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, CONFIG.FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);
// 初始相机位置 - 鸟瞰视角2500m高度
camera.position.set(250, 2500, 10750);
camera.lookAt(250, 0, 10750);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
renderer.setClearColor(0x87ceeb, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

// ================== 3. 灯光设置 ==================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(500, 1000, 500);
scene.add(dirLight);

// 补光
const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
fillLight.position.set(-500, 500, -500);
scene.add(fillLight);

// ================== 4. 天空盒与地面 ==================
const textureLoader = new THREE.TextureLoader();
textureLoader.load('/skybox/DaySkyHDRI027B_4K_TONEMAPPED.jpg', (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    console.log('✓ 天空盒加载成功');
});
// 添加平面的地面
const planeGeometry = new THREE.PlaneGeometry(200000, 200000);
const planeMaterial = new THREE.MeshLambertMaterial({
    color: 0x222222,
    polygonOffset: true,      // 启用多边形偏移
    polygonOffsetFactor: 2,    // 在深度缓冲中将地面往后推
    polygonOffsetUnits: 2
});
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2;
plane.position.y = -0.5;
plane.renderOrder = 0; // 地面最先渲染
scene.add(plane);

// ================== 5. 控制器 ==================
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.enableZoom = false; // 禁用默认缩放，使用自定义逻辑
controls.maxPolarAngle = Math.PI / 2.2;
// 设置初始目标点
//controls.target.set(-250, 0, 10750);
controls.target.set(250, 0, 10750);
controls.update();

// ================== 5.1 自定义滚轮交互 ==================
// 定义6个视角档位：从鸟瞰到街景
const viewLevels = [
    { height: 2500, angle: 90 },  // 档位0: 鸟瞰 (可看约40个瓦片)
    { height: 1800, angle: 75 },  // 档位1: 高空俯视
    { height: 1200, angle: 60 },  // 档位2: 中高空
    { height: 700,  angle: 50 },  // 档位3: 中空
    { height: 400,  angle: 40 },  // 档位4: 低空
    { height: 200,  angle: 25 },  // 档位5: 街景视角 (最低)
    { height: 100,  angle: 15 },  // 档位6: 视角最低
];

const viewConfig = {
    currentLevel: 0,              // 当前档位
    targetHeight: viewLevels[0].height,
    targetAngle: viewLevels[0].angle * Math.PI / 180,
    currentHeight: viewLevels[0].height,
    currentPolarAngle: viewLevels[0].angle * Math.PI / 180,
    
    // 过渡动画参数
    transitionSpeed: 0.08,        // 过渡速度 (0-1)
    isTransitioning: false,
};

// 平滑更新相机位置和角度
function updateCameraView() {
    // 平滑过渡到目标值
    const heightDiff = viewConfig.targetHeight - viewConfig.currentHeight;
    const angleDiff = viewConfig.targetAngle - viewConfig.currentPolarAngle;
    
    if (Math.abs(heightDiff) > 1 || Math.abs(angleDiff) > 0.001) {
        viewConfig.currentHeight += heightDiff * viewConfig.transitionSpeed;
        viewConfig.currentPolarAngle += angleDiff * viewConfig.transitionSpeed;
        viewConfig.isTransitioning = true;
    } else {
        viewConfig.currentHeight = viewConfig.targetHeight;
        viewConfig.currentPolarAngle = viewConfig.targetAngle;
        viewConfig.isTransitioning = false;
    }
    
    const target = controls.target;
    
    // 根据俯仰角计算相机位置
    const horizontalDist = viewConfig.currentHeight * Math.tan(Math.PI / 2 - viewConfig.currentPolarAngle);
    
    // 获取当前相机朝向（水平方向）
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    direction.y = 0;
    if (direction.length() < 0.01) {
        direction.set(0, 0, -1);
    }
    direction.normalize();
    
    // 更新相机位置
    camera.position.set(
        target.x - direction.x * horizontalDist,
        viewConfig.currentHeight,
        target.z - direction.z * horizontalDist
    );
    
    camera.lookAt(target);
}

// 自定义滚轮事件 - 档位切换
renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    
    if (event.deltaY < 0) {
        // 向前滚动：切换到下一档位（更低视角）
        if (viewConfig.currentLevel < viewLevels.length - 1) {
            viewConfig.currentLevel++;
        }
    } else {
        // 向后滚动：切换到上一档位（更高视角）
        if (viewConfig.currentLevel > 0) {
            viewConfig.currentLevel--;
        }
    }
    
    // 设置目标值，触发平滑过渡
    const level = viewLevels[viewConfig.currentLevel];
    viewConfig.targetHeight = level.height;
    viewConfig.targetAngle = level.angle * Math.PI / 180;
    
    console.log(`切换到档位 ${viewConfig.currentLevel}: 高度=${level.height}m, 角度=${level.angle}°`);
}, { passive: false });

// ================== 6. 瓦片管理系统 ==================
const tileManager = {
    loadedTiles: new Map(),
    currentGrid: { x: null, y: null },
    
    getCameraGrid() {
        const target = controls.target;
        return {
            x: Math.floor(target.x / CONFIG.TILE_SIZE),
            y: Math.floor(target.z / CONFIG.TILE_SIZE)
        };
    },
    
    getKey(x, y) {
        return `${x}_${y}`;
    },
    
    getColorByType(code) {
        const colors = {
            0: 0x888888,
            1: 0x4a90d9,
            2: 0xf5a623,
            3: 0x7ed321,
            4: 0xbd10e0,
            5: 0x50e3c2,
        };
        return colors[code] || 0xcccccc;
    },
    
    async loadTile(x, y) {
        const key = this.getKey(x, y);
        if (this.loadedTiles.has(key)) return;
        
        this.loadedTiles.set(key, { group: null, status: 'loading' });
        
        const url = `${CONFIG.BASE_URL}/tile_${x}_${y}.json`;
        console.log(`正在加载: ${url}`);
        
        try {
            const response = await fetch(url);
            console.log(`请求 ${url} 状态: ${response.status}`);
            if (!response.ok) throw new Error('Not found');
            
            const geojson = await response.json();
            console.log(`瓦片 [${key}] 数据:`, geojson.features?.length, '个建筑');
            
            const current = this.loadedTiles.get(key);
            if (!current || current.status === 'unloading') {
                this.loadedTiles.delete(key);
                return;
            }
            
            const tileGroup = new THREE.Group();
            tileGroup.name = `tile_${key}`;
            
            let buildingCount = 0;
            const buildingsToAnimate = [];
            
            if (geojson.features && geojson.features.length > 0) {
                geojson.features.forEach((feature, index) => {
                    try {
                        const meshData = this.createBuildingMesh(feature);
                        if (meshData) {
                            const { mesh, targetHeight } = meshData;
                            // 初始时建筑高度为0
                            mesh.scale.y = 0.01;
                            mesh.userData.targetHeight = targetHeight;
                            mesh.userData.animationDelay = index * 20; // 错开动画
                            mesh.userData.animationStart = Date.now();
                            tileGroup.add(mesh);
                            buildingsToAnimate.push(mesh);
                            buildingCount++;
                        }
                    } catch (e) {
                        console.error('创建建筑失败:', e);
                    }
                });
            }

            // --- 加载路网数据 ---
            const roadUrl = `${CONFIG.ROADNET_URL}/road_tile_${x}_${y}.json`;
            try {
                const roadResponse = await fetch(roadUrl);
                if (roadResponse.ok) {
                    const roadGeojson = await roadResponse.json();
                    if (roadGeojson.features && roadGeojson.features.length > 0) {
                        roadGeojson.features.forEach((feature) => {
                            try {
                                const roadMesh = this.createRoadMesh(feature);
                                if (roadMesh) {
                                    // 给道路也添加淡入动画相关属性，使加载更平滑
                                    roadMesh.userData.isRoad = true;
                                    roadMesh.userData.animationStart = Date.now();
                                    
                                    // 处理 MultiPolygon 包含多个 Mesh 的情况
                                    if (roadMesh.type === 'Group') {
                                        roadMesh.children.forEach(child => {
                                            child.material.transparent = true;
                                            child.material.opacity = 0;
                                        });
                                    } else {
                                        roadMesh.material.transparent = true;
                                        roadMesh.material.opacity = 0;
                                    }
                                    
                                    tileGroup.add(roadMesh);
                                    buildingsToAnimate.push(roadMesh); // 复用 buildingsToAnimate 数组来进行动画
                                }
                            } catch (e) {
                                console.error('创建道路失败:', e);
                            }
                        });
                    }
                }
            } catch (e) {
                console.log(`未找到路网数据: ${roadUrl}`);
            }
            // --- 路网数据加载完毕 ---
            
            scene.add(tileGroup);
            this.loadedTiles.set(key, { 
                group: tileGroup, 
                status: 'loaded',
                buildings: buildingsToAnimate,
                animating: true
            });
            
            console.log(`✓ 瓦片 [${key}] 加载完成，成功创建 ${buildingCount} 个建筑`);
            
        } catch (error) {
            console.log(`瓦片 [${key}] 不存在或加载失败:`, error.message);
            this.loadedTiles.set(key, { group: null, status: 'empty' });
        }
    },
    
    createBuildingMesh(feature) {
        const props = feature.properties;
        const height = props.Height || 10;
        const colorCode = props.dominant_c || 0;
        const coords = feature.geometry.coordinates[0];
        
        if (!coords || coords.length < 3) return null;
        
        const shape = new THREE.Shape();
        coords.forEach((pt, i) => {
            const x = pt[0];
            const y = -pt[1]; 
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        });
        
        // 使用单位高度1，通过scale.y控制实际高度
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 1,
            bevelEnabled: false
        });
        
        geometry.rotateX(-Math.PI / 2);
        
        const material = new THREE.MeshLambertMaterial({
            color: this.getColorByType(colorCode),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        return { mesh, targetHeight: height };
    },

    createRoadMesh(feature) {
        if (!feature.geometry || feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon') return null;
        
        const material = new THREE.MeshLambertMaterial({
            color: 0x666666,
            polygonOffset: true,       // 将道路往前推，避免与地面 Z-Fighting
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1
        });

        const meshes = new THREE.Group();

        const createPolygonMesh = (coords) => {
            if (!coords || coords.length === 0) return null;
            const outerRing = coords[0];
            if (!outerRing || outerRing.length < 3) return null;

            const shape = new THREE.Shape();
            outerRing.forEach((pt, i) => {
                const x = pt[0];
                const y = -pt[1]; // y 轴翻转，和建筑一致
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            });

            // 如果有内环（孔洞）
            if (coords.length > 1) {
                for (let i = 1; i < coords.length; i++) {
                    const holeRing = coords[i];
                    const holePath = new THREE.Path();
                    holeRing.forEach((pt, j) => {
                        const x = pt[0];
                        const y = -pt[1];
                        if (j === 0) holePath.moveTo(x, y);
                        else holePath.lineTo(x, y);
                    });
                    shape.holes.push(holePath);
                }
            }

            const geometry = new THREE.ShapeGeometry(shape);
            geometry.rotateX(-Math.PI / 2);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.y = 0.1;
            mesh.renderOrder = 1; // 道路在地面之后渲染，确保层级正确
            return mesh;
        };

        if (feature.geometry.type === 'Polygon') {
            const mesh = createPolygonMesh(feature.geometry.coordinates);
            if (mesh) return mesh;
        } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach(polygonCoords => {
                const mesh = createPolygonMesh(polygonCoords);
                if (mesh) meshes.add(mesh);
            });
            // 只有当 Group 里面有子 meshes 时才返回，否则返回 null
            if (meshes.children.length > 0) {
                return meshes;
            }
        }

        return null;
    },

    // 更新建筑生长和道路淡入动画
    updateBuildingAnimations() {
        const now = Date.now();
        const animationDuration = 800; // 动画持续时间(ms)
        const roadFadeDuration = 1000; // 道路淡入时间稍长一点
        
        for (const [key, tile] of this.loadedTiles.entries()) {
            if (!tile.animating || !tile.buildings) continue;
            
            let allComplete = true;
            
            for (const mesh of tile.buildings) {
                if (mesh.userData.isRoad) {
                    // 道路淡入逻辑
                    const elapsed = now - mesh.userData.animationStart;
                    if (elapsed < 0) {
                        allComplete = false;
                        continue;
                    }
                    const progress = Math.min(elapsed / roadFadeDuration, 1);
                    
                    const updateOpacity = (m) => {
                        m.material.opacity = progress;
                        if (progress >= 1) {
                            m.material.transparent = false;
                            m.material.needsUpdate = true;
                        }
                    };
                    
                    if (mesh.type === 'Group') {
                        mesh.children.forEach(updateOpacity);
                    } else {
                        updateOpacity(mesh);
                    }
                    
                    if (progress < 1) allComplete = false;
                    
                } else {
                    // 建筑生长逻辑
                    const elapsed = now - mesh.userData.animationStart - mesh.userData.animationDelay;
                    
                    if (elapsed < 0) {
                        allComplete = false;
                        continue;
                    }
                    
                    const progress = Math.min(elapsed / animationDuration, 1);
                    // 使用缓动函数使动画更自然 (easeOutBack)
                    const eased = 1 - Math.pow(1 - progress, 3) + (progress < 1 ? Math.sin(progress * Math.PI) * 0.1 : 0);
                    
                    mesh.scale.y = Math.max(0.01, eased * mesh.userData.targetHeight);
                    
                    // 同步更新透明度，实现渐显效果
                    mesh.material.opacity = progress;
                    if (progress >= 1) {
                        mesh.material.transparent = false; // 动画结束后关闭透明混合，优化性能和显示
                        mesh.material.needsUpdate = true;
                    }

                    if (progress < 1) allComplete = false;
                }
            }
            
            if (allComplete) {
                tile.animating = false;
            }
        }
    },
    
    unloadTile(key) {
        const tile = this.loadedTiles.get(key);
        if (!tile) return;
        
        // 标记为正在卸载以防止其他地方再次操作
        tile.status = 'unloading';
        
        // 我们不直接删除，而是做一个淡出的动画缓冲
        const fadeOutDuration = 500; // 淡出持续500ms
        const startTime = Date.now();
        
        const fadeOut = () => {
            if (!tile.group) return;
            
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / fadeOutDuration, 1);
            
            tile.group.traverse((child) => {
                if (child.isMesh && child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => {
                            m.transparent = true;
                            m.opacity = 1 - progress;
                        });
                    } else {
                        child.material.transparent = true;
                        child.material.opacity = 1 - progress;
                    }
                }
            });
            
            if (progress < 1) {
                requestAnimationFrame(fadeOut);
            } else {
                // 淡出完成，正式从场景中移除并清理内存
                scene.remove(tile.group);
                tile.group.traverse((child) => {
                    if (child.isMesh) {
                        child.geometry?.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
                console.log(`✗ 瓦片 [${key}] 已卸载`);
                this.loadedTiles.delete(key);
            }
        };
        
        // 如果瓦片还没有加载完成组，直接删除
        if (!tile.group) {
             this.loadedTiles.delete(key);
             return;
        }
        
        // 开始淡出动画
        requestAnimationFrame(fadeOut);
    },
    
    update() {
        const grid = this.getCameraGrid();
        
        if (grid.x === this.currentGrid.x && grid.y === this.currentGrid.y) return;
        
        console.log(`相机位置: 网格 (${grid.x}, ${grid.y})`);
        this.currentGrid = { ...grid };
        
        const neededTiles = new Set();
        for (let dx = -CONFIG.VISIBLE_RADIUS; dx <= CONFIG.VISIBLE_RADIUS; dx++) {
            for (let dy = -CONFIG.VISIBLE_RADIUS; dy <= CONFIG.VISIBLE_RADIUS; dy++) {
                neededTiles.add(this.getKey(grid.x + dx, grid.y + dy));
            }
        }
        
        for (const [key, tile] of this.loadedTiles.entries()) {
            if (!neededTiles.has(key)) {
                const [tx, ty] = key.split('_').map(Number);
                const distance = Math.max(Math.abs(tx - grid.x), Math.abs(ty - grid.y));
                if (distance > CONFIG.UNLOAD_RADIUS) {
                    this.unloadTile(key);
                }
            }
        }
        
        for (const key of neededTiles) {
            if (!this.loadedTiles.has(key)) {
                const [x, y] = key.split('_').map(Number);
                this.loadTile(x, y);
            }
        }
    }
};

// ================== 6.5 地理底图瓦片管理系统 ==================
const mapTextureLoader = new THREE.TextureLoader();
mapTextureLoader.setCrossOrigin('anonymous'); // 必须带有跨域设置以请求外部底图

const mapManager = {
    loadedTiles: new Map(),
    group: new THREE.Group(),
    currentGrid: { x: null, y: null },
    
    // 广州地图中心偏移 (EPSG:3857)
    config: {
        zoom: 16,
        S: 20037508.3427892,
        centerX: 12642519.156561358,
        centerY: 2529206.4716063375,
        radius: 4, // 瓦片加载半径
        unloadRadius: 6 // 瓦片卸载半径
    },
    
    mercatorToTile(mercX, mercY, zoom) {
        const originX = -this.config.S;
        const originY = this.config.S;
        const S_S_2 = this.config.S * 2;
        
        const pixel_x = ((mercX - originX) / S_S_2) * Math.pow(2, zoom);
        const pixel_y = ((originY - mercY) / S_S_2) * Math.pow(2, zoom);
        
        return {
            x: Math.floor(pixel_x),
            y: Math.floor(pixel_y)
        };
    },

    tileToMercator(tx, ty, zoom) {
        const originX = -this.config.S;
        const originY = this.config.S;
        const S_S_2 = this.config.S * 2;
        const tileSize = S_S_2 / Math.pow(2, zoom);
        
        const minX = originX + tx * tileSize;
        const maxY = originY - ty * tileSize;
        const maxX = originX + (tx + 1) * tileSize;
        const minY = originY - (ty + 1) * tileSize;
        
        return { minX, minY, maxX, maxY };
    },

    update(target) {
        // 计算目标点对应的EPSG:3857坐标
        const mercX = target.x + this.config.centerX;
        const mercY = target.z + this.config.centerY;  // 修正对齐Bug: 正确对应的Z轴变化
        
        const centerTile = this.mercatorToTile(mercX, mercY, this.config.zoom);
        
        if (this.currentGrid.x === centerTile.x && this.currentGrid.y === centerTile.y) return;
        this.currentGrid = { ...centerTile };
        
        const neededTiles = new Set();
        for (let dx = -this.config.radius; dx <= this.config.radius; dx++) {
            for (let dy = -this.config.radius; dy <= this.config.radius; dy++) {
                const tx = centerTile.x + dx;
                const ty = centerTile.y + dy;
                neededTiles.add(`${this.config.zoom}_${tx}_${ty}`);
            }
        }
        
        // 卸载离开范围的瓦片
        for (const [key, meshObj] of this.loadedTiles.entries()) {
            if (!neededTiles.has(key)) {
                const parts = key.split('_');
                const tx = parseInt(parts[1]);
                const ty = parseInt(parts[2]);
                const dist = Math.max(Math.abs(tx - centerTile.x), Math.abs(ty - centerTile.y));
                if (dist > this.config.unloadRadius) {
                    if (meshObj && meshObj.mesh) {
                        this.group.remove(meshObj.mesh);
                        meshObj.mesh.geometry.dispose();
                        meshObj.mesh.material.map?.dispose();
                        meshObj.mesh.material.dispose();
                    }
                    this.loadedTiles.delete(key);
                }
            }
        }
        
        // 加载新瓦片
        for (let dx = -this.config.radius; dx <= this.config.radius; dx++) {
            for (let dy = -this.config.radius; dy <= this.config.radius; dy++) {
                const tx = centerTile.x + dx;
                const ty = centerTile.y + dy;
                const key = `${this.config.zoom}_${tx}_${ty}`;
                if (!this.loadedTiles.has(key)) {
                    this.loadTile(tx, ty, this.config.zoom, key);
                }
            }
        }
    },
    
    loadTile(tx, ty, zoom, key) {
        this.loadedTiles.set(key, { mesh: null, status: 'loading' });
        
        // 更换为 ArcGIS 深色数字底图（World Dark Gray Canvas），符合整体大屏深暗色风格
        const url = `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/${zoom}/${ty}/${tx}`;
        // (备用) ArcGIS 卫星影像底图: const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        
        mapTextureLoader.load(
            url,
            (texture) => {
                const tileObj = this.loadedTiles.get(key);
                if (!tileObj) {
                    texture.dispose();
                    return; // 已经被卸载清除
                }
                
                texture.colorSpace = THREE.SRGBColorSpace;
                // 去除贴图上的接缝
                texture.minFilter = THREE.LinearFilter;
                // 修正对齐Bug: 修复WebGL默认Y轴翻转带来的南北底图颠倒问题
                texture.flipY = false; 
                
                const bounds = this.tileToMercator(tx, ty, zoom);
                
                // 修正对齐Bug: 将墨卡托投影坐标重新转化为局部的ThreeJS系统坐标，Z轴不能颠倒
                const localMinX = bounds.minX - this.config.centerX;
                const localMaxX = bounds.maxX - this.config.centerX;
                const localMinZ = bounds.minY - this.config.centerY; 
                const localMaxZ = bounds.maxY - this.config.centerY;
                
                const width = localMaxX - localMinX;
                const height = localMaxZ - localMinZ;
                
                const geometry = new THREE.PlaneGeometry(width, height);
                geometry.rotateX(-Math.PI / 2);
                
                // MeshLambertMaterial 可以响应光照
                const material = new THREE.MeshLambertMaterial({
                    map: texture,
                    polygonOffset: true,
                    polygonOffsetFactor: 1, // 控制处于更下面的灰底(2)和更上面的道路(-1)之间
                    polygonOffsetUnits: 1
                });
                
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(localMinX + width / 2, -0.4, localMinZ + height / 2);
                mesh.renderOrder = 0; 
                
                this.group.add(mesh);
                tileObj.mesh = mesh;
                tileObj.status = 'loaded';
            },
            undefined,
            () => {
                // 加载失败时移除标记
                this.loadedTiles.delete(key);
            }
        );
    }
};

scene.add(mapManager.group);

// ================== 7. UI 信息显示 ==================
const infoDiv = document.createElement('div');
infoDiv.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    background: rgba(0,0,0,0.7);
    color: #fff;
    padding: 10px 15px;
    font-family: monospace;
    font-size: 12px;
    border-radius: 5px;
    z-index: 1000;
`;
document.body.appendChild(infoDiv);

function updateInfo() {
    const grid = tileManager.getCameraGrid();
    const loadedCount = Array.from(tileManager.loadedTiles.values())
        .filter(t => t.status === 'loaded').length;
    const level = viewLevels[viewConfig.currentLevel];
    
    infoDiv.innerHTML = `
        🏙️ 城市漫游系统<br>
        ────────────────<br>
        视角档位: ${viewConfig.currentLevel + 1}/6<br>
        高度: ${Math.round(viewConfig.currentHeight)}m<br>
        俯仰角: ${Math.round(viewConfig.currentPolarAngle * 180 / Math.PI)}°<br>
        ────────────────<br>
        网格坐标: (${grid.x}, ${grid.y})<br>
        已加载瓦片: ${loadedCount}<br>
        ────────────────<br>
        左键拖动: 平移<br>
        右键拖动: 旋转<br>
        滚轮: 切换视角
    `;
}

// ================== 8. 动画循环 ==================
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    updateCameraView();  // 平滑相机过渡
    tileManager.update();
    mapManager.update(controls.target); // 地理底图更新
    tileManager.updateBuildingAnimations();  // 建筑生长动画
    updateInfo();
    
    renderer.render(scene, camera);
}

// ================== 9. 窗口自适应 ==================
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ================== 10. 启动 ==================
console.log('🏙️ 城市漫游系统启动...');
console.log('瓦片大小:', CONFIG.TILE_SIZE);
console.log('可见半径:', CONFIG.VISIBLE_RADIUS);

// 强制初始加载 - 设置当前网格为不可能的值以触发首次加载
tileManager.currentGrid = { x: 99999, y: 99999 };
const initialGrid = tileManager.getCameraGrid();
console.log('初始相机网格:', initialGrid);

// 立即手动加载初始瓦片
console.log('开始加载初始瓦片...');
for (let dx = -CONFIG.VISIBLE_RADIUS; dx <= CONFIG.VISIBLE_RADIUS; dx++) {
    for (let dy = -CONFIG.VISIBLE_RADIUS; dy <= CONFIG.VISIBLE_RADIUS; dy++) {
        const tileX = initialGrid.x + dx;
        const tileY = initialGrid.y + dy;
        console.log(`准备加载瓦片: (${tileX}, ${tileY})`);
        tileManager.loadTile(tileX, tileY);
    }
}

mapManager.update(controls.target); // 初始化地理底图中心加载

animate();