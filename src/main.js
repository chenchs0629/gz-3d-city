import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';

// ================== 1. 全局配置 ==================
const CONFIG = {
    TILE_SIZE: 500,        // 必须与 Python 切片脚本一致
    VISIBLE_RADIUS: 3,     // 加载半径：3 表示加载周围 7x7 的瓦片
    UNLOAD_RADIUS: 5,      // 卸载半径：超出这个范围的瓦片会被卸载
    FOG_DENSITY: 0.00015,  // 雾的浓度
    BASE_URL: '/data/tiles' // 瓦片数据的路径
};

// ================== 2. 场景初始化 ==================
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x87ceeb, CONFIG.FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);
// 初始相机位置 - 鸟瞰视角2500m高度
camera.position.set(250, 2500, 10750);
camera.lookAt(250, 0, 10750);

const renderer = new THREE.WebGLRenderer({ antialias: true });
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

// ================== 4. 天空盒 ==================
const textureLoader = new THREE.TextureLoader();
textureLoader.load('/skybox/DaySkyHDRI051B_4K_TONEMAPPED.jpg', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = texture;
    console.log('✓ 天空盒加载成功');
});

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
    { height: 200,  angle: 30 },  // 档位5: 街景视角 (最低)
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
    
    if (event.deltaY > 0) {
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
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        return { mesh, targetHeight: height };
    },
    
    // 更新建筑生长动画
    updateBuildingAnimations() {
        const now = Date.now();
        const animationDuration = 800; // 动画持续时间(ms)
        
        for (const [key, tile] of this.loadedTiles.entries()) {
            if (!tile.animating || !tile.buildings) continue;
            
            let allComplete = true;
            
            for (const mesh of tile.buildings) {
                const elapsed = now - mesh.userData.animationStart - mesh.userData.animationDelay;
                
                if (elapsed < 0) {
                    allComplete = false;
                    continue;
                }
                
                const progress = Math.min(elapsed / animationDuration, 1);
                // 使用缓动函数使动画更自然 (easeOutBack)
                const eased = 1 - Math.pow(1 - progress, 3) + (progress < 1 ? Math.sin(progress * Math.PI) * 0.1 : 0);
                
                mesh.scale.y = Math.max(0.01, eased * mesh.userData.targetHeight);
                
                if (progress < 1) allComplete = false;
            }
            
            if (allComplete) {
                tile.animating = false;
            }
        }
    },
    
    unloadTile(key) {
        const tile = this.loadedTiles.get(key);
        if (!tile) return;
        
        if (tile.group) {
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
        }
        
        this.loadedTiles.delete(key);
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

animate();