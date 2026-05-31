import os
import numpy as np
from osgeo import gdal, ogr, osr
from typing import Tuple, Optional, Dict, Any
import uuid
import logging
from .config import PROCESSED_DIR

gdal.UseExceptions()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CloudMasker:
    """
    Sentinel-2 云掩膜生成器
    支持 SCL波段、QA波段 和 基于光谱的云检测
    """

    @staticmethod
    def scl_cloud_mask(scl_band: np.ndarray) -> np.ndarray:
        """
        使用SCL (Scene Classification Layer) 生成云掩膜
        SCL 值:
        0 - NO_DATA
        1 - SATURATED_OR_DEFECTIVE
        2 - DARK_AREA_PIXELS
        3 - CLOUD_SHADOWS
        4 - VEGETATION
        5 - NOT_VEGETATED
        6 - WATER
        7 - UNCLASSIFIED
        8 - CLOUD_MEDIUM_PROBABILITY
        9 - CLOUD_HIGH_PROBABILITY
        10 - THIN_CIRRUS
        11 - SNOW
        """
        cloud_mask = np.isin(scl_band, [0, 1, 3, 8, 9, 10, 11])
        return cloud_mask

    @staticmethod
    def qa_cloud_mask(qa_band: np.ndarray) -> np.ndarray:
        """
        使用QA波段生成云掩膜 (Sentinel-2 QA60)
        Bit 10: 云
        Bit 11: 卷云
        """
        cloud_bit = (qa_band & (1 << 10)) != 0
        cirrus_bit = (qa_band & (1 << 11)) != 0
        return cloud_bit | cirrus_bit

    @staticmethod
    def spectral_cloud_mask(
        blue: np.ndarray,
        green: np.ndarray,
        red: np.ndarray,
        nir: np.ndarray,
        swir1: Optional[np.ndarray] = None,
        swir2: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        基于光谱的云检测算法 (简化版 Fmask)
        适用于没有SCL/QA波段的情况
        """
        blue = blue.astype(np.float32)
        green = green.astype(np.float32)
        red = red.astype(np.float32)
        nir = nir.astype(np.float32)

        ndsi = None
        if swir1 is not None:
            swir1 = swir1.astype(np.float32)
            ndsi = np.where(
                (green + swir1) != 0,
                (green - swir1) / (green + swir1),
                0
            )

        ndvi = np.where((nir + red) != 0, (nir - red) / (nir + red), 0)

        whiteness_index = np.abs(blue - green) + np.abs(green - red) + np.abs(red - nir)
        brightness = (blue + green + red) / 3.0

        bright_cloud = brightness > 0.3
        high_whiteness = whiteness_index < 0.2
        low_ndvi = np.abs(ndvi) < 0.2

        cloud_mask = bright_cloud & high_whiteness & low_ndvi

        if ndsi is not None:
            snow_mask = (ndsi > 0.4) & (brightness > 0.3)
            cloud_mask = cloud_mask & ~snow_mask

        return cloud_mask

    @staticmethod
    def combine_masks(*masks: np.ndarray) -> np.ndarray:
        """组合多个掩膜 (逻辑或)"""
        combined = masks[0]
        for mask in masks[1:]:
            if mask is not None:
                combined = combined | mask
        return combined


class ImageProcessor:
    def __init__(self, chunk_size: int = 2048):
        """
        :param chunk_size: 分块处理的块大小 (像素)，默认2048x2048
        """
        self.driver = gdal.GetDriverByName("GTiff")
        self.chunk_size = chunk_size
        self.cloud_masker = CloudMasker()

    def _get_bbox(self, transform, width, height):
        minx = transform[0]
        maxy = transform[3]
        maxx = minx + width * transform[1] + height * transform[2]
        miny = maxy + width * transform[4] + height * transform[5]
        return f"{minx},{miny},{maxx},{maxy}"

    def get_image_info(self, file_path: str) -> Dict[str, Any]:
        """仅获取影像元数据，不读取像素数据"""
        ds = gdal.Open(file_path)
        if ds is None:
            raise ValueError(f"Cannot open file: {file_path}")

        transform = ds.GetGeoTransform()
        projection = ds.GetProjection()
        width = ds.RasterXSize
        height = ds.RasterYSize
        band_count = ds.RasterCount

        info = {
            "transform": transform,
            "projection": projection,
            "width": width,
            "height": height,
            "band_count": band_count,
            "bbox": self._get_bbox(transform, width, height),
            "estimated_size_gb": (width * height * band_count * 4) / (1024 ** 3)
        }

        ds = None
        return info

    def read_band_chunked(
        self,
        file_path: str,
        band_indices: list,
        callback: callable = None
    ) -> list:
        """
        分块读取指定波段，避免一次性读入大影像
        :param file_path: 影像路径
        :param band_indices: 要读取的波段索引列表 (从1开始)
        :param callback: 进度回调函数 (progress: float)
        :return: 波段数据列表
        """
        ds = gdal.Open(file_path)
        if ds is None:
            raise ValueError(f"Cannot open file: {file_path}")

        width = ds.RasterXSize
        height = ds.RasterYSize
        chunk_size = self.chunk_size

        bands_data = [np.zeros((height, width), dtype=np.float32) for _ in band_indices]
        total_chunks = ((width + chunk_size - 1) // chunk_size) * ((height + chunk_size - 1) // chunk_size)
        chunk_idx = 0

        for y in range(0, height, chunk_size):
            for x in range(0, width, chunk_size):
                chunk_w = min(chunk_size, width - x)
                chunk_h = min(chunk_size, height - y)

                for i, band_idx in enumerate(band_indices):
                    band = ds.GetRasterBand(band_idx)
                    chunk_data = band.ReadAsArray(x, y, chunk_w, chunk_h)
                    bands_data[i][y:y+chunk_h, x:x+chunk_w] = chunk_data.astype(np.float32)

                chunk_idx += 1
                if callback:
                    callback(chunk_idx / total_chunks)

        ds = None
        return bands_data

    def create_output_dataset(
        self,
        output_path: str,
        width: int,
        height: int,
        transform: tuple,
        projection: str,
        bands: int = 1,
        dtype: int = gdal.GDT_Float32,
        nodata: float = -9999
    ) -> gdal.Dataset:
        """创建输出GeoTIFF数据集"""
        ds = self.driver.Create(
            output_path,
            width,
            height,
            bands,
            dtype,
            options=["COMPRESS=LZW", "TILED=YES", "BIGTIFF=YES"]
        )
        ds.SetGeoTransform(transform)
        ds.SetProjection(projection)

        for i in range(1, bands + 1):
            band = ds.GetRasterBand(i)
            band.SetNoDataValue(nodata)

        return ds

    def calculate_ndvi(self, nir: np.ndarray, red: np.ndarray, cloud_mask: np.ndarray = None) -> np.ndarray:
        """
        计算NDVI，可选应用云掩膜
        """
        nir = nir.astype(np.float32)
        red = red.astype(np.float32)

        denominator = nir + red
        ndvi = np.where(denominator != 0, (nir - red) / denominator, -9999)

        if cloud_mask is not None:
            ndvi[cloud_mask] = -9999

        return ndvi.astype(np.float32)

    def calculate_evi(self, nir: np.ndarray, red: np.ndarray, blue: np.ndarray, cloud_mask: np.ndarray = None) -> np.ndarray:
        """
        计算EVI，可选应用云掩膜
        """
        nir = nir.astype(np.float32)
        red = red.astype(np.float32)
        blue = blue.astype(np.float32)

        denominator = nir + 6 * red - 7.5 * blue + 1
        evi = np.where(denominator != 0, 2.5 * (nir - red) / denominator, -9999)
        evi = np.clip(evi, -1, 1)

        if cloud_mask is not None:
            evi[cloud_mask] = -9999

        return evi.astype(np.float32)

    def calculate_ndwi(self, green: np.ndarray, nir: np.ndarray, cloud_mask: np.ndarray = None) -> np.ndarray:
        """
        计算NDWI，可选应用云掩膜
        """
        green = green.astype(np.float32)
        nir = nir.astype(np.float32)

        denominator = green + nir
        ndwi = np.where(denominator != 0, (green - nir) / denominator, -9999)

        if cloud_mask is not None:
            ndwi[cloud_mask] = -9999

        return ndwi.astype(np.float32)

    def process_sentinel2_chunked(
        self,
        input_path: str,
        task_id: int,
        apply_cloud_mask: bool = True,
        cloud_detection_method: str = "auto",
        progress_callback: callable = None
    ) -> Dict[str, str]:
        """
        分块处理Sentinel-2影像，支持大影像
        :param input_path: 输入影像路径
        :param task_id: 任务ID
        :param apply_cloud_mask: 是否应用云掩膜
        :param cloud_detection_method: 云检测方法: "auto", "scl", "qa", "spectral"
        :param progress_callback: 进度回调
        """
        task_dir = os.path.join(PROCESSED_DIR, f"task_{task_id}")
        os.makedirs(task_dir, exist_ok=True)

        logger.info(f"开始分块处理影像: {input_path}")
        info = self.get_image_info(input_path)
        logger.info(f"影像尺寸: {info['width']}x{info['height']}, 波段数: {info['band_count']}")
        logger.info(f"预估内存: {info['estimated_size_gb']:.2f} GB")

        width = info['width']
        height = info['height']
        transform = info['transform']
        projection = info['projection']

        unique_id = str(uuid.uuid4())[:8]
        ndvi_path = os.path.join(task_dir, f"ndvi_{unique_id}.tif")
        evi_path = os.path.join(task_dir, f"evi_{unique_id}.tif")
        ndwi_path = os.path.join(task_dir, f"ndwi_{unique_id}.tif")
        cloud_mask_path = os.path.join(task_dir, f"cloud_mask_{unique_id}.tif")

        ndvi_ds = self.create_output_dataset(ndvi_path, width, height, transform, projection)
        evi_ds = self.create_output_dataset(evi_path, width, height, transform, projection)
        ndwi_ds = self.create_output_dataset(ndwi_path, width, height, transform, projection)

        chunk_size = self.chunk_size
        total_chunks = ((width + chunk_size - 1) // chunk_size) * ((height + chunk_size - 1) // chunk_size)
        chunk_idx = 0

        ds = gdal.Open(input_path)
        band_count = ds.RasterCount

        has_scl = band_count >= 12
        has_qa = band_count >= 11

        logger.info(f"波段数: {band_count}, SCL可用: {has_scl}, QA可用: {has_qa}")

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

                cloud_mask = None
                if apply_cloud_mask:
                    cloud_mask = self._detect_clouds_chunk(
                        ds, x, y, chunk_w, chunk_h,
                        band_count, has_scl, has_qa, cloud_detection_method,
                        blue, green, red, nir, swir1
                    )

                ndvi_chunk = self.calculate_ndvi(nir, red, cloud_mask)
                evi_chunk = self.calculate_evi(nir, red, blue, cloud_mask)
                ndwi_chunk = self.calculate_ndwi(green, nir, cloud_mask)

                ndvi_ds.GetRasterBand(1).WriteArray(ndvi_chunk, x, y)
                evi_ds.GetRasterBand(1).WriteArray(evi_chunk, x, y)
                ndwi_ds.GetRasterBand(1).WriteArray(ndwi_chunk, x, y)

                chunk_idx += 1
                if progress_callback:
                    progress_callback(chunk_idx / total_chunks)

        ndvi_ds.FlushCache()
        evi_ds.FlushCache()
        ndwi_ds.FlushCache()

        ndvi_ds = None
        evi_ds = None
        ndwi_ds = None
        ds = None

        logger.info("分块处理完成!")

        return {
            "ndvi_path": ndvi_path,
            "evi_path": evi_path,
            "ndwi_path": ndwi_path,
            "cloud_mask_path": cloud_mask_path if apply_cloud_mask else None,
            "bbox": info['bbox'],
            "crs": "EPSG:4326"
        }

    def _detect_clouds_chunk(
        self,
        ds: gdal.Dataset,
        x: int, y: int,
        chunk_w: int, chunk_h: int,
        band_count: int,
        has_scl: bool,
        has_qa: bool,
        method: str,
        blue: np.ndarray,
        green: np.ndarray,
        red: np.ndarray,
        nir: np.ndarray,
        swir1: np.ndarray = None
    ) -> np.ndarray:
        """分块检测云"""
        masks = []

        if method in ["auto", "scl"] and has_scl:
            try:
                scl = ds.GetRasterBand(12).ReadAsArray(x, y, chunk_w, chunk_h)
                masks.append(self.cloud_masker.scl_cloud_mask(scl))
            except Exception as e:
                logger.warning(f"SCL波段读取失败: {e}")

        if method in ["auto", "qa"] and has_qa and not masks:
            try:
                qa = ds.GetRasterBand(11).ReadAsArray(x, y, chunk_w, chunk_h)
                masks.append(self.cloud_masker.qa_cloud_mask(qa))
            except Exception as e:
                logger.warning(f"QA波段读取失败: {e}")

        if (method in ["auto", "spectral"] and not masks) or method == "spectral":
            masks.append(self.cloud_masker.spectral_cloud_mask(blue, green, red, nir, swir1))

        if masks:
            return self.cloud_masker.combine_masks(*masks)
        return None

    def process_sentinel2(self, input_path: str, task_id: int, apply_cloud_mask: bool = True) -> Dict[str, str]:
        """兼容旧接口"""
        return self.process_sentinel2_chunked(
            input_path=input_path,
            task_id=task_id,
            apply_cloud_mask=apply_cloud_mask,
            cloud_detection_method="auto"
        )

    def calculate_statistics(self, raster_path: str, polygon_wkt: Optional[str] = None) -> Dict[str, Any]:
        """分块计算统计量，避免大影像一次性读入"""
        ds = gdal.Open(raster_path)
        band = ds.GetRasterBand(1)
        nodata = band.GetNoDataValue()

        if polygon_wkt:
            return self._calculate_statistics_with_polygon_chunked(ds, band, polygon_wkt, nodata)

        width = ds.RasterXSize
        height = ds.RasterYSize
        chunk_size = self.chunk_size

        sum_vals = 0.0
        sum_sq = 0.0
        valid_count = 0
        min_val = float('inf')
        max_val = float('-inf')
        all_valid = []

        for y in range(0, height, chunk_size):
            for x in range(0, width, chunk_size):
                chunk_w = min(chunk_size, width - x)
                chunk_h = min(chunk_size, height - y)

                data = band.ReadAsArray(x, y, chunk_w, chunk_h)

                if nodata is not None:
                    mask = data != nodata
                    valid_data = data[mask]
                else:
                    valid_data = data.flatten()

                if len(valid_data) > 0:
                    sum_vals += np.sum(valid_data)
                    sum_sq += np.sum(valid_data ** 2)
                    valid_count += len(valid_data)
                    min_val = min(min_val, np.min(valid_data))
                    max_val = max(max_val, np.max(valid_data))

                    if len(all_valid) < 1000000:
                        all_valid.extend(valid_data[:10000].tolist())

        ds = None

        if valid_count == 0:
            return {
                "mean_value": None,
                "median_value": None,
                "min_value": None,
                "max_value": None,
                "std_value": None,
                "valid_pixels": 0
            }

        mean = sum_vals / valid_count
        variance = (sum_sq / valid_count) - (mean ** 2)
        std = np.sqrt(max(0, variance))

        median = np.median(all_valid) if all_valid else mean

        return {
            "mean_value": float(mean),
            "median_value": float(median),
            "min_value": float(min_val),
            "max_value": float(max_val),
            "std_value": float(std),
            "valid_pixels": int(valid_count)
        }

    def _calculate_statistics_with_polygon_chunked(
        self,
        ds: gdal.Dataset,
        band: gdal.Band,
        polygon_wkt: str,
        nodata: float
    ) -> Dict[str, Any]:
        """分块 + 多边形裁剪的统计计算"""
        transform = ds.GetGeoTransform()
        projection = ds.GetProjection()

        srs = osr.SpatialReference(wkt=projection)
        poly_srs = osr.SpatialReference()
        poly_srs.ImportFromEPSG(4326)

        transform_coord = None
        if not srs.IsSame(poly_srs):
            transform_coord = osr.CoordinateTransformation(poly_srs, srs)

        geom = ogr.CreateGeometryFromWkt(polygon_wkt)
        if transform_coord:
            geom.Transform(transform_coord)

        minx, maxx, miny, maxy = geom.GetEnvelope()

        x0 = max(0, int((minx - transform[0]) / transform[1]))
        y0 = max(0, int((maxy - transform[3]) / transform[5]))
        x1 = min(ds.RasterXSize, int((maxx - transform[0]) / transform[1]))
        y1 = min(ds.RasterYSize, int((miny - transform[3]) / transform[5]))

        if x1 <= x0 or y1 <= y0:
            return {
                "mean_value": None,
                "median_value": None,
                "min_value": None,
                "max_value": None,
                "std_value": None,
                "valid_pixels": 0
            }

        width = x1 - x0
        height = y1 - y0

        mem_drv = gdal.GetDriverByName("MEM")
        mem_ds = mem_drv.Create("", width, height, 1, gdal.GDT_Byte)
        mem_ds.SetGeoTransform((minx, transform[1], 0, maxy, 0, transform[5]))
        mem_ds.SetProjection(projection)

        mask_band = mem_ds.GetRasterBand(1)
        mask_band.Fill(0)

        ogr_ds = ogr.GetDriverByName("Memory").CreateDataSource("")
        layer = ogr_ds.CreateLayer("mask", srs=srs, geom_type=ogr.wkbPolygon)
        feat = ogr.Feature(layer.GetLayerDefn())
        feat.SetGeometry(geom)
        layer.CreateFeature(feat)

        gdal.RasterizeLayer(mem_ds, [1], layer, burn_values=[1])

        chunk_size = self.chunk_size
        sum_vals = 0.0
        sum_sq = 0.0
        valid_count = 0
        min_val = float('inf')
        max_val = float('-inf')
        all_valid = []

        for cy in range(0, height, chunk_size):
            for cx in range(0, width, chunk_size):
                cw = min(chunk_size, width - cx)
                ch = min(chunk_size, height - cy)

                data = band.ReadAsArray(x0 + cx, y0 + cy, cw, ch)
                mask_data = mask_band.ReadAsArray(cx, cy, cw, ch)

                if nodata is not None:
                    valid_mask = (mask_data == 1) & (data != nodata)
                else:
                    valid_mask = mask_data == 1

                valid_data = data[valid_mask]

                if len(valid_data) > 0:
                    sum_vals += np.sum(valid_data)
                    sum_sq += np.sum(valid_data ** 2)
                    valid_count += len(valid_data)
                    min_val = min(min_val, np.min(valid_data))
                    max_val = max(max_val, np.max(valid_data))

                    if len(all_valid) < 1000000:
                        all_valid.extend(valid_data[:10000].tolist())

        mem_ds = None
        ogr_ds = None
        ds = None

        if valid_count == 0:
            return {
                "mean_value": None,
                "median_value": None,
                "min_value": None,
                "max_value": None,
                "std_value": None,
                "valid_pixels": 0
            }

        mean = sum_vals / valid_count
        variance = (sum_sq / valid_count) - (mean ** 2)
        std = np.sqrt(max(0, variance))
        median = np.median(all_valid) if all_valid else mean

        return {
            "mean_value": float(mean),
            "median_value": float(median),
            "min_value": float(min_val),
            "max_value": float(max_val),
            "std_value": float(std),
            "valid_pixels": int(valid_count)
        }
