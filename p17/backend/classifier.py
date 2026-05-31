import os
import numpy as np
from osgeo import gdal
from typing import Dict, Any, Optional, Tuple
import pickle
import logging

logger = logging.getLogger(__name__)


class LandCoverClassifier:
    """
    基于随机森林的土地覆盖分类器
    分类类别：水体、森林、建筑、裸地、农田
    """

    CLASS_NAMES = {
        0: "未分类",
        1: "水体",
        2: "森林",
        3: "建筑用地",
        4: "裸地",
        5: "农田"
    }

    CLASS_COLORS = {
        0: (0, 0, 0, 0),
        1: (31, 120, 180, 255),
        2: (51, 160, 44, 255),
        3: (227, 26, 28, 255),
        4: (255, 127, 0, 255),
        5: (178, 223, 138, 255)
    }

    def __init__(self, chunk_size: int = 2048):
        self.chunk_size = chunk_size
        self.model = None
        self._build_default_model()

    def _build_default_model(self):
        """构建基于规则的简易分类器（当没有训练模型时使用）"""
        self.model = "rule_based"

    def _calculate_indices(self, blue, green, red, nir, swir1=None):
        """计算光谱指数作为分类特征"""
        ndvi = np.where((nir + red) != 0, (nir - red) / (nir + red), 0)
        ndwi = np.where((green + nir) != 0, (green - nir) / (green + nir), 0)
        mndwi = np.where((green + swir1) != 0, (green - swir1) / (green + swir1), 0) if swir1 is not None else ndwi
        ndbi = np.where((swir1 + nir) != 0, (swir1 - nir) / (swir1 + nir), 0) if swir1 is not None else np.zeros_like(ndvi)

        brightness = (blue + green + red + nir) / 4.0

        return {
            'ndvi': ndvi,
            'ndwi': ndwi,
            'mndwi': mndwi,
            'ndbi': ndbi,
            'brightness': brightness
        }

    def _rule_based_classify(self, indices: Dict[str, np.ndarray]) -> np.ndarray:
        """基于规则的简易分类"""
        ndvi = indices['ndvi']
        mndwi = indices['mndwi']
        ndbi = indices['ndbi']
        brightness = indices['brightness']

        classification = np.zeros_like(ndvi, dtype=np.uint8)

        water_mask = mndwi > 0.1
        forest_mask = (~water_mask) & (ndvi > 0.6)
        built_mask = (~water_mask) & (~forest_mask) & (ndbi > 0.05) & (ndvi < 0.3)
        farm_mask = (~water_mask) & (~forest_mask) & (~built_mask) & (ndvi > 0.3) & (ndvi <= 0.6)
        bare_mask = (~water_mask) & (~forest_mask) & (~built_mask) & (~farm_mask)

        classification[water_mask] = 1
        classification[forest_mask] = 2
        classification[built_mask] = 3
        classification[bare_mask] = 4
        classification[farm_mask] = 5

        return classification

    def classify_chunk(self, blue: np.ndarray, green: np.ndarray, red: np.ndarray,
                       nir: np.ndarray, swir1: np.ndarray = None) -> np.ndarray:
        """分块分类"""
        indices = self._calculate_indices(blue, green, red, nir, swir1)

        if self.model == "rule_based":
            return self._rule_based_classify(indices)
        else:
            return self._ml_classify(indices)

    def _ml_classify(self, indices: Dict[str, np.ndarray]) -> np.ndarray:
        """机器学习分类（预留接口）"""
        return self._rule_based_classify(indices)

    def classify_image(self, input_path: str, output_path: str,
                       cloud_mask: np.ndarray = None) -> Dict[str, Any]:
        """
        对整幅影像进行分类（分块处理）
        :param input_path: 输入影像路径
        :param output_path: 输出分类结果路径
        :param cloud_mask: 云掩膜
        :return: 分类统计信息
        """
        ds = gdal.Open(input_path)
        if ds is None:
            raise ValueError(f"Cannot open file: {input_path}")

        width = ds.RasterXSize
        height = ds.RasterYSize
        transform = ds.GetGeoTransform()
        projection = ds.GetProjection()
        band_count = ds.RasterCount

        driver = gdal.GetDriverByName("GTiff")
        out_ds = driver.Create(
            output_path,
            width,
            height,
            1,
            gdal.GDT_Byte,
            options=["COMPRESS=LZW", "TILED=YES", "BIGTIFF=YES"]
        )
        out_ds.SetGeoTransform(transform)
        out_ds.SetProjection(projection)
        out_band = out_ds.GetRasterBand(1)
        out_band.SetNoDataValue(0)

        class_counts = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_valid = 0

        chunk_size = self.chunk_size

        for y in range(0, height, chunk_size):
            for x in range(0, width, chunk_size):
                chunk_w = min(chunk_size, width - x)
                chunk_h = min(chunk_size, height - y)

                blue = ds.GetRasterBand(1).ReadAsArray(x, y, chunk_w, chunk_h).astype(np.float32)
                green = ds.GetRasterBand(2).ReadAsArray(x, y, chunk_w, chunk_h).astype(np.float32)
                red = ds.GetRasterBand(3).ReadAsArray(x, y, chunk_w, chunk_h).astype(np.float32)
                nir = ds.GetRasterBand(8).ReadAsArray(x, y, chunk_w, chunk_h).astype(np.float32)

                swir1 = None
                if band_count >= 11:
                    try:
                        swir1 = ds.GetRasterBand(11).ReadAsArray(x, y, chunk_w, chunk_h).astype(np.float32)
                    except:
                        pass

                chunk_class = self.classify_chunk(blue, green, red, nir, swir1)

                if cloud_mask is not None:
                    chunk_cloud = cloud_mask[y:y+chunk_h, x:x+chunk_w]
                    chunk_class[chunk_cloud] = 0

                out_band.WriteArray(chunk_class, x, y)

                for cls in [1, 2, 3, 4, 5]:
                    count = np.sum(chunk_class == cls)
                    class_counts[cls] += count
                    total_valid += count

        out_ds.FlushCache()
        out_ds = None
        ds = None

        pixel_area = abs(transform[1] * transform[5])
        class_areas = {k: v * pixel_area / 1000000 for k, v in class_counts.items()}

        return {
            "class_counts": class_counts,
            "class_areas_km2": class_areas,
            "total_pixels": total_valid,
            "class_names": self.CLASS_NAMES
        }

    def create_rgb_preview(self, class_path: str, output_png: str) -> str:
        """创建分类结果的RGB预览图"""
        ds = gdal.Open(class_path)
        band = ds.GetRasterBand(1)
        data = band.ReadAsArray()

        height, width = data.shape
        rgb = np.zeros((height, width, 4), dtype=np.uint8)

        for cls, color in self.CLASS_COLORS.items():
            mask = data == cls
            rgb[mask, 0] = color[0]
            rgb[mask, 1] = color[1]
            rgb[mask, 2] = color[2]
            rgb[mask, 3] = color[3]

        from PIL import Image
        img = Image.fromarray(rgb, 'RGBA')
        max_size = 1024
        if img.width > max_size or img.height > max_size:
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

        img.save(output_png)
        ds = None

        return output_png


