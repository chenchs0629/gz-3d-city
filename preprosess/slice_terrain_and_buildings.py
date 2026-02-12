import geopandas as gpd
import rasterio
from rasterio.mask import mask
from rasterio.windows import from_bounds
from shapely.geometry import box
import numpy as np
from PIL import Image
import os
import json
import math

# ================= 配置 =================
SHP_FILE = "E:/University/zhuhai_dataset_full/output/building_class_ini/building_with_class3.shp"  # 你的建筑矢量
DEM_FILE = "E:/University/zhuhai_dataset_full/广东DEM/zhuhai.tif"                   # 你的高程数据 (必须有!)
OUTPUT_DIR = "public/data2/tiles"
TILE_SIZE = 500                        # 必须与前端 CONFIG.TILE_SIZE 一致
# =======================================

def process():
    # 1. 读取数据
    print("正在读取数据...")
    gdf = gpd.read_file(SHP_FILE)
    src = rasterio.open(DEM_FILE)
    
    # 确保坐标系一致 (假设都是 EPSG:3857)
    if gdf.crs != src.crs:
        print("坐标系不一致，正在转换...")
        gdf = gdf.to_crs(src.crs)

    # 2. 计算建筑物的底面高程 (核心步骤!)
    # 对每个建筑，取其中心点，去 DEM 查高度
    print("正在采样建筑高程(Clamping)...")
    # 获取所有几何体的中心点坐标
    centroids = gdf.geometry.centroid
    coord_list = [(x, y) for x, y in zip(centroids.x, centroids.y)]
    
    # rasterio 的 sample 方法可以批量采样
    elevation_generator = src.sample(coord_list)
    elevations = [val[0] for val in elevation_generator]
    
    # 将高程写入 DataFrame，处理无效值(如海洋处可能是负数或NoData)
    gdf['elevation'] = [e if e > -1000 else 0 for e in elevations]

    # 3. 准备切片
    # 计算网格 ID
    gdf['grid_x'] = (centroids.x / TILE_SIZE).apply(math.floor)
    gdf['grid_y'] = (centroids.y / TILE_SIZE).apply(math.floor)
    
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    # 4. 按瓦片循环处理
    for (gx, gy), group in gdf.groupby(['grid_x', 'grid_y']):
        print(f"处理瓦片: {gx}_{gy}")
        
        # --- A. 导出建筑数据 (带高程) ---
        # 去中心化坐标 (变为相对于瓦片左下角的坐标，方便前端计算，也可保持绝对坐标)
        # 这里为了配合你现在的逻辑，我们保持绝对坐标，但前端需要处理 'elevation'
        json_path = os.path.join(OUTPUT_DIR, f"tile_{gx}_{gy}.json")
        # 清理字段，只留需要的
        out_df = group[['geometry', 'Height', 'dominant_c', 'elevation']]
        out_df.to_file(json_path, driver="GeoJSON")
        
        # --- B. 导出地形高度图 (Heightmap) ---
        # 计算该瓦片的地理边界
        minx = gx * TILE_SIZE
        miny = gy * TILE_SIZE
        maxx = (gx + 1) * TILE_SIZE
        maxy = (gy + 1) * TILE_SIZE
        bbox = box(minx, miny, maxx, maxy)
        
        try:
            # 从 DEM 中切出这块区域
            out_image, out_transform = mask(src, [bbox], crop=True)
            # out_image 是一个数组 (bands, height, width)
            data = out_image[0] # 取第一波段
            
            # 归一化为 0-255 的灰度图 (需要记录最大最小高度以便前端还原)
            # 为了简单，我们这里假设地形高度在 0-500米之间
            # 实际生产中应该输出 .bin 或 .png 并附带 scale/offset 元数据
            
            # 这里演示生成简单的 PNG 高度图
            # 填充 NoData
            data[data < -1000] = 0 
            
            # 缩放到 128x128 像素 (减小纹理大小)
            img = Image.fromarray(data)
            img = img.resize((128, 128), Image.Resampling.BILINEAR)
            
            # 保存
            terrain_path = os.path.join(OUTPUT_DIR, f"terrain_{gx}_{gy}.png")
            # 将高度数据映射到 RGB (这里简化处理，仅做示意，推荐使用 Mapbox RGB 编码或纯灰度)
            # 简单灰度: 假设最高 400m
            img_array = np.array(img)
            normalized = np.clip(img_array / 400 * 255, 0, 255).astype(np.uint8)
            Image.fromarray(normalized).save(terrain_path)
            
        except Exception as e:
            print(f"  无地形数据或切割失败: {e}")

if __name__ == "__main__":
    process()