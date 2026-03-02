import geopandas as gpd
import json
import os
import math
import shutil

# ================= 配置项 =================
INPUT_FILE = "gz-3d-city/public/buildings_data.json"  # 之前生成的去中心化后的 GeoJSON
OUTPUT_DIR = "gz-3d-city/public/data/tiles"    # 输出目录 (建议直接输出到前端项目的 public 文件夹)
TILE_SIZE = 500                     # 每个瓦片的大小 (单位: 米)。建议 500-1000米
# ==========================================

def slice_geojson_grid():
    print(f"1. 正在读取 {INPUT_FILE} ...")
    try:
        gdf = gpd.read_file(INPUT_FILE)
    except Exception as e:
        print(f"读取失败: {e}")
        return

    # 准备输出目录
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR) # 清空旧数据
    os.makedirs(OUTPUT_DIR)

    print("2. 正在计算建筑物重心并分配网格 ID...")
    
    # 计算每个建筑的重心 (Centroid)
    # 警告：这里会产生临时警告，忽略即可
    centroids = gdf.geometry.centroid
    
    # 计算网格坐标 (Grid X, Grid Y)
    # 逻辑：坐标 / TILE_SIZE 向下取整
    gdf['grid_x'] = (centroids.x / TILE_SIZE).apply(math.floor)
    gdf['grid_y'] = (centroids.y / TILE_SIZE).apply(math.floor)

    # 统计一下共有多少个瓦片
    unique_tiles = gdf[['grid_x', 'grid_y']].drop_duplicates()
    print(f"   共生成 {len(unique_tiles)} 个瓦片文件。")

    # 创建一个索引列表，给前端用
    tile_index = []

    print("3. 正在切片并保存 JSON 文件...")
    # 按 grid_x 和 grid_y 分组导出
    for (gx, gy), group in gdf.groupby(['grid_x', 'grid_y']):
        
        # 构造文件名: tile_x_y.json
        file_name = f"tile_{gx}_{gy}.json"
        file_path = os.path.join(OUTPUT_DIR, file_name)
        
        # 移除临时的 grid 列，保持数据纯净
        out_gdf = group.drop(columns=['grid_x', 'grid_y'])
        
        # 导出单个瓦片
        out_gdf.to_file(file_path, driver="GeoJSON")
        
        # 记录元数据
        tile_index.append({
            "id": f"{gx}_{gy}",
            "x": int(gx),
            "y": int(gy),
            "file": file_name,
            "center_x": (gx + 0.5) * TILE_SIZE, # 瓦片中心点估算
            "center_y": (gy + 0.5) * TILE_SIZE
        })

    # 保存索引文件
    index_path = os.path.join(OUTPUT_DIR, "index.json")
    with open(index_path, 'w') as f:
        json.dump({
            "tileSize": TILE_SIZE,
            "tiles": tile_index
        }, f)

    print("========================================")
    print("切片完成！")
    print(f"输出目录: {OUTPUT_DIR}")
    print(f"索引文件: {index_path}")
    print("现在你可以去前端编写 GridLoader 了。")

if __name__ == "__main__":
    slice_geojson_grid()