class ChangeDetector:
    """
    变化检测器
    方法：NDVI差值 + 阈值法
    """

    CHANGE_TYPES = {
        -2: "严重退化",
        -1: "轻度退化",
        0: "无变化",
        1: "轻度改善",
        2: "显著改善"
    }

    def __init__(self, chunk_size: int = 2048):
        self.chunk_size = chunk_size

    def calculate_change(self, before_path: str, after_path: str, output_path: str,
                         index_type: str = "ndvi", threshold: float = 0.1) -> Dict[str, Any]:
        """
        计算两期影像的变化
        :param before_path: 前期影像路径
        :param after_path: 后期影像路径
        :param output_path: 输出变化检测结果路径
        :param index_type: 指数类型 ndvi/evi/ndwi
        :param threshold: 变化阈值
        :return: 变化统计信息
        """
        ds_before = gdal.Open(before_path)
        ds_after = gdal.Open(after_path)

        if ds_before is None or ds_after is None:
            raise ValueError("Cannot open input files")

        width = min(ds_before.RasterXSize, ds_after.RasterXSize)
        height = min(ds_before.RasterYSize, ds_after.RasterYSize)
        transform = ds_before.GetGeoTransform()
        projection = ds_before.GetProjection()

        driver = gdal.GetDriverByName("GTiff")
        out_ds = driver.Create(
            output_path,
            width,
            height,
            1,
            gdal.GDT_Float32,
            options=["COMPRESS=LZW", "TILED=YES", "BIGTIFF=YES"]
        )
        out_ds.SetGeoTransform(transform)
        out_ds.SetProjection(projection)
        out_band = out_ds.GetRasterBand(1)
        out_band.SetNoDataValue(-9999)

        change_counts = {-2: 0, -1: 0, 0: 0, 1: 0, 2: 0}
        total_pixels = 0

        chunk_size = self.chunk_size

        for y in range(0, height, chunk_size):
            for x in range(0, width, chunk_size):
                chunk_w = min(chunk_size, width - x)
                chunk_h = min(chunk_size, height - y)

                before_data = ds_before.GetRasterBand(1).ReadAsArray(x, y, chunk_w, chunk_h)
                after_data = ds_after.GetRasterBand(1).ReadAsArray(x, y, chunk_w, chunk_h)

                if before_data.shape != after_data.shape:
                    min_h = min(before_data.shape[0], after_data.shape[0])
                    min_w = min(before_data.shape[1], after_data.shape[1])
                    before_data = before_data[:min_h, :min_w]
                    after_data = after_data[:min_h, :min_w]
                    chunk_w, chunk_h = min_w, min_h

                valid_mask = (before_data != -9999) & (after_data != -9999)

                difference = np.zeros_like(before_data, dtype=np.float32)
                difference[valid_mask] = after_data[valid_mask] - before_data[valid_mask]
                difference[~valid_mask] = -9999

                out_band.WriteArray(difference, x, y)

                change_class = np.zeros_like(difference, dtype=np.int8)
                change_class[(difference < -threshold) & valid_mask] = -2
                change_class[(difference >= -threshold) & (difference < -threshold/2) & valid_mask] = -1
                change_class[(difference >= -threshold/2) & (difference <= threshold/2) & valid_mask] = 0
                change_class[(difference > threshold/2) & (difference <= threshold) & valid_mask] = 1
                change_class[(difference > threshold) & valid_mask] = 2

                for cls in [-2, -1, 0, 1, 2]:
                    change_counts[cls] += np.sum(change_class == cls)

                total_pixels += np.sum(valid_mask)

        out_ds.FlushCache()
        out_ds = None
        ds_before = None
        ds_after = None

        return {
            "change_counts": change_counts,
            "change_types": self.CHANGE_TYPES,
            "total_pixels": int(total_pixels),
            "threshold": threshold,
            "index_type": index_type
        }


