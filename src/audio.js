import * as THREE from 'three';
import { camera } from './scene.js';

const listener = new THREE.AudioListener();
camera.add(listener);

const backgroundSound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();
audioLoader.load('/universfield-cosmic-exploration-387717.mp3', function(buffer) {
    backgroundSound.setBuffer(buffer);
    backgroundSound.setLoop(true); 
    backgroundSound.setVolume(0.1); 
});

export function startBackgroundMusic() {
    if (listener.context.state === 'suspended') {
        listener.context.resume().then(() => {
            if (backgroundSound.buffer && !backgroundSound.isPlaying) {
                backgroundSound.play();
                console.log('背景音乐开始播放（开场动画）');
            }
        });
    } else if (listener.context.state === 'running') {
        if (backgroundSound.buffer && !backgroundSound.isPlaying) {
            backgroundSound.play();
            console.log('背景音乐开始播放（开场动画）');
        }
    }
}
