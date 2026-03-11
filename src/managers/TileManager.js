import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { scene } from '../scene.js';
import { viewConfig } from '../viewConfig.js';
import { controls } from '../controls.js'; // We'll create this later

export const tileManager = {
    loadedTiles: new Map(),
    currentGrid: { x: null, y: null },
    
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
                            mesh.scale.y = 0.01;
                            mesh.userData.targetHeight = targetHeight;
                            mesh.userData.animationDelay = index * 20; 
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
                                    roadMesh.userData.isRoad = true;
                                    roadMesh.userData.animationStart = Date.now();
                                    
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
                                    buildingsToAnimate.push(roadMesh); 
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
            const y = pt[1];
            if (i === 0) shape.moveTo(x, y);
            else shape.lineTo(x, y);
        });
        
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
            polygonOffset: true,
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
                const y = pt[1];
                if (i === 0) shape.moveTo(x, y);
                else shape.lineTo(x, y);
            });

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
            mesh.renderOrder = 1; 
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
            if (meshes.children.length > 0) {
                return meshes;
            }
        }

        return null;
    },

    updateBuildingAnimations() {
        const now = Date.now();
        const animationDuration = 800; // 动画持续时间(ms)
        const roadFadeDuration = 1000; // 道路淡入时间稍长一点
        
        for (const [key, tile] of this.loadedTiles.entries()) {
            if (!tile.animating || !tile.buildings) continue;
            
            let allComplete = true;
            
            for (const mesh of tile.buildings) {
                if (mesh.userData.isRoad) {
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
                    const elapsed = now - mesh.userData.animationStart - mesh.userData.animationDelay;
                    
                    if (elapsed < 0) {
                        allComplete = false;
                        continue;
                    }
                    
                    const progress = Math.min(elapsed / animationDuration, 1);
                    const eased = 1 - Math.pow(1 - progress, 3) + (progress < 1 ? Math.sin(progress * Math.PI) * 0.1 : 0);
                    
                    mesh.scale.y = Math.max(0.01, eased * mesh.userData.targetHeight);
                    
                    mesh.material.opacity = progress;
                    if (progress >= 1) {
                        mesh.material.transparent = false;
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
        
        tile.status = 'unloading';
        
        const fadeOutDuration = 500;
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
        
        if (!tile.group) {
             this.loadedTiles.delete(key);
             return;
        }
        
        requestAnimationFrame(fadeOut);
    },
    
    getCameraGrid() {
        if (!controls) return { x: 0, y: 0 };
        const target = controls.target;
        return {
            x: Math.floor(target.x / CONFIG.TILE_SIZE),
            y: Math.floor(-target.z / CONFIG.TILE_SIZE)
        };
    },

    update() {
        const grid = this.getCameraGrid();
        
        if (grid.x === this.currentGrid.x && grid.y === this.currentGrid.y) return;
        
        console.log(`相机位置: 网格 (${grid.x}, ${grid.y})`);
        this.currentGrid = { ...grid };
        
        const neededTiles = new Set();
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
