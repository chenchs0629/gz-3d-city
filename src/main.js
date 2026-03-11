import * as THREE from 'three';
import { CONFIG } from './config.js';
import { scene, camera, renderer, setupScene, setupLights, setupEnvironment, dirLight, spotLight, skyboxTexture } from './scene.js';
import { controls, updateCameraView } from './controls.js';
import { viewConfig, viewLevels } from './viewConfig.js';
import { tileManager } from './managers/TileManager.js';
import { mapManager } from './managers/MapManager.js';
import { enterMacroMode, exitMacroMode } from './macroMode.js';
import './interaction.js'; 
import { startBackgroundMusic } from './audio.js';
import { playIntro } from './intro.js';

// 初始化场景
setupScene();
setupLights();
setupEnvironment();

// 动画状态标记
let isIntroPlaying = true;

const finalTargetPos = { x: 250, y: 0, z: -10750 };
const finalCameraPos = { 
    x: finalTargetPos.x, 
    y: 2500, 
    z: finalTargetPos.z + 440 
}; 

// ================== 8. 动画循环 ==================
function animate() {
    requestAnimationFrame(animate);
    
// === 光影联动 ===
    // 独立出光照更新，确保不管是开场动画的宏观飞行还是常规微观操作，光源都能紧随相机
    if (viewConfig.isMacro) {
        spotLight.position.copy(camera.position);
        spotLight.target.position.copy(controls.target);
        spotLight.target.updateMatrixWorld();
    } else if (!isIntroPlaying) {
        // 微观模式下，让太阳光跟随相机目标移动，保证阴影始终覆盖视野中心
        const sunOffset = { x: -1500, y: 2000, z: 1500 };
        dirLight.position.set(
            controls.target.x + sunOffset.x,
            controls.target.y + sunOffset.y,
            controls.target.z + sunOffset.z
        );
        dirLight.target.position.copy(controls.target);
        dirLight.target.updateMatrixWorld();
    }

    // 如果未播放开场动画，使用常规控制器更新视图
    if (!isIntroPlaying) {
        controls.update();
        updateCameraView();  // 平滑相机过渡
    }

    tileManager.update();
    mapManager.update(controls.target); // 地理底图更新
    tileManager.updateBuildingAnimations();  // 建筑生长动画
    
    renderer.render(scene, camera);
}

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
        tileManager.loadTile(tileX, tileY);
    }
}
mapManager.update(controls.target); // 初始化地理底图中心加载


// 进入宏观模式
enterMacroMode();

playIntro(
    camera, 
    controls, 
    finalCameraPos, 
    finalTargetPos, 
    () => {
        // onComplete：遮罩已淡出，交还控制权
        console.log(' 开场动画结束，控制权已交还');
        isIntroPlaying = false;
    },
    () => {
        // onTransition：全屏变黑瞬间调用，切换宏观微观
        console.log(' 切黑瞬间：切换宏观微观');

        // 1. 退出宏观模式（隐藏点云、关聚光灯、恢复雾气等）
        exitMacroMode();

        // 2. 强制将所有建筑/路网材质恢复为完全不透明
        for (const tile of tileManager.loadedTiles.values()) {
            if (tile.group) {
                // Ensure helper function for traversing
                tile.group.traverse(obj => {
                    if (obj.isMesh && obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach(m => {
                            m.transparent = false;
                            m.opacity = 1;
                            m.depthWrite = true;
                            m.needsUpdate = true;
                        });
                    }
                });
            }
        }

        // 3. 在全黑瞬间恢复天空盒
        if (typeof skyboxTexture !== 'undefined' && skyboxTexture) {
            scene.background = skyboxTexture;
        }

        // 4. 同步 viewConfig 到微观 Level 0 状态
        viewConfig.currentHeight = finalCameraPos.y;
        viewConfig.currentPolarAngle = viewLevels[0].angle * Math.PI / 180;
        viewConfig.targetHeight = finalCameraPos.y;
        viewConfig.targetAngle = viewLevels[0].angle * Math.PI / 180;
        viewConfig.transitionSpeed = 0.08;
        // viewConfig.isMacro = false; // Already done in exitMacroMode
    },
    null, // onTextStart
    () => {
        // onEnter：用户点击"进入系统"后立即调用，启动背景音乐
        startBackgroundMusic();
    }
);

animate();
