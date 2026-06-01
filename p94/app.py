from flask import Flask, render_template, request, jsonify, send_file
from flask_cors import CORS
import io
from code_generator import generate_c_code
from keil_packer import KeilProjectPacker
from arduino_packer import ArduinoLibraryPacker

app = Flask(__name__)
CORS(app)

packer = KeilProjectPacker()
arduino_packer = ArduinoLibraryPacker()


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/generate', methods=['POST'])
def generate():
    try:
        data = request.get_json()
        xml_content = data.get('xml', '')
        
        if not xml_content:
            return jsonify({
                'success': False,
                'error': 'No XML content provided'
            })
        
        result = generate_c_code(xml_content)
        
        return jsonify({
            'success': result.success,
            'code': result.code,
            'error': result.error,
            'timers': [{'name': t.name, 'preset': t.preset, 'type': t.type} 
                       for t in result.timers.values()],
            'counters': [{'name': c.name, 'preset': c.preset, 'type': c.type} 
                         for c in result.counters.values()],
            'inputs': list(result.inputs),
            'outputs': list(result.outputs),
            'memories': list(result.memories)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })


@app.route('/api/download', methods=['POST'])
def download():
    try:
        data = request.get_json()
        xml_content = data.get('xml', '')
        
        if not xml_content:
            return jsonify({
                'success': False,
                'error': 'No XML content provided'
            }), 400
        
        result = generate_c_code(xml_content)
        
        if not result.success:
            return jsonify({
                'success': False,
                'error': result.error
            }), 400
        
        zip_bytes = packer.generate_keil_project(result.code)
        
        zip_buffer = io.BytesIO(zip_bytes)
        
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name='STM32_Ladder_Project.zip'
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/download_arduino', methods=['POST'])
def download_arduino():
    try:
        data = request.get_json()
        xml_content = data.get('xml', '')
        
        if not xml_content:
            return jsonify({
                'success': False,
                'error': 'No XML content provided'
            }), 400
        
        zip_bytes = arduino_packer.generate_arduino_library(xml_content)
        zip_buffer = io.BytesIO(zip_bytes)
        
        return send_file(
            zip_buffer,
            mimetype='application/zip',
            as_attachment=True,
            download_name='LadderLogic_Arduino.zip'
        )
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'message': 'Ladder Logic Editor API is running'
    })


if __name__ == '__main__':
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   🔧 梯形图编辑器 - STM32 C代码生成器                     ║
    ║                                                           ║
    ║   访问地址: http://localhost:5002                        ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """)
    app.run(host='0.0.0.0', port=5002, debug=True)
