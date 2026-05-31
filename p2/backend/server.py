import os
import sys
import base64
import io
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from PIL import Image
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import db, CollationRecord
from crnn_model import CRNNRecognizer

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '../data')
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, 'collation.db')
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

recognizer = CRNNRecognizer()

with app.app_context():
    db.create_all()

@app.route('/recognize', methods=['POST'])
def recognize():
    try:
        data = request.json
        image_data = data.get('image_data', '')
        
        if image_data.startswith('data:image'):
            image_data = image_data.split(',')[1]
        
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        
        result = recognizer.recognize(image)
        
        return jsonify({
            'success': True,
            'text': result['text'],
            'confidence': result['confidence'],
            'candidates': result['candidates']
        })
    except Exception as e:
        print(f'Recognition error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

def levenshtein_distance(s1, s2):
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
    
    return previous_row[-1]

def needleman_wunsch_align(seq1, seq2, match_score=1, mismatch_score=-1, gap_score=-2):
    n = len(seq1)
    m = len(seq2)
    
    score_matrix = [[0] * (m + 1) for _ in range(n + 1)]
    
    for i in range(n + 1):
        score_matrix[i][0] = gap_score * i
    for j in range(m + 1):
        score_matrix[0][j] = gap_score * j
    
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            match = score_matrix[i-1][j-1] + (match_score if seq1[i-1] == seq2[j-1] else mismatch_score)
            delete = score_matrix[i-1][j] + gap_score
            insert = score_matrix[i][j-1] + gap_score
            score_matrix[i][j] = max(match, delete, insert)
    
    align1 = []
    align2 = []
    i, j = n, m
    
    while i > 0 or j > 0:
        if i > 0 and j > 0 and score_matrix[i][j] == score_matrix[i-1][j-1] + (match_score if seq1[i-1] == seq2[j-1] else mismatch_score):
            align1.append(seq1[i-1])
            align2.append(seq2[j-1])
            i -= 1
            j -= 1
        elif i > 0 and score_matrix[i][j] == score_matrix[i-1][j] + gap_score:
            align1.append(seq1[i-1])
            align2.append('□')
            i -= 1
        else:
            align1.append('□')
            align2.append(seq2[j-1])
            j -= 1
    
    return ''.join(reversed(align1)), ''.join(reversed(align2))

def multi_sequence_alignment(texts):
    if len(texts) < 2:
        return texts
    
    aligned = [texts[0]]
    for i in range(1, len(texts)):
        ref = aligned[0]
        current = texts[i]
        align_ref, align_current = needleman_wunsch_align(ref, current)
        
        if len(align_ref) > len(ref):
            for j in range(len(aligned)):
                aligned[j] = align_ref.replace(aligned[j], aligned[j])
        
        aligned.append(align_current)
    
    max_len = max(len(t) for t in aligned)
    result = []
    for text in aligned:
        if len(text) < max_len:
            result.append(text + '□' * (max_len - len(text)))
        else:
            result.append(text)
    
    return result

@app.route('/compare', methods=['POST'])
def compare_versions():
    try:
        data = request.json
        texts = data.get('texts', [])
        
        if len(texts) < 2:
            return jsonify({'success': False, 'error': 'At least 2 versions required'}), 400
        
        aligned_texts = multi_sequence_alignment(texts)
        print(f'Original lengths: {[len(t) for t in texts]}')
        print(f'Aligned lengths: {[len(t) for t in aligned_texts]}')
        
        differences = []
        max_len = max(len(t) for t in aligned_texts)
        
        for i in range(max_len):
            chars_at_pos = []
            has_content = False
            for text in aligned_texts:
                if i < len(text):
                    char = text[i]
                    chars_at_pos.append(char)
                    if char != '□':
                        has_content = True
                else:
                    chars_at_pos.append('')
            
            if has_content:
                unique_chars = set(c for c in chars_at_pos if c and c != '□')
                if len(unique_chars) > 1:
                    differences.append({
                        'position': i,
                        'versions': chars_at_pos,
                        'is_gap': any(c == '□' for c in chars_at_pos)
                    })
        
        aligned_versions = []
        for i, text in enumerate(aligned_texts):
            aligned_versions.append({
                'original': texts[i],
                'aligned': text,
                'edit_distance': levenshtein_distance(texts[0], texts[i]) if i > 0 else 0
            })
        
        return jsonify({
            'success': True,
            'versions': aligned_versions,
            'differences': differences,
            'total_differences': len(differences),
            'alignment_method': 'Needleman-Wunsch'
        })
    except Exception as e:
        print(f'Comparison error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/collation/save', methods=['POST'])
def save_collation():
    try:
        data = request.json
        
        collation = CollationRecord(
            title=data.get('title', 'Untitled'),
            versions=json.dumps(data.get('versions', [])),
            note=data.get('note', ''),
            created_at=datetime.fromisoformat(data.get('created_at', datetime.now().isoformat()))
        )
        
        db.session.add(collation)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'id': collation.id
        })
    except Exception as e:
        print(f'Save collation error: {e}')
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/collation/list', methods=['GET'])
def list_collations():
    try:
        collations = CollationRecord.query.order_by(CollationRecord.created_at.desc()).all()
        
        result = []
        for c in collations:
            result.append({
                'id': c.id,
                'title': c.title,
                'note': c.note,
                'created_at': c.created_at.isoformat()
            })
        
        return jsonify(result)
    except Exception as e:
        print(f'List collations error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/collation/export/<int:collation_id>', methods=['GET'])
