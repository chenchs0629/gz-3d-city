import * as THREE from 'three';
import { scene, hemisphereLight, dirLight, spotLight, skyboxTexture } from './scene.js';
import { viewConfig, viewLevels } from './viewConfig.js';
import { macroPointsManager } from './managers/MacroManager.js';

// 存储环境状态用于恢复
const savedEnv = { fog: null, background: null, ambientIntensity: 0.6, dirIntensity: 0.8 };

export function enterMacroMode() {
    if (viewConfig.isMacro) return;
    
    console.log('进入全览宏观视角');
    viewConfig.isMacro = true;
    
    // 保存原有的环境设置
    savedEnv.fog = scene.fog;
    savedEnv.background = scene.background;
    savedEnv.ambientIntensity = hemisphereLight.intensity; 
    savedEnv.dirIntensity = dirLight.intensity;
    
    // 移除雾气，设置深邃背景
    scene.fog = null;
    scene.background = new THREE.Color(0x050510); 
    
    // 调暗环境光，开启聚光灯
    hemisphereLight.intensity = 0.1;
    dirLight.intensity = 0.1;
    
    if (spotLight) {
        spotLight.intensity = 10.5; 
        spotLight.color.setHex(0xc5e6fc); 
        spotLight.angle = Math.PI / 3; 
    }
    
    // 目标高度设为更高
    viewConfig.targetHeight = 6500;    
    viewConfig.targetAngle = 90 * Math.PI / 180; 
    
    // 加载并显示点云
    macroPointsManager.load().then(() => {
        macroPointsManager.show();
    }).catch(err => console.error(err));
}

export function exitMacroMode() {
    if (!viewConfig.isMacro) return;
    
    console.log('正在退出全览，进入微观视角...');
    viewConfig.isMacro = false;
    
    // 恢复环境设置
    scene.fog = savedEnv.fog;
    
    // 延迟恢复背景颜色，避免闪烁
    setTimeout(() => {
        if (typeof skyboxTexture !== 'undefined' && skyboxTexture) {
            scene.background = skyboxTexture;
        } else if (savedEnv.background) {
            scene.background = savedEnv.background;
        } else {
            scene.background = new THREE.Color(0x87ceeb);
        }
    }, 300);

    hemisphereLight.intensity = savedEnv.ambientIntensity;
    dirLight.intensity = savedEnv.dirIntensity;
    
    if (spotLight) {
        spotLight.intensity = 0; 
        spotLight.color.setHex(0xffffff); 
        spotLight.angle = Math.PI / 6; 
    }
    
    // 隐藏点云，恢复瓦片
    macroPointsManager.hide();
    
    // 恢复到 Level 0
    viewConfig.currentLevel = 0;
    const level = viewLevels[0];
    viewConfig.targetHeight = level.height;
    viewConfig.targetAngle = level.angle * Math.PI / 180;
}
