from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import traceback
from lstm_generator import generator

app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok', 'message': 'Accompaniment generator is running'})

@app.route('/generate', methods=['POST'])
def generate():
    try:
        data = request.get_json()
        
        chords = data.get('chords', ['C', 'Am', 'F', 'G'])
        style = data.get('style', 'pop')
        bpm = data.get('bpm', 120)
        length = data.get('length', 8)
        
        if not chords:
            return jsonify({'success': False, 'error': 'No chords provided'}), 400
        
        if style not in ['jazz', 'rock', 'pop']:
            return jsonify({'success': False, 'error': 'Invalid style'}), 400
        
        midi_data, track_info, tracks_data = generator.generate_accompaniment(
            chords=chords,
            style=style,
            bpm=int(bpm),
            length=int(length)
        )
        
        midi_base64 = base64.b64encode(midi_data).decode('utf-8')
        
        tracks = {
            'drums': {
                'notes': track_info['drums']['notes'],
                'type': style
            },
            'bass': {
                'notes': track_info['bass']['notes'],
                'type': style
            },
            'piano': {
                'notes': track_info['piano']['notes'],
                'type': style
            }
        }
        
        return jsonify({
            'success': True,
            'midi_data': midi_base64,
            'tracks': tracks,
            'params': {
                'chords': chords,
                'style': style,
                'bpm': bpm,
                'length': length
            }
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/generate_full', methods=['POST'])
def generate_full():
    try:
        data = request.get_json()
        
        chords = data.get('chords', ['C', 'Am', 'F', 'G'])
        style = data.get('style', 'pop')
        bpm = data.get('bpm', 120)
        length = data.get('length', 8)
        
        if not chords:
            return jsonify({'success': False, 'error': 'No chords provided'}), 400
        
        if style not in ['jazz', 'rock', 'pop']:
            return jsonify({'success': False, 'error': 'Invalid style'}), 400
        
        midi_data, track_info, tracks_data = generator.generate_accompaniment(
            chords=chords,
            style=style,
            bpm=int(bpm),
            length=int(length)
        )
        
        midi_base64 = base64.b64encode(midi_data).decode('utf-8')
        
        tracks = {
            'drums': {
                'notes': track_info['drums']['notes'],
                'type': style
            },
            'bass': {
                'notes': track_info['bass']['notes'],
                'type': style
            },
            'piano': {
                'notes': track_info['piano']['notes'],
                'type': style
            }
        }
        
        return jsonify({
            'success': True,
            'midi_data': midi_base64,
            'tracks': tracks,
            'tracks_data': tracks_data,
            'params': {
                'chords': chords,
                'style': style,
                'bpm': bpm,
                'length': length
            }
        })
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/styles', methods=['GET'])
def get_styles():
    return jsonify({
        'styles': [
            {'id': 'jazz', 'name': '爵士', 'description': 'Walking bass, swing rhythm, comping piano'},
            {'id': 'rock', 'name': '摇滚', 'description': 'Power chords, driving beat, steady bass'},
            {'id': 'pop', 'name': '流行', 'description': 'Catchy rhythms, melodic bass, chordal piano'}
        ]
    })

if __name__ == '__main__':
    print('Starting LSTM Accompaniment Generator...')
    print('Available styles: jazz, rock, pop')
    app.run(host='127.0.0.1', port=5000, debug=False)
