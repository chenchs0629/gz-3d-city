import geopandas as gpd
import json
import numpy as np

# ================= 配置项 =================
# 读取之前已经去中心化处理过的全量建筑 JSON
INPUT_FILE = "E:\\3d_city_function\\buildings_data.json" 
# 输出极简点云数组
OUTPUT_FILE = "public/data/macro_points.json"
# ==========================================

def generate_macro_points():
    print(f"1. 正在读取全城建筑数据 {INPUT_FILE} ...")
    gdf = gpd.read_file(INPUT_FILE)
    
    print("2. 正在提取建筑物重心...")
    centroids = gdf.geometry.centroid
    
    # 我们采用一维平铺数组 [x1, y1, c1, x2, y2, c2...] 的格式
    # 这比 [{"x": x1, "y": y1, "c": c1}...] 节省 80% 的体积！
    points_data = []
    
    for pt, c in zip(centroids, gdf['dominant_c']):
        # 保留2位小数足够了，极大减小文件体积
        points_data.append(round(pt.x, 2))
        points_data.append(round(pt.y, 2))
        
        # 处理可能出现的空值(NaN)
        color_val = 0 if np.isnan(c) else int(c)
        points_data.append(color_val)
        
    print(f"3. 正在写入 {OUTPUT_FILE} ...")
    with open(OUTPUT_FILE, 'w') as f:
        # separators=(',', ':') 可以去掉多余空格，极限压缩体积
        json.dump(points_data, f, separators=(',', ':'))
        
    print(f"✅ 宏观点云数据生成完毕！共 {len(centroids)} 个建筑点。")

if __name__ == "__main__":
    generate_macro_points()