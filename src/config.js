export const CONFIG = {
    TILE_SIZE: 500,        // 必须与 Python 切片脚本一致
    VISIBLE_RADIUS: 3,     // 加载半径：3 表示加载周围 7x7 的瓦片
    UNLOAD_RADIUS: 5,      // 卸载半径：超出这个范围的瓦片会被卸载
    FOG_DENSITY: 0.00015,  // 雾的浓度
    BASE_URL: '/data/tiles', // 瓦片数据的路径
    ROADNET_URL: '/data/roadnet' // 路网数据的路径
};
