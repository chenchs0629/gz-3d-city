import geopandas as gpd
import json

# ================= 配置项 =================
# 输入文件名 (请确保 .shp, .shx, .dbf 文件都在同级目录)
input_shp = r"E:\University\zhuhai_dataset_full\output\building_class_ini\building_with_class3.shp" 
# 输出文件名
output_json = "buildings_data.json"

def process_data():
    print(f"正在读取文件: {input_shp} ...")
    
    try:
        # 1. 读取 Shapefile
        gdf = gpd.read_file(input_shp)
        
        # 打印一下原始信息，确认列名无误
        print("原始列名:", gdf.columns.tolist())
        
        # 2. 筛选需要的列
        # 注意：GeoPandas 会自动保留 geometry 列，我们只需要指定属性列
        # 你的图片里列名是 'Height' (首字母大写) 和 'dominant_c'
        target_columns = ['Height', 'dominant_c', 'geometry']
        
        # 检查列是否存在，防止报错
        for col in ['Height', 'dominant_c']:
            if col not in gdf.columns:
                print(f"错误: 找不到列名 '{col}'，请检查你的原始数据列名拼写。")
                return

        # 创建一个新的 GeoDataFrame，只包含选中列
        gdf_clean = gdf[target_columns].copy()

        # 3. 处理空值 (可选)
        # 如果高度有空的，默认设为 10米，防止前端报错
        gdf_clean['Height'] = gdf_clean['Height'].fillna(10)
        
        # 4. 坐标系转换与中心化 (Three.js 关键步骤!)
        # ---------------------------------------------------------
        # 步骤 A: 确保数据是投影坐标系 (单位: 米)
        # 如果原始数据是经纬度 (EPSG:4326)，我们需要转为墨卡托 (EPSG:3857) 或 UTM
        if gdf_clean.crs.is_geographic:
            print("检测到经纬度坐标，正在转换为投影坐标(EPSG:3857)...")
            gdf_clean = gdf_clean.to_crs(epsg=3857)
        
        # 步骤 B: 计算中心点并归零
        # WebGL处理大坐标(如 x=12000000)会有精度丢失，必须减去中心点
        minx, miny, maxx, maxy = gdf_clean.total_bounds
        center_x = (minx + maxx) / 2
        center_y = (miny + maxy) / 2
        
        print(f"计算出的地图中心点: X={center_x}, Y={center_y}")
        print("正在执行坐标归零(去中心化)...")
        
        # 使用 translate 函数平移所有几何体到 (0,0) 附近
        gdf_clean['geometry'] = gdf_clean.translate(xoff=-center_x, yoff=-center_y)
        # ---------------------------------------------------------

        # 5. 导出为 GeoJSON
        print(f"正在保存为 {output_json} ...")
        gdf_clean.to_file(output_json, driver="GeoJSON")
        
        # 6. 生成一个元数据文件 (可选)
        # 记录中心点坐标，万一以后要把坐标还原回去，或者在这个位置加载路网，需要用到这个偏移量
        metadata = {
            "center_x": center_x,
            "center_y": center_y,
            "crs": str(gdf_clean.crs),
            "dominant_c_mapping": gdf_clean['dominant_c'].unique().tolist() # 打印出有哪些类别ID
        }
        with open("map_metadata.json", "w") as f:
            json.dump(metadata, f)

        print("转换成功！")
        print(f"1. 数据文件: {output_json} (已放入 public 文件夹使用)")
        print(f"2. 元数据文件: map_metadata.json (记录了中心点偏移量)")
        print(f"  - 包含的建筑物类别ID: {metadata['dominant_c_mapping']}")

    except Exception as e:
        print(f"发生错误: {e}")

if __name__ == "__main__":
    process_data()