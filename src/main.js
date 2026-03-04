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
camera.position.set(250, 2500, -10750);
camera.lookAt(250, 0, -10750);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });
renderer.setClearColor(0x87ceeb, 1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true; // 开启阴影
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // 使用柔和阴影
document.body.appendChild(renderer.domElement);

// ================== 3. 灯光设置 ==================
// 使用半球光代替环境光，模拟天空对地面的散射，使阴影部分呈现自然的冷色调
const hemisphereLight = new THREE.HemisphereLight(0xddeeff, 0x333333, 0.5);
hemisphereLight.position.set(0, 500, 0);
scene.add(hemisphereLight);

// 主光源 - 模拟太阳
// 暖色调太阳光 (0xffefe0)，位置调整为侧射光以拉长阴影，增强立体感
const dirLight = new THREE.DirectionalLight(0xffefe0, 1.8);

// 设置光源目标点为初始视图中心，确保阴影覆盖初始区域
const targetObject = new THREE.Object3D();
targetObject.position.set(250, 0, -10750);
scene.add(targetObject);
dirLight.target = targetObject;

// 光源位置相对于目标点 (从西南方向照射)
dirLight.position.set(250 - 1500, 2000, -10750 + 1500); 
dirLight.castShadow = true;

// 配置阴影参数 - 扩大阴影范围以覆盖更多城市区域
dirLight.shadow.mapSize.width = 4096;  // 提高分辨率
dirLight.shadow.mapSize.height = 4096;
const d = 4000; // 扩大阴影相机范围
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.camera.near = 100;
dirLight.shadow.camera.far = 10000;
dirLight.shadow.bias = -0.0005; // 稍微增加偏移量以消除摩尔纹
dirLight.shadow.normalBias = 0.05; // 新增：利用法线偏移有效解决自阴影三角形伪影(Shadow Acne)
dirLight.shadow.radius = 2; // 增加软阴影半径

scene.add(dirLight);

// 移除补光，让阴影更纯粹
// const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3); ...

// 全览模式的聚光灯（实现圆形高亮）
const spotLight = new THREE.SpotLight(0xffffff, 0); // 初始强度为0
spotLight.angle = Math.PI / 10; // 减小张角以减少显示的瓦片数量
spotLight.penumbra = 0.3;
spotLight.decay = 0; // 无衰减，保证均匀
spotLight.distance = 10000; // 减小照射距离
spotLight.castShadow = false;
spotLight.position.set(0, 8000, 0);
scene.add(spotLight);
scene.add(spotLight.target);

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
plane.receiveShadow = true; // 接收阴影
scene.add(plane);

// ================== 5. 控制器 ==================
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.enableZoom = false; // 禁用默认缩放，使用自定义逻辑
controls.maxPolarAngle = Math.PI / 2.2;
const INITIAL_VIEW_TARGET = { x: 250, y: 0, z: -10750 };
// 设置初始目标点
//controls.target.set(-250, 0, -10750);
controls.target.set(INITIAL_VIEW_TARGET.x, INITIAL_VIEW_TARGET.y, INITIAL_VIEW_TARGET.z);
controls.update();

// ================== 5.1 自定义滚轮交互 ==================
// 定义6个视角档位：从鸟瞰到街景
const viewLevels = [
    { height: 2500, angle: 80 },  // 档位0: 鸟瞰 (可看约40个瓦片)
    { height: 1800, angle: 68 },  // 档位1: 高空俯视
    { height: 1200, angle: 55 },  // 档位2: 中高空
    { height: 700,  angle: 45 },  // 档位3: 中空
    { height: 400,  angle: 35 },  // 档位4: 低空
    { height: 200,  angle: 25 },  // 档位5: 街景视角 (最低)
    { height: 100,  angle: 18 },  // 档位6: 视角最低
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
    isMacro: false // 新增：是否处于宏观视角
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
    // Initial camera position is (250, 2500, -10750) and target (250, 0, -10750).
    // Forward direction is (0, -1, 0) initially? No.
    // lookAt makes -Z axis of camera point to target.
    // If pos=(x,y,-z), target=(x,0,-z).
    // Eye->Target = (0, -2500, 0).
    // Forward (cam -Z) points global -Y.
    // So camera is looking STRAIGHT DOWN.
    // Right (cam +X) is World +X.
    // Up (cam +Y) is... World -Z (North).
    
    // So when we move camera back by `horizontalDist`:
    // "Back" means along Camera +Z axis (opposite of looking direction).
    // Camera +Z points World +Y (Up).
    // Moving "Back" moves Camera UP.
    // But `horizontalDist` logic here assumes we move in horizontal plane (XZ).
    
    // Let's look at `getWorldDirection`.
    // If looking straight down, direction.x/z are near 0.
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction); // World space forward vector. (0, -1, 0).
    direction.y = 0; // (0,0,0).
    
    // Fallback:
    if (direction.length() < 0.01) {
        // If looking perfectly down, we assume "forward" in horizontal plane is North (-Z).
        direction.set(0, 0, -1); 
    }
    direction.normalize();
    
    // Update Camera Position relative to target
    // We want camera to be `horizontalDist` away from target, in the opposite direction of `direction` (which is Forward/North).
    // So Camera should be South of Target.
    // Target (250, 0, -10750).
    // Moving South means +Z.
    // direction = (0, 0, -1) (North).
    // -direction = (0, 0, 1) (South).
    // pos = target + (South * dist).
    
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
    
    // 宏观视角逻辑
    if (viewConfig.isMacro) {
        if (event.deltaY < 0) { // 向前滚动 (Zoom In)
           exitMacroMode();
        }
        return;
    }

    if (event.deltaY < 0) {
        // 向前滚动：切换到下一档位（更低视角）
        if (viewConfig.currentLevel < viewLevels.length - 1) {
            viewConfig.currentLevel++;
        }
    } else {
        // 向后滚动 (Zoom Out)
        if (viewConfig.currentLevel > 0) {
            viewConfig.currentLevel--;
        } else {
            // 在最高档位继续向后滚动 -> 进入宏观模式
            enterMacroMode();
            return;
        }
    }
    
    // 设置目标值，触发平滑过渡
    const level = viewLevels[viewConfig.currentLevel];
    viewConfig.targetHeight = level.height;
    viewConfig.targetAngle = level.angle * Math.PI / 180;
    
    console.log(`切换到档位 ${viewConfig.currentLevel}: 高度=${level.height}m, 角度=${level.angle}°`);
}, { passive: false });

