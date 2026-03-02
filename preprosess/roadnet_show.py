import geopandas as gpd
import os
import math
import json
from shapely.affinity import translate

# ================= 配置项 =================
ROADS_SHP = "public/roadnet/珠海市.shp"                # 你的路网矢量文件
OUTPUT_DIR = "public/data/roadnet"       # 输出目录
TILE_SIZE = 500                        # 必须与前端 CONFIG.TILE_SIZE 一致
META_FILE = "public/map_metadata.json"
# ==========================================

def process_roads():
    print("1. 正在读取路网数据...")
    gdf = gpd.read_file(ROADS_SHP)
    
    # 确坐坐标系与建筑物一致 (投影坐标系 EPSG:3857)
    if gdf.crs != "EPSG:3857":
        print("坐标系不是 EPSG:3857，正在转换...")
        gdf = gdf.to_crs("EPSG:3857")
        
    print("2. 应用中心偏移量 (从 map_metadata.json 中读取) ...")
    if os.path.exists(META_FILE):
        with open(META_FILE, 'r') as f:
            meta = json.load(f)
            cx = meta['center_x']
            cy = meta['center_y']
        print(f"应用中心偏移: X - {cx}, Y - {cy}")
        # 平移所有的路网几何形状
        gdf['geometry'] = gdf.geometry.apply(lambda geom: translate(geom, xoff=-cx, yoff=-cy))
    else:
        print("警告: 找不到 map_metadata.json！路网可能无法与建筑对齐。")
    
    print("3. 正在生成道路缓冲区 (Line -> Polygon)...")
    # 现在坐标系是 EPSG:3857 (单位：米)，buffer(3) 代表双向总宽 6 米的道路。
    gdf['geometry'] = gdf.geometry.buffer(3.0) 
    
    print("4. 正在计算网格 ID 并切片...")
    # 用多边形的重心来分配网格 (与建筑逻辑保持绝对一致)
    centroids = gdf.geometry.centroid
    gdf['grid_x'] = (centroids.x / TILE_SIZE).apply(math.floor)
    gdf['grid_y'] = (centroids.y / TILE_SIZE).apply(math.floor)
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    for (gx, gy), group in gdf.groupby(['grid_x', 'grid_y']):
        # 命名为 road_tile_x_y.json 以区分建筑
        file_path = os.path.join(OUTPUT_DIR, f"road_tile_{gx}_{gy}.json")
        
        # 只保留前端需要的字段（减小文件体积）
        out_gdf = group[['geometry']] 
        out_gdf.to_file(file_path, driver="GeoJSON")
        print(f"  已生成道路瓦片: {gx}_{gy}")

if __name__ == "__main__":
    process_roads()