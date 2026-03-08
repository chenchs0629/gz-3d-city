import gsap from 'gsap';

/**
 * 播放开场动画
 * @param {THREE.Camera} camera
 * @param {MapControls} controls
 * @param {Object} finalPosition - {x,y,z} 动画结束时相机落点
 * @param {Object} finalTarget   - {x,y,z} controls.target 目标点
 * @param {Function} onComplete  - 动画全部结束后的回调
 * @param {Function} onTransition - 在全屏变黑的瞬间调用，用于切换宏/微场景（无参数）
 * @param {Function} onTextStart - 在标题开始浮现时调用（无参数）
 * @param {Function} onEnter     - 用户点击"进入系统"后立即调用，用于启动背景音乐等
 */
export function playIntro(camera, controls, finalPosition, finalTarget, onComplete, onTransition, onTextStart, onEnter) {
    // ================= 1. 创建 UI 元素 =================
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background-color: #050510; z-index: 9999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        pointer-events: auto; cursor: pointer;
    `;

    // "点击进入"提示
    const enterHint = document.createElement('div');
    enterHint.innerHTML = 'Click to Enter';
    enterHint.style.cssText = `
        color: rgba(255,255,255,0.7); font-size: 1.6rem; letter-spacing: 0.6em;
        font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
        position: absolute; bottom: 18%; 
        animation: breathe 2s ease-in-out infinite;
    `;
    // 添加呼吸动画样式
    const style = document.createElement('style');
    style.textContent = `
        @keyframes breathe {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }
    `;
    document.head.appendChild(style);

    const title = document.createElement('div');
    title.innerHTML = '「 GBA-UBF 」';
    title.style.cssText = `
        color: #ffffff; font-size: 5rem; letter-spacing: 0.5em;
        font-family: "Noto Serif SC", "SimSun", serif;
        opacity: 0; transform: translateY(20px);
        text-shadow: 0 0 20px rgba(255,255,255,0.3);
    `;

    const subtitle = document.createElement('div');
    subtitle.innerHTML = 'Exploring the Invisible Structure of Urban Building Functions.';
    subtitle.style.cssText = `
        color: #aaaaaa; font-size: 3rem; letter-spacing: 0.2em; margin-top: 20px;
        font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
        opacity: 0; transform: translateY(20px);
    `;

    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    overlay.appendChild(enterHint);
    document.body.appendChild(overlay);

    // ================= 2. 初始相机位置与漫游轨迹设定 =================
    controls.enabled = false;
    
    // 起点：在目标地点的南偏西方向远处 (Z更大代表更靠南，X更小代表更靠西)
    // 根据宏观底图的庞大尺度，后退数千个坐标单位以拉出壮观的航场巡游感
    const startCam = { x: finalTarget.x - 15000, y: 8000, z: finalTarget.z + 16000 };
    // 漫游初期的视觉焦点（目光先滑过边缘过渡区，不直接死盯最终处）
    const startTarget = { x: finalTarget.x - 16000, y: 0, z: finalTarget.z + 16000 };
    
    // 下潜俯冲预备点：最终微观落点的高空正上方
    const divePrepCam = { x: finalPosition.x, y: 8000, z: finalPosition.z + 2000 };

    camera.position.set(startCam.x, startCam.y, startCam.z);
    controls.target.set(startTarget.x, startTarget.y, startTarget.z);
    camera.lookAt(controls.target);

    // ================= 2.5 等待用户点击进入 =================
    const startAnimation = () => {
        // 隐藏进入提示，禁用点击
        enterHint.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        overlay.style.cursor = 'default';

        // 触发 onEnter 回调（启动背景音乐等）
        if (onEnter) onEnter();

        // 启动动画时间轴
        buildTimeline();
    };

    overlay.addEventListener('click', startAnimation, { once: true });

    // ================= 3. GSAP 电影级漫游时间轴 =================
    function buildTimeline() {
    const tl = gsap.timeline({
        onUpdate: () => {
                camera.lookAt(controls.target);
            },
        onComplete: () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            controls.enabled = true;
            // 归位最纯粹的控制目标准星
            controls.target.set(finalTarget.x, finalTarget.y, finalTarget.z);
            controls.update();
            if (onComplete) onComplete();
        }
    });

    // --- 核心轨迹 1: 高度维持在8000m，进行底图区域的巡航游览 (持续9.5s) ---
    // 为确保顺滑并且掩盖开场的纯黑背景，位移直接0秒起跑
    tl.to(camera.position, {
        x: divePrepCam.x,
        y: divePrepCam.y,
        z: divePrepCam.z,
        duration: 9.5,
        ease: 'power1.inOut',
        //onUpdate: () => camera.lookAt(controls.target) // 时刻跟随控制器准星
    }, 0);

    // 控制器准星同步花9.5s从城市边缘推移到真正的目的地核心
    tl.to(controls.target, {
        x: finalTarget.x,
        y: finalTarget.y,
        z: finalTarget.z,
        duration: 9.5,
        ease: 'power1.inOut'
    }, 0);

    // --- 附属 UI 与遮罩层动画 (与游览轨迹完美合并) ---
    // 1. 黑屏下文字出场 (0.5s ~ 3.5s)
    tl.call(() => {
        if (onTextStart) onTextStart();
    }, [], 0.5);

    tl.to(title,    { opacity: 1, y: 0, duration: 2, ease: 'power2.out' }, 0.5)
      .to(subtitle, { opacity: 1, y: 0, duration: 2, ease: 'power2.out' }, 1.5);

    // 2. 遮罩层缓缓变透明，底部的巡航点云光辉逐渐显露 (3.5s ~ 6.5s)
    tl.to(overlay, { backgroundColor: 'rgba(5,5,16,0)', duration: 3, ease: 'power1.inOut' }, 3.5);

    // 3. 诗意文案消退 (5.0s ~ 6.5s)
    tl.to([title, subtitle], { opacity: 0, y: -20, duration: 1.5, ease: 'power2.in' }, 5.0);

    // [经过褪色和文字消散，接下来的 6.5s到9.5s 是纯净的“漫游赏景”时间，摄像机稳稳停在目标高空]

    // --- 核心轨迹 2: 到达指定海域/地块上空，zoom进入微观 (9.5s开始，极速俯冲) ---
    tl.to(camera.position, {
        x: finalPosition.x,
        y: finalPosition.y,
        z: finalPosition.z,
        duration: 3.5,
        ease: 'power3.in', // 指数级提速坠落
        onUpdate: () => camera.lookAt(controls.target), 
        onComplete: () => {
            // 切黑到底瞬间，触发宏微观环境、网格切换
            if (onTransition) onTransition();
        }
    }, 9.5);

    // 俯冲过程中遮罩重新转黑（慢于俯冲1秒启动，也就是在10.5s发力，最后平滑过度）
    tl.to(overlay, { backgroundColor: 'rgba(5,5,16,1)', duration: 2.5, ease: 'power2.in' }, 10.5);

    // --- 终局微观揭幕 (13.2s) ---
    tl.to(overlay, { backgroundColor: 'rgba(5,5,16,0)', duration: 2.0, ease: 'power1.out' }, 13.2);

    } // end buildTimeline
}