// 存储环境状态用于恢复
const savedEnv = { fog: null, background: null, ambientIntensity: 0.6, dirIntensity: 0.8 };

function enterMacroMode() {
    if (viewConfig.isMacro) return;
    
    console.log('进入全览宏观视角');
    viewConfig.isMacro = true;
    
    // 保存原有的环境设置
    savedEnv.fog = scene.fog;
    savedEnv.background = scene.background;
    savedEnv.ambientIntensity = hemisphereLight.intensity; // 使用 hemisphereLight
    savedEnv.dirIntensity = dirLight.intensity;
    
    // 移除雾气，设置深邃背景
    scene.fog = null;
    scene.background = new THREE.Color(0x050510); 
    
    // 调暗环境光，开启聚光灯
    hemisphereLight.intensity = 0.1;
    dirLight.intensity = 0.1;
    // fillLight.intensity = 0; // fillLight removed
    if (spotLight) {
        spotLight.intensity = 10.5; // 进一步提高亮度 (原 2.5 -> 15 -> 30)
        spotLight.color.setHex(0xc5e6fc); // 更明显的暖黄色 (原纯白 -> c5e6fc -> ffe0a0)
        // 显著增加照射范围, 覆盖更多区域
        spotLight.angle = Math.PI / 3; 
    }
    
    // 目标高度设为更高 (9000m)
    // 确保视角为90度(或接近)以获得正交俯视感

    ////
    viewConfig.targetHeight = 6500;    
    viewConfig.targetAngle = 90 * Math.PI / 180; 
    
    // 加载并显示点云
    if (typeof macroPointsManager !== 'undefined') {
        macroPointsManager.load().then(() => {
            macroPointsManager.show();
        }).catch(err => console.error(err));
    }
    
    // 不需要扩大底图加载范围，因为全览模式下我们隐藏了底图图片
    // mapManager.config.radius = 8;
    // mapManager.update(controls.target);
}

