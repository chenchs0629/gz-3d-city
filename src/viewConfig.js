export const viewLevels = [
    { height: 2500, angle: 80 },  // 档位0: 鸟瞰
    { height: 1800, angle: 68 },  // 档位1: 高空俯视
    { height: 1200, angle: 55 },  // 档位2: 中高空
    { height: 700,  angle: 45 },  // 档位3: 中空
    { height: 400,  angle: 35 },  // 档位4: 低空
    { height: 200,  angle: 25 },  // 档位5: 街景视角
    { height: 100,  angle: 18 },  // 档位6: 视角最低
];

export const viewConfig = {
    currentLevel: 0,
    targetHeight: viewLevels[0].height,
    targetAngle: viewLevels[0].angle * Math.PI / 180,
    currentHeight: viewLevels[0].height,
    currentPolarAngle: viewLevels[0].angle * Math.PI / 180,
    
    transitionSpeed: 0.08,
    isTransitioning: false,
    isMacro: false
};