def export_collation(collation_id):
    try:
        collation = CollationRecord.query.get(collation_id)
        if not collation:
            return jsonify({'success': False, 'error': 'Collation not found'}), 404
        
        export_format = request.args.get('format', 'txt')
        versions = json.loads(collation.versions)
        
        if export_format == 'txt':
            content = generate_txt_export(collation, versions)
            mimetype = 'text/plain'
            filename = f'collation_{collation_id}.txt'
        elif export_format == 'json':
            content = json.dumps({
                'id': collation.id,
                'title': collation.title,
                'versions': versions,
                'note': collation.note,
                'created_at': collation.created_at.isoformat()
            }, ensure_ascii=False, indent=2)
            mimetype = 'application/json'
            filename = f'collation_{collation_id}.json'
        elif export_format == 'html':
            content = generate_html_export(collation, versions)
            mimetype = 'text/html'
            filename = f'collation_{collation_id}.html'
        else:
            return jsonify({'success': False, 'error': 'Unsupported format'}), 400
        
        buffer = io.BytesIO()
        buffer.write(content.encode('utf-8'))
        buffer.seek(0)
        
        return send_file(
            buffer,
            mimetype=mimetype,
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        print(f'Export collation error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

def generate_txt_export(collation, versions):
    lines = []
    lines.append('=' * 50)
    lines.append(f'校勘记: {collation.title}')
    lines.append(f'生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
    lines.append('=' * 50)
    lines.append('')
    
    for i, v in enumerate(versions, 1):
        lines.append(f'【版本{i}】')
        lines.append(v)
        lines.append('')
    
    lines.append('-' * 50)
    lines.append('【校勘说明】')
    lines.append(collation.note if collation.note else '无')
    lines.append('')
    
    if len(versions) >= 2:
        lines.append('-' * 50)
        lines.append('【差异对比】')
        max_len = max(len(v) for v in versions)
        for i in range(max_len):
            chars = [v[i] if i < len(v) else '□' for v in versions]
            if len(set(chars)) > 1:
                lines.append(f'位置{i+1}: ' + ' | '.join(f'版本{j+1}={c}' for j, c in enumerate(chars)))
    
    return '\n'.join(lines)

def generate_html_export(collation, versions):
    html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>校勘记 - {collation.title}</title>
    <style>
        body {{ font-family: "SimSun", serif; max-width: 800px; margin: 0 auto; padding: 20px; }}
        h1 {{ text-align: center; color: #8B4513; }}
        .version {{ margin: 20px 0; padding: 15px; background: #f5f0e6; border-radius: 8px; }}
        .version h3 {{ color: #5c4033; margin-top: 0; }}
        .note {{ margin: 20px 0; padding: 15px; border: 1px solid #d0c0a8; border-radius: 8px; }}
        .diff {{ color: #c0392b; font-weight: bold; }}
        .footer {{ margin-top: 30px; text-align: center; color: #888; font-size: 12px; }}
    </style>
</head>
<body>
    <h1>{collation.title}</h1>
'''
    
    for i, v in enumerate(versions, 1):
        html += f'<div class="version"><h3>版本{i}</h3><p>{v}</p></div>'
    
    html += f'''
    <div class="note">
        <h3>校勘说明</h3>
        <p>{collation.note if collation.note else '无'}</p>
    </div>
    <div class="footer">
        生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    </div>
</body>
</html>'''
    
    return html

def generate_latex_export(collation, versions):
    diffs = []
    if len(versions) >= 2:
        aligned = multi_sequence_alignment(versions)
        max_len = max(len(v) for v in aligned)
        for i in range(max_len):
            chars = [v[i] if i < len(v) else '□' for v in aligned]
            if len(set(chars)) > 1:
                diffs.append((i, chars))
    
    latex = f'''% !TeX program = xelatex
% !TeX encoding = UTF-8
\\documentclass[12pt,a4paper]{{article}}
\\usepackage{{ctex}}
\\usepackage{{booktabs}}
\\usepackage{{longtable}}
\\usepackage{{geometry}}
\\usepackage{{xcolor}}
\\usepackage{{ulem}}
\\geometry{{margin=2.5cm}}

\\title{{\\heiti \\Huge {collation.title}}}
\\date{{\\today}}

\\begin{{document}}

\\maketitle

\\section*{{版本原文}}

'''
    
    for i, v in enumerate(versions, 1):
        latex += f'\\subsection*{{版本{i}}}\n'
        latex += v + '\n\n'
    
    latex += '''\\section*{校勘记}

\\begin{longtable}{|c|''' + '|l' * len(versions) + '''|p{5cm}|}
\\hline
位置 & ''' + ' & '.join(f'版本{i}' for i in range(1, len(versions)+1)) + ''' & 说明 \\\\
\\hline
\\endfirsthead
\\hline
位置 & ''' + ' & '.join(f'版本{i}' for i in range(1, len(versions)+1)) + ''' & 说明 \\\\
\\hline
\\endhead
'''
    
    if diffs:
        for pos, chars in diffs:
            latex += f'{pos+1} & ' + ' & '.join(f'\\textcolor{{red}}{{{c}}}' if chars.count(c) == 1 else c for c in chars) + ' &  \\\\\n\\hline\n'
    else:
        latex += '\\multicolumn{' + str(len(versions)+2) + '}{|c|}{各版本内容完全一致} \\\\\n\\hline\n'
    
    latex += f'''\\end{{longtable}}

\\section*{{校勘说明}}

{collation.note if collation.note else '无'}

\\vfill
\\begin{{center}}
\\small 校勘系统生成于 \\today
\\end{{center}}

\\end{{document}}
'''
    
    return latex

@app.route('/collation/export/<int:collation_id>/latex', methods=['GET'])
def export_collation_latex(collation_id):
    try:
        collation = CollationRecord.query.get(collation_id)
        if not collation:
            return jsonify({'success': False, 'error': 'Collation not found'}), 404
        
        versions = json.loads(collation.versions)
        content = generate_latex_export(collation, versions)
        
        buffer = io.BytesIO()
        buffer.write(content.encode('utf-8'))
        buffer.seek(0)
        
        return send_file(
            buffer,
            mimetype='text/x-tex',
            as_attachment=True,
            download_name=f'collation_{collation_id}.tex'
        )
    except Exception as e:
        print(f'LaTeX export error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    print('Starting Ancient Text Collation Server...')
    print('CRNN model loaded (demo mode)')
    print('Server running on http://localhost:5001')
    app.run(host='0.0.0.0', port=5001, debug=False)
