import * as THREE from 'three';
import { CONFIG } from './config.js';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 50000);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true });

// Lights
export const hemisphereLight = new THREE.HemisphereLight(0xddeeff, 0x333333, 0.5);
export const dirLight = new THREE.DirectionalLight(0xffefe0, 1.8);
export const spotLight = new THREE.SpotLight(0xffffff, 0);

// Textures
export let skyboxTexture = null;
export const savedEnv = { fog: null, background: null, ambientIntensity: 0.6, dirIntensity: 0.8 };

export function setupScene() {
    scene.fog = new THREE.FogExp2(0x87ceeb, CONFIG.FOG_DENSITY);

    // Camera setup
    camera.position.set(250, 2500, -10750);
    camera.lookAt(250, 0, -10750);

    // Renderer setup
    renderer.setClearColor(0x87ceeb, 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Window Resize Handler
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

export function setupLights() {
    // Hemisphere Light
    hemisphereLight.position.set(0, 500, 0);
    scene.add(hemisphereLight);

    // Directional Light
    const targetObject = new THREE.Object3D();
    targetObject.position.set(250, 0, -10750);
    scene.add(targetObject);
    dirLight.target = targetObject;
    
    dirLight.position.set(250 - 1500, 2000, -10750 + 1500); 
    dirLight.castShadow = true;
    
    // Shadow parameters
    dirLight.shadow.mapSize.width = 4096;
    dirLight.shadow.mapSize.height = 4096;
    const d = 4000;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.camera.near = 100;
    dirLight.shadow.camera.far = 10000;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.normalBias = 0.05;
    dirLight.shadow.radius = 2;
    
    scene.add(dirLight);

    // Spotlight (Macro Mode)
    spotLight.angle = Math.PI / 10;
    spotLight.penumbra = 0.3;
    spotLight.decay = 0;
    spotLight.distance = 10000;
    spotLight.castShadow = false;
    spotLight.position.set(0, 8000, 0);
    scene.add(spotLight);
    scene.add(spotLight.target);
}

export function setupEnvironment() {
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load('/skybox/DaySkyHDRI027B_4K_TONEMAPPED.jpg', (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        skyboxTexture = texture;
        console.log('✓ 天空盒加载成功');
    });

    // Ground Plane
    const planeGeometry = new THREE.PlaneGeometry(200000, 200000);
    const planeMaterial = new THREE.MeshLambertMaterial({
        color: 0x222222,
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2
    });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.5;
    plane.renderOrder = 0;
    plane.receiveShadow = true;
    scene.add(plane);
}
