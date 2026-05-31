import os
import numpy as np
from io import BytesIO
from osgeo import gdal
from PIL import Image, ImageDraw
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap


class TileServer:
    def __init__(self):
        self.cmaps = {
            'ndvi': self._create_ndvi_colormap(),
            'evi': self._create_evi_colormap(),
            'ndwi': self._create_ndwi_colormap()
        }

    def _create_ndvi_colormap(self):
        colors = [
            (0.96, 0.26, 0.21),
            (0.98, 0.92, 0.23),
            (0.30, 0.69, 0.31)
        ]
        return LinearSegmentedColormap.from_list('ndvi', colors, N=256)

    def _create_evi_colormap(self):
        colors = [
            (0.94, 0.98, 0.91),
            (0.80, 0.92, 0.77),
            (0.48, 0.80, 0.77),
            (0.17, 0.55, 0.75),
            (0.03, 0.25, 0.51)
        ]
        return LinearSegmentedColormap.from_list('evi', colors, N=256)

    def _create_ndwi_colormap(self):
        colors = [
            (0.97, 0.98, 1.00),
            (0.87, 0.92, 0.97),
            (0.62, 0.79, 0.88),
            (0.19, 0.51, 0.74),
            (0.03, 0.32, 0.61)
        ]
        return LinearSegmentedColormap.from_list('ndwi', colors, N=256)

    def generate_tile(self, raster_path, tile_size=256):
        ds = gdal.Open(raster_path)
        if ds is None:
            return None

        band = ds.GetRasterBand(1)
        data = band.ReadAsArray()
        nodata = band.GetNoDataValue()

        if nodata is not None:
            mask = data != nodata
            data = np.ma.masked_where(~mask, data)
        else:
            mask = np.ones_like(data, dtype=bool)

        data_normalized = np.clip((data + 1) / 2, 0, 1)

        index_type = os.path.basename(raster_path).split('_')[0].lower()
        cmap = self.cmaps.get(index_type, plt.cm.viridis)

        rgba_data = np.zeros((data.shape[0], data.shape[1], 4), dtype=np.uint8)

        colored = cmap(data_normalized)
        rgba_data[:, :, 0] = (colored[:, :, 0] * 255).astype(np.uint8)
        rgba_data[:, :, 1] = (colored[:, :, 1] * 255).astype(np.uint8)
        rgba_data[:, :, 2] = (colored[:, :, 2] * 255).astype(np.uint8)
        rgba_data[:, :, 3] = (mask * 255).astype(np.uint8)

        img = Image.fromarray(rgba_data, 'RGBA')
        img = img.resize((tile_size, tile_size), Image.Resampling.LANCZOS)

        buffer = BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)

        ds = None

        return buffer.getvalue()

    def get_overview_image(self, raster_path, index_type):
        ds = gdal.Open(raster_path)
        if ds is None:
            return None

        band = ds.GetRasterBand(1)
        data = band.ReadAsArray()
        nodata = band.GetNoDataValue()

        transform = ds.GetGeoTransform()
        minx = transform[0]
        maxy = transform[3]
        maxx = minx + ds.RasterXSize * transform[1]
        miny = maxy + ds.RasterYSize * transform[5]
        bbox = [minx, miny, maxx, maxy]

        if nodata is not None:
            mask = data != nodata
            data = np.ma.masked_where(~mask, data)
        else:
            mask = np.ones_like(data, dtype=bool)

        data_normalized = np.clip((data + 1) / 2, 0, 1)
        cmap = self.cmaps.get(index_type, plt.cm.viridis)

        rgba_data = np.zeros((data.shape[0], data.shape[1], 4), dtype=np.uint8)
        colored = cmap(data_normalized)
        rgba_data[:, :, 0] = (colored[:, :, 0] * 255).astype(np.uint8)
        rgba_data[:, :, 1] = (colored[:, :, 1] * 255).astype(np.uint8)
        rgba_data[:, :, 2] = (colored[:, :, 2] * 255).astype(np.uint8)
        rgba_data[:, :, 3] = (mask * 255).astype(np.uint8)

        ds = None

        return {
            'image': rgba_data,
            'bbox': bbox,
            'width': rgba_data.shape[1],
            'height': rgba_data.shape[0]
        }


tile_server = TileServer()
