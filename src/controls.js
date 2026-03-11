import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { camera, renderer } from './scene.js';
import { viewConfig, viewLevels } from './viewConfig.js';
import { enterMacroMode, exitMacroMode } from './macroMode.js';

export const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.enableZoom = false; 
controls.maxPolarAngle = Math.PI / 2.2;

const INITIAL_VIEW_TARGET = { x: 250, y: 0, z: -10750 };
controls.target.set(INITIAL_VIEW_TARGET.x, INITIAL_VIEW_TARGET.y, INITIAL_VIEW_TARGET.z);
controls.update();

// 平滑更新相机位置和角度
export function updateCameraView() {
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
    
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction); 
    direction.y = 0; 
    
    if (direction.length() < 0.01) {
        direction.set(0, 0, -1); 
    }
    direction.normalize();
    
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
    
    if (viewConfig.isMacro) {
        if (event.deltaY < 0) { // 向前滚动 (Zoom In)
           exitMacroMode();
        }
        return;
    }

    if (event.deltaY < 0) {
        if (viewConfig.currentLevel < viewLevels.length - 1) {
            viewConfig.currentLevel++;
        }
    } else {
        if (viewConfig.currentLevel > 0) {
            viewConfig.currentLevel--;
        } else {
            enterMacroMode();
            return;
        }
    }
    
    const level = viewLevels[viewConfig.currentLevel];
    viewConfig.targetHeight = level.height;
    viewConfig.targetAngle = level.angle * Math.PI / 180;
    
    console.log(`切换到档位 ${viewConfig.currentLevel}: 高度=${level.height}m, 角度=${level.angle}°`);
}, { passive: false });