function exitMacroMode() {
    if (!viewConfig.isMacro) return;
    
    console.log('正在退出全览，进入微观视角...');
    viewConfig.isMacro = false;
    
    // 恢复环境设置
    scene.fog = savedEnv.fog;
    
    // 延迟恢复背景颜色，避免闪烁
    setTimeout(() => {
         if(savedEnv.background) scene.background = savedEnv.background;
         else scene.background = new THREE.Color(0x87ceeb);
    }, 300);

    hemisphereLight.intensity = savedEnv.ambientIntensity;
    dirLight.intensity = savedEnv.dirIntensity;
    // fillLight.intensity = 0.3;  // fillLight removed 
    if (spotLight) {
        spotLight.intensity = 0; // 关闭聚光灯
        spotLight.color.setHex(0xffffff); // 恢复白色
        spotLight.angle = Math.PI / 6; // 恢复角度
    }
    
    // mapManager.config.radius = 4;

    // 隐藏点云，恢复瓦片
    if (typeof macroPointsManager !== 'undefined') {
        macroPointsManager.hide();
    }
    
    // 恢复到 Level 0
    viewConfig.currentLevel = 0;
    const level = viewLevels[0];
    viewConfig.targetHeight = level.height;
    viewConfig.targetAngle = level.angle * Math.PI / 180;
}

