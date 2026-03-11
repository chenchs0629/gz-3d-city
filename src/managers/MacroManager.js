import * as THREE from 'three';
import { scene } from '../scene.js';
import { tileManager } from './TileManager.js';
import { mapManager } from './MapManager.js';

export const macroPointsManager = {
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
            
            for (let i = 0; i < data.length; i += 3) {
                const x = data[i];
                const y = data[i+1];
                const c = data[i+2];
                
                positions.push(x, 10, -y);
                
                const hex = tileManager.getColorByType(c);
                colorObj.setHex(hex);
                colorObj.multiplyScalar(1.5);
                colors.push(colorObj.r, colorObj.g, colorObj.b);
            }
            
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
            
            const material = new THREE.PointsMaterial({
                size: 40, 
                vertexColors: true,
                map: this.getTexture(),
                transparent: true,
                opacity: 0.9,
                depthWrite: false, 
                blending: THREE.AdditiveBlending 
            });
            
            this.points = new THREE.Points(geometry, material);
            this.points.visible = false;
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
        
        tileManager.loadedTiles.forEach((tile) => {
            if (tile.group) {
                tile.group.visible = true;
                tile.group.children.forEach((child) => {
                    child.visible = true;
                    visibleCount++;
                });
            }
        });
        
        console.log(`宏观模式: 激活点云，保持 ${visibleCount} 个建筑/道路网格可见`);

        mapManager.group.visible = false;
    },
    
    hide() {
        if (this.points) this.points.visible = false;
        
        tileManager.loadedTiles.forEach((tile) => {
            if (tile.group) {
                tile.group.visible = true;
                tile.group.children.forEach((child) => {
                    child.visible = true;
                });
            }
        });
        
        mapManager.group.visible = true;
    }
};
