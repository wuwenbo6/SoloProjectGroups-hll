import os
import sys
from flask import Flask, request, jsonify
from flask_cors import CORS

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.dicom_loader import DicomLoader
from services.colormap_service import ColormapService
from services.measurement_service import MeasurementService
from services.rtstruct_exporter import RTSTRUCTExporter


app = Flask(__name__)
CORS(app)

dicom_loader = DicomLoader()
colormap_service = ColormapService()
measurement_service = MeasurementService()
rtstruct_exporter = RTSTRUCTExporter()


@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "message": "DICOM Workstation API running"})


@app.route('/api/load-series', methods=['POST'])
def load_series():
    try:
        data = request.get_json()
        folder_path = data.get('folderPath')
        
        if not folder_path or not os.path.exists(folder_path):
            return jsonify({"error": f"Invalid folder path: {folder_path}"}), 400
        
        series_info = dicom_loader.load_series(folder_path)
        return jsonify(series_info)
        
    except Exception as e:
        print(f"Error loading series: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/slice/<int:index>', methods=['GET'])
def get_slice(index):
    try:
        colormap = request.args.get('colormap', 'gray')
        window_center = request.args.get('windowCenter', type=float)
        window_width = request.args.get('windowWidth', type=float)
        
        pixels = dicom_loader.get_slice_pixels(index)
        if pixels is None:
            return jsonify({"error": f"Slice {index} not found"}), 404
        
        image_data, min_max = colormap_service.apply_colormap(
            pixels,
            colormap=colormap,
            window_center=window_center,
            window_width=window_width
        )
        
        return jsonify({
            "imageData": image_data,
            "minMax": [float(min_max[0]), float(min_max[1])]
        })
        
    except Exception as e:
        print(f"Error getting slice {index}: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/thumbnail/<int:index>', methods=['GET'])
def get_thumbnail(index):
    try:
        pixels = dicom_loader.get_slice_pixels(index)
        if pixels is None:
            return jsonify({"error": f"Slice {index} not found"}), 404
        
        image_data = colormap_service.create_thumbnail(pixels)
        return jsonify({"imageData": image_data})
        
    except Exception as e:
        print(f"Error getting thumbnail {index}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/calculate/area', methods=['POST'])
def calculate_area():
    try:
        data = request.get_json()
        points = data.get('points', [])
        pixel_spacing = data.get('pixelSpacing', [1.0, 1.0])
        
        area = measurement_service.calculate_area(points, tuple(pixel_spacing))
        
        return jsonify({"areaMm2": area})
        
    except Exception as e:
        print(f"Error calculating area: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/calculate/volume', methods=['POST'])
def calculate_volume():
    try:
        data = request.get_json()
        contours = data.get('contours', [])
        pixel_spacing = data.get('pixelSpacing', [1.0, 1.0])
        slice_thickness = data.get('sliceThickness', 1.0)
        
        volume = measurement_service.calculate_volume(
            contours,
            tuple(pixel_spacing),
            float(slice_thickness)
        )
        
        return jsonify({"volumeMm3": volume})
        
    except Exception as e:
        print(f"Error calculating volume: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/export/rtstruct', methods=['POST'])
def export_rtstruct():
    try:
        data = request.get_json()
        series = data.get('series', {})
        rois = data.get('rois', [])
        output_path = data.get('outputPath')
        
        if not output_path:
            return jsonify({"error": "Output path is required"}), 400
        
        result = rtstruct_exporter.export_rtstruct(series, rois, output_path)
        return jsonify(result)
        
    except Exception as e:
        print(f"Error exporting RTSTRUCT: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/clear', methods=['POST'])
def clear_cache():
    dicom_loader.clear_cache()
    return jsonify({"status": "ok"})


if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5000))
    print(f"Starting DICOM Workstation API on port {port}")
    app.run(host='127.0.0.1', port=port, debug=False)