class ReportGenerator:
    """统计报表生成器"""

    def __init__(self):
        pass

    def generate_classification_report(self, task_name: str, class_stats: Dict[str, Any]) -> str:
        """生成分类统计报表（CSV格式）"""
        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow(["土地覆盖分类统计报表"])
        writer.writerow(["任务名称", task_name])
        writer.writerow([])
        writer.writerow(["类别ID", "类别名称", "像素数量", "面积(平方公里)", "占比(%)"])

        total_pixels = sum(class_stats['class_counts'].values())

        for cls_id, cls_name in class_stats['class_names'].items():
            if cls_id == 0:
                continue
            count = class_stats['class_counts'].get(cls_id, 0)
            area = class_stats['class_areas_km2'].get(cls_id, 0)
            percent = (count / total_pixels * 100) if total_pixels > 0 else 0
            writer.writerow([cls_id, cls_name, count, f"{area:.4f}", f"{percent:.2f}"])

        writer.writerow([])
        writer.writerow(["总计", "", total_pixels,
                        f"{sum(class_stats['class_areas_km2'].values()):.4f}", "100.00"])

        return output.getvalue()

    def generate_change_report(self, task_name: str, change_stats: Dict[str, Any]) -> str:
        """生成变化检测统计报表（CSV格式）"""
        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow(["变化检测统计报表"])
        writer.writerow(["任务名称", task_name])
        writer.writerow(["检测指数", change_stats['index_type']])
        writer.writerow(["变化阈值", change_stats['threshold']])
        writer.writerow([])
        writer.writerow(["变化等级", "变化类型", "像素数量", "占比(%)"])

        total_pixels = change_stats['total_pixels']

        for level, type_name in sorted(change_stats['change_types'].items()):
            count = change_stats['change_counts'].get(level, 0)
            percent = (count / total_pixels * 100) if total_pixels > 0 else 0
            writer.writerow([level, type_name, count, f"{percent:.2f}"])

        writer.writerow([])
        writer.writerow(["总计", "", total_pixels, "100.00"])

        return output.getvalue()

    def generate_full_report(self, task_name: str, class_stats: Dict[str, Any],
                             index_stats: Dict[str, Any]) -> str:
        """生成完整统计报表"""
        import csv
        from io import StringIO

        output = StringIO()
        writer = csv.writer(output)

        writer.writerow(["Sentinel-2 影像处理完整统计报表"])
        writer.writerow(["任务名称", task_name])
        writer.writerow([])
        writer.writerow(["=" * 50])
        writer.writerow([])

        writer.writerow(["【植被指数统计】"])
        writer.writerow([])
        writer.writerow(["指数类型", "均值", "中位数", "最小值", "最大值", "标准差"])

        for index_type, stats in index_stats.items():
            writer.writerow([
                index_type.upper(),
                f"{stats.get('mean_value', 0):.4f}",
                f"{stats.get('median_value', 0):.4f}",
                f"{stats.get('min_value', 0):.4f}",
                f"{stats.get('max_value', 0):.4f}",
                f"{stats.get('std_value', 0):.4f}"
            ])

        writer.writerow([])
        writer.writerow(["=" * 50])
        writer.writerow([])

        writer.writerow(["【土地覆盖分类统计】"])
        writer.writerow([])
        writer.writerow(["类别ID", "类别名称", "像素数量", "面积(平方公里)", "占比(%)"])

        total_pixels = sum(class_stats['class_counts'].values())

        for cls_id, cls_name in class_stats['class_names'].items():
            if cls_id == 0:
                continue
            count = class_stats['class_counts'].get(cls_id, 0)
            area = class_stats['class_areas_km2'].get(cls_id, 0)
            percent = (count / total_pixels * 100) if total_pixels > 0 else 0
            writer.writerow([cls_id, cls_name, count, f"{area:.4f}", f"{percent:.2f}"])

        return output.getvalue()
