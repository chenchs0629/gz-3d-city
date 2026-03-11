import * as THREE from 'three';
import { scene } from '../scene.js';

const mapTextureLoader = new THREE.TextureLoader();
mapTextureLoader.setCrossOrigin('anonymous');

export const mapManager = {
    loadedTiles: new Map(),
    group: new THREE.Group(),
    currentGrid: { x: null, y: null },
    
    // 广州地图中心偏移 (EPSG:3857)
    config: {
        zoom: 16,
        S: 20037508.3427892,
        centerX: 12642519.156561358,
        centerY: 2529206.4716063375,
        radius: 4, 
        unloadRadius: 6 
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
        const S = this.config.S;
        const originX = -S;
        const originY = S;
        const S_S_2 = S * 2;
        const tileSize = S_S_2 / Math.pow(2, zoom);
        
        const minX = originX + tx * tileSize;
        const maxY = originY - ty * tileSize;
        const minY = originY - (ty + 1) * tileSize;
        const maxX = originX + (tx + 1) * tileSize;
        
        return { minX, minY, maxX, maxY };
    },

    update(target) {
        const mercX = target.x + this.config.centerX;
        const mercY = -target.z + this.config.centerY;  
        
        const centerTile = this.mercatorToTile(mercX, mercY, this.config.zoom);
        
        if (Math.abs(this.currentGrid.x - centerTile.x) < 1 && Math.abs(this.currentGrid.y - centerTile.y) < 1) {
             if (this.currentGrid.x === centerTile.x && this.currentGrid.y === centerTile.y) return;
        }
        this.currentGrid = { ...centerTile };
        
        const neededTiles = new Set();
        const loadRadius = this.config.radius;
        
        for (let dx = -loadRadius; dx <= loadRadius; dx++) {
            for (let dy = -loadRadius; dy <= loadRadius; dy++) {
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
        
        const subdomains = ['a', 'b', 'c', 'd'];
        const s = subdomains[(tx + ty) % 4]; 
        const url = `https://${s}.basemaps.cartocdn.com/dark_all/${zoom}/${tx}/${ty}.png`;
        
        mapTextureLoader.load(
            url,
            (texture) => {
                const tileObj = this.loadedTiles.get(key);
                if (!tileObj) {
                    texture.dispose();
                    return; 
                }
                
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.magFilter = THREE.LinearFilter;
                texture.minFilter = THREE.LinearFilter;
                texture.wrapS = THREE.ClampToEdgeWrapping;
                texture.wrapT = THREE.ClampToEdgeWrapping;
                texture.flipY = true;

                const bounds = this.tileToMercator(tx, ty, zoom);
                
                const localMinX = bounds.minX - this.config.centerX;
                const localMaxX = bounds.maxX - this.config.centerX;
                
                const localMinZ = -(bounds.maxY - this.config.centerY); 
                const localMaxZ = -(bounds.minY - this.config.centerY); 
                
                const width = localMaxX - localMinX;
                const height = localMaxZ - localMinZ; 
                
                const geometry = new THREE.PlaneGeometry(width, height);
                
                geometry.rotateX(-Math.PI / 2);
                
                const material = new THREE.MeshLambertMaterial({
                    map: texture,
                    polygonOffset: true,
                    polygonOffsetFactor: 1, 
                    polygonOffsetUnits: 1,
                    side: THREE.FrontSide
                });
                
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
                this.loadedTiles.delete(key);
            }
        );
    }
};

scene.add(mapManager.group);
