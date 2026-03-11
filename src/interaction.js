import * as THREE from 'three';
import { scene, camera } from './scene.js';

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
const originalEmissive = new THREE.Color(0x000000); 

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    
    const intersects = raycaster.intersectObjects(scene.children, true);

    const hit = intersects.find(i => i.object.userData && i.object.userData.Height !== undefined);

    if (hit) {
        const object = hit.object;
        const { Height, dominant_c } = object.userData;
        
        const categoryNames = {
            1: '商业',
            2: '住宅',
            3: '公共服务',
            4: '科技与工业',
            5: '教育文化'
        };
        const categoryName = categoryNames[dominant_c] || '其他';
        
        tooltip.style.display = 'block';
        tooltip.style.left = (event.clientX + 15) + 'px';
        tooltip.style.top = (event.clientY + 15) + 'px';
        tooltip.innerHTML = `
            <div style="font-weight:bold; border-bottom:1px solid #555; margin-bottom:5px; padding-bottom:3px">🏢 建筑详情</div>
            <div>高度: <span style="color:#00ffff">${Height}</span> m</div>
            <div>功能类别: <span style="color:#ffcc00">${categoryName}</span></div>
        `;

        if (hoveredObject !== object) {
            if (hoveredObject) {
                if (hoveredObject.material && hoveredObject.material.emissive) {
                    hoveredObject.material.emissive.set(0x000000);
                }
            }
            
            hoveredObject = object;
            if (hoveredObject.material && hoveredObject.material.emissive) {
                hoveredObject.material.emissive.set(0x444444); 
            }
        }
    } else {
        tooltip.style.display = 'none';
        if (hoveredObject) {
            if (hoveredObject.material && hoveredObject.material.emissive) {
                hoveredObject.material.emissive.set(0x000000);
            }
            hoveredObject = null;
        }
    }
});