// ================== 6. 瓦片管理系统 ==================
const tileManager = {
    loadedTiles: new Map(),
    currentGrid: { x: null, y: null },
    

    getCameraGrid() {
        const target = controls.target;
        return {
            x: Math.floor(target.x / CONFIG.TILE_SIZE),
            // World Z corresponds to -North.
            // Tile Y corresponds to +North.
            // So tileY = -WorldZ / TILE_SIZE.
            // Example:
            // Building North = 13000. Tile Y = 26.
            // World Z = -13000 (Because North is -Z).
            // tileY = -(-13000) / 500 = 26. Correct.
            y: Math.floor(-target.z / CONFIG.TILE_SIZE)
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
            const y = pt[1]; // y 轴不再翻转 (让北向为正Y)
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        });
        
        // 使用单位高度1，通过scale.y控制实际高度
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: 1, // 挤出深度为1，对应Z轴
            bevelEnabled: false
        });
        
        // 修正旋转方向：
        // 1. 我们希望 +Y (北) 变成 -Z (屏幕向里/北)。
        // 2. 我们希望 Extrude方向 (默认+Z) 变成 +Y (屏幕向上/高度)。
        
        // 当前状态：Shape在XY平面。y是北。Extrude沿+Z。
        // Point (x, North, 0) -> Base
        // Point (x, North, 1) -> Top
        
        // 目标状态：
        // Base: (x, 0, -North)
        // Top: (x, 1, -North)
        
        // 让我们看看 rotateX(Math.PI / 2) 做了什么 (90度):
        // (x, y, z) -> (x, -z, y)
        // Base (x, N, 0) -> (x, 0, N) -> this sends North to +Z (South). 错了。
        
        // 让我们看看 rotateX(-Math.PI / 2) 做了什么 (-90度):
        // (x, y, z) -> (x, z, -y)
        // Base (x, N, 0) -> (x, 0, -N) -> this sends North to -Z (North). 正确！
        // Top (x, N, 1) -> (x, 1, -N) -> height is along +Y. 正确！
        
        // 所以，我们需要保持 rotateX(-Math.PI / 2) 
        // 但是之前为什么反了呢？
        // 之前是因为 shape construction 时 y = -pt[1] (South).
        // Base (x, -N, 0) --(-90)--> (x, 0, -(-N)) = (x, 0, N) -> South.
        
        // 结论：
        // 1. y = pt[1] (这是对的，保持 GIS 坐标)
        // 2. rotateX(-Math.PI / 2) (这是对的，把 GIS 的 Y(North) 映射到 3D 的 -Z(North)，把 Extrude 的 Z(Height) 映射到 3D 的 Y(Up))
        
        geometry.rotateX(-Math.PI / 2);
        
        const material = new THREE.MeshLambertMaterial({
            color: this.getColorByType(colorCode),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        // 存储建筑属性供交互使用
        mesh.userData.Height = height;
        mesh.userData.dominant_c = colorCode;
        
        mesh.castShadow = true;
        mesh.receiveShadow = true;
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
                const y = pt[1]; // y 轴不再翻转
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
                        const y = pt[1];
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
            mesh.receiveShadow = true;
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
        // if (viewConfig.isMacro) return;
        
        const grid = this.getCameraGrid();
        
        if (grid.x === this.currentGrid.x && grid.y === this.currentGrid.y) return;
        
        console.log(`相机位置: 网格 (${grid.x}, ${grid.y})`);
        this.currentGrid = { ...grid };
        
        const neededTiles = new Set();
        // 在宏观模式下，增加瓦片加载范围以覆盖聚光灯区域
        const visibleRadius = viewConfig.isMacro ? 3 : CONFIG.VISIBLE_RADIUS;
        const unloadRadius = viewConfig.isMacro ? 4 : CONFIG.UNLOAD_RADIUS;

        for (let dx = -visibleRadius; dx <= visibleRadius; dx++) {
            for (let dy = -visibleRadius; dy <= visibleRadius; dy++) {
                neededTiles.add(this.getKey(grid.x + dx, grid.y + dy));
            }
        }
        
        for (const [key, tile] of this.loadedTiles.entries()) {
            if (!neededTiles.has(key)) {
                const [tx, ty] = key.split('_').map(Number);
                const distance = Math.max(Math.abs(tx - grid.x), Math.abs(ty - grid.y));
                if (distance > unloadRadius) {
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

// ================== 6.2 宏观视角点云管理 ==================
const macroPointsManager = {
    points: null,
    isLoaded: false,
    
    getTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const context = canvas.getContext('2d');
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.2)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    },

    async load() {
        if (this.isLoaded) return;
        try {
            console.log('正在加载宏观点云数据...');
            const response = await fetch('/data/macro_points.json');
            if(!response.ok) throw new Error("无法加载 macro_points.json");
            const data = await response.json();
            
            const positions = [];
            const colors = [];
            const colorObj = new THREE.Color();
            
            // data format: [x, y, c, x, y, c...]
            for (let i = 0; i < data.length; i += 3) {
                const x = data[i];
                const y = data[i+1];
                const c = data[i+2];
                
                // 坐标变换：GIS(x, y) -> 3D(x, 0, -y)
                // 高度设为 10 米，略高于地板
                positions.push(x, 10, -y);
                
                const hex = tileManager.getColorByType(c);
                colorObj.setHex(hex);
                // 稍微提亮一点颜色
                colorObj.multiplyScalar(1.5);
                colors.push(colorObj.r, colorObj.g, colorObj.b);
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            
            const material = new THREE.PointsMaterial({
                size: 40, // 点大小
                vertexColors: true,
                map: this.getTexture(),
                transparent: true,
                opacity: 0.9,
                depthWrite: false, // 禁用深度写入以支持叠加混合
                blending: THREE.AdditiveBlending // 发光叠加效果
            });
            
            this.points = new THREE.Points(geometry, material);
            this.points.visible = false;
            // 确保渲染顺序在半透明物体之后 (though blending handles it usually)
            this.points.renderOrder = 999; 
            scene.add(this.points);
            this.isLoaded = true;
            console.log(`宏观点云加载完成，共 ${data.length / 3} 个点`);
            
        } catch (e) {
            console.error('宏观点云加载失败:', e);
        }
    },
    
    show() {
        if (this.points) this.points.visible = true;
        
        let visibleCount = 0;
        
        // 我们不再隐藏任何建筑或路网
        // 而是依赖 TileManager 让它们保留在场景中
        // 同时依赖 灯光 (SpotLight) 去照亮中间，周围因为 ambientLight=0.1 而变暗
        
        tileManager.loadedTiles.forEach((tile) => {
            if (tile.group) {
                // 确保Group可见
                tile.group.visible = true;
                
                // 确保所有子元素可见 (取消之前的隐藏逻辑)
                tile.group.children.forEach((child) => {
                    child.visible = true;
                    visibleCount++;
                });
            }
        });
        
        console.log(`宏观模式: 激活点云，保持 ${visibleCount} 个建筑/道路网格可见 (即使在阴影中)`);

        // 仅隐藏地图底图(卫星图/街道图)
        mapManager.group.visible = false;
    },
    
    hide() {
        if (this.points) this.points.visible = false;
        
        // 恢复详细瓦片显示 (其实不需要做太多，因为我们show的时候没隐藏)
        tileManager.loadedTiles.forEach((tile) => {
            if (tile.group) {
                tile.group.visible = true;
                tile.group.children.forEach((child) => {
                    child.visible = true;
                });
            }
        });
        
        // 恢复地图底图
        mapManager.group.visible = true;
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
        // Standard Web Mercator Tiling Scheme (Google / OSM / ArcGIS)
        // Origin is Top-Left (-S, S).
        // X increases Right.
        // Y increases Down (in tile coordinates).
        // Y increases Up (in Mercator coordinates).
        
        const S = this.config.S;
        const originX = -S;
        const originY = S;
        const S_S_2 = S * 2;
        const tileSize = S_S_2 / Math.pow(2, zoom);
        
        const minX = originX + tx * tileSize;
        // Tile Y=0 is at Top (Mercator Y=S).
        // Tile Y=1 starts at Mercator Y = S - tileSize.
        // Tile ty starts at Mercator Y = S - ty * tileSize (This is maxY).
        // Tile ty ends at Mercator Y = S - (ty + 1) * tileSize (This is minY).
        
        const maxY = originY - ty * tileSize;
        const minY = originY - (ty + 1) * tileSize;
        const maxX = originX + (tx + 1) * tileSize;
        
        return { minX, minY, maxX, maxY };
    },

    update(target) {
        // 计算目标点对应的EPSG:3857坐标
        const mercX = target.x + this.config.centerX;
        
        // Z axis is inverted: -Z is North (increasing Mercator Y)
        const mercY = -target.z + this.config.centerY;  
        
        const centerTile = this.mercatorToTile(mercX, mercY, this.config.zoom);
        
        // Optimization: Only update if center tile changes significantly? No, always check radius.
        // But we have currentGrid check to avoid re-calculating everything every frame if stationary.
        if (Math.abs(this.currentGrid.x - centerTile.x) < 1 && Math.abs(this.currentGrid.y - centerTile.y) < 1) {
             // We can skip heavy lifting, but let's just use strict equality for now as before
             if (this.currentGrid.x === centerTile.x && this.currentGrid.y === centerTile.y) return;
        }
        this.currentGrid = { ...centerTile };
        
        const neededTiles = new Set();
        // Load radius for map tiles
        const loadRadius = this.config.radius;
        
        for (let dx = -loadRadius; dx <= loadRadius; dx++) {
            for (let dy = -loadRadius; dy <= loadRadius; dy++) {
                const tx = centerTile.x + dx;
                const ty = centerTile.y + dy;
                // For Slippy Map tiles, Y increases South.
                // So (centerTile.y - dy) would mean moving North if dy>0? 
                // Wait, centerTile.y is current pixel Y (Slippy Y).
                // Moving North means decreasing Y.
                // Moving South means increasing Y.
                // Loop dx, dy around current index.
                // ty can be positive or negative? Standard Slippy Map Y is 0 to 2^zoom - 1.
                // If we are at zoom 16.
                // Guangzhou latitude ~23 N.
                // Mercator Y > 0.
                // pixel_y = (originY - mercY) ... -> 0 < pixel_y < Total.
                // So ty should be positive.
                
                neededTiles.add(`${this.config.zoom}_${tx}_${ty}`);
            }
        }
        
        // ... (rest of function)

        
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
                texture.magFilter = THREE.LinearFilter;
                texture.minFilter = THREE.LinearFilter;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                
                // 修正对齐Bug: 修复WebGL默认Y轴翻转带来的南北底图颠倒问题
                // Default is flipY=true. With true:
                // Image Top (North) -> Texture V=1 (Top).
                // Geom Top (V=1) -> Global North.
                // So North -> North.
                texture.flipY = true;

                const bounds = this.tileToMercator(tx, ty, zoom);
                
                // 修正对齐Bug: 将墨卡托投影坐标重新转化为局部的ThreeJS系统坐标
                
                const localMinX = bounds.minX - this.config.centerX;
                const localMaxX = bounds.maxX - this.config.centerX;
                
                // Z轴不需要反转，但是方向要是对的 (-Z is North)
                // Mercator Y Axis: Up is North.
                // 3D Z Axis: -Z is North.
                // So Z = -Y.
                
                const localMinZ = -(bounds.maxY - this.config.centerY); // Top/North -> smaller Z
                const localMaxZ = -(bounds.minY - this.config.centerY); // Bottom/South -> larger Z
                
                const width = localMaxX - localMinX;
                const height = localMaxZ - localMinZ; // Positive
                
                const geometry = new THREE.PlaneGeometry(width, height);
                // Rotate -90 degrees around X.
                // (x, y, z) -> (x, z, -y)
                // Default Plane: Y is Up locally.
                // We want mapped Y (North) to point to World -Z.
                // So (x, N, 0) -> (x, 0, -N).
                
                geometry.rotateX(-Math.PI / 2);
                
                // MeshLambertMaterial 可以响应光照
                const material = new THREE.MeshLambertMaterial({
                    map: texture,
                    polygonOffset: true,
                    polygonOffsetFactor: 1, // 控制处于更下面的灰底(2)和更上面的道路(-1)之间
                    polygonOffsetUnits: 1,
                    side: THREE.FrontSide
                });
                
                // Position should be center
                const centerX = localMinX + width / 2;
                const centerZ = localMinZ + height / 2;

                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(centerX, -0.4, centerZ);
                mesh.renderOrder = 0; 
                mesh.receiveShadow = true;
                
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

// ================== 7.5 交互 Tooltip ==================
const tooltip = document.createElement('div');
Object.assign(tooltip.style, {
    position: 'absolute',
    background: 'rgba(0, 0, 0, 0.85)',
    color: '#fff',
    padding: '10px',
    borderRadius: '4px',
    fontSize: '12px',
    pointerEvents: 'none',
    display: 'none',
    zIndex: '1001',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
    fontFamily: 'sans-serif'
});
document.body.appendChild(tooltip);

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObject = null;
const originalEmissive = new THREE.Color(0x000000); // 默认无自发光

window.addEventListener('mousemove', (event) => {
    // 归一化鼠标坐标
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    // 射线检测
    const intersects = raycaster.intersectObjects(scene.children, true);

    // 查找第一个包含建筑数据的物体
    const hit = intersects.find(i => i.object.userData && i.object.userData.Height !== undefined);

    if (hit) {
        const object = hit.object;
        const { Height, dominant_c } = object.userData;
        
        // 将类型代码转换为名称
        const categoryNames = {
            1: '商业',
            2: '住宅',
            3: '公共服务',
            4: '科技与工业',
            5: '教育文化'
        };
        const categoryName = categoryNames[dominant_c] || '其他';
        
        // 更新 Tooltip 内容和位置
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY + 15) + 'px';
        tooltip.innerHTML = `
            <div style="font-weight:bold; border-bottom:1px solid #555; margin-bottom:5px; padding-bottom:3px">🏢 建筑详情</div>
            <div>高度: <span style="color:#00ffff">${Height}</span> m</div>
            <div>功能类别: <span style="color:#ffcc00">${categoryName}</span></div>
        `;

        // 处理高亮
        if (hoveredObject !== object) {
            // 恢复上一个物体
            if (hoveredObject) {
                if (hoveredObject.material && hoveredObject.material.emissive) {
                    hoveredObject.material.emissive.set(0x000000);
                }
            }
            
            // 高亮当前物体
            hoveredObject = object;
            if (hoveredObject.material && hoveredObject.material.emissive) {
                hoveredObject.material.emissive.set(0x444444); // 深灰色微光
            }
        }
    } else {
        // 未命中任何建筑，隐藏 Tooltip 并重置高亮
        tooltip.style.display = 'none';
        if (hoveredObject) {
            if (hoveredObject.material && hoveredObject.material.emissive) {
                hoveredObject.material.emissive.set(0x000000);
            }
            hoveredObject = null;
        }
    }
});

function updateInfo() {
    const grid = tileManager.getCameraGrid();
    const loadedCount = Array.from(tileManager.loadedTiles.values())
        .filter(t => t.status === 'loaded').length;
    const level = viewLevels[viewConfig.currentLevel];
    
    infoDiv.innerHTML = `
        🏙️ 城市漫游系统<br>
        ────────────────<br>
        视角档位: ${viewConfig.currentLevel + 1}/7<br>
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
    // 更新聚光灯位置跟随相机
    if (viewConfig.isMacro) {
        spotLight.position.copy(camera.position);
        spotLight.target.position.copy(controls.target);
        spotLight.target.updateMatrixWorld();
    } else {
        // 微观模式下，让太阳光跟随相机目标移动，保证阴影始终覆盖视野中心
        // 保持光源相对于目标的偏移量不变
        const sunOffset = { x: -1500, y: 2000, z: 1500 }; 
        dirLight.position.set(
            controls.target.x + sunOffset.x, 
            controls.target.y + sunOffset.y, 
            controls.target.z + sunOffset.z
        );
        dirLight.target.position.copy(controls.target);
        dirLight.target.updateMatrixWorld();
    }
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