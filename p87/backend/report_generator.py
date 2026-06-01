import csv
import io
from datetime import datetime
from typing import List, Dict, Any
from fastapi.responses import StreamingResponse

def generate_csv_report(results: List[Dict[str, Any]]) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        '标的名称', '期权风格', '期权类型',
        '当前价格 S0', '行权价格 K', '到期时间 T',
        '无风险利率 r', '波动率 σ', '模拟路径数', '时间步数',
        '期权价格', '置信区间下限', '置信区间上限',
        '标准误差', '计算耗时(秒)', '生成时间'
    ])
    
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    for r in results:
        params = r.get('params', {})
        writer.writerow([
            r.get('underlying_name', ''),
            r.get('option_style', ''),
            r.get('option_type', ''),
            params.get('S0', ''),
            params.get('K', ''),
            params.get('T', ''),
            params.get('r', ''),
            params.get('sigma', ''),
            params.get('num_paths', ''),
            params.get('num_steps', ''),
            round(r.get('price', 0), 6),
            round(r.get('ci_lower', 0), 6),
            round(r.get('ci_upper', 0), 6),
            round(r.get('std_error', 0), 8),
            round(r.get('time_taken', 0), 6),
            now
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="option_pricing_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        }
    )

def generate_history_csv_report(records: List[Dict[str, Any]]) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    
    writer.writerow([
        'ID', '标的名称', '期权风格', '期权类型',
        '当前价格 S0', '行权价格 K', '到期时间 T',
        '无风险利率 r', '波动率 σ', '模拟路径数', '时间步数',
        '期权价格', '置信区间下限', '置信区间上限',
        '标准误差', '计算耗时(秒)', '创建时间'
    ])
    
    for r in records:
        writer.writerow([
            r.get('id', ''),
            r.get('underlying_name', ''),
            r.get('option_style', ''),
            r.get('option_type', ''),
            r.get('S0', ''),
            r.get('K', ''),
            r.get('T', ''),
            r.get('r', ''),
            r.get('sigma', ''),
            r.get('num_paths', ''),
            r.get('num_steps', ''),
            round(r.get('price', 0), 6),
            round(r.get('ci_lower', 0), 6),
            round(r.get('ci_upper', 0), 6),
            round(r.get('std_error', 0), 8),
            round(r.get('time_taken', 0), 6),
            r.get('created_at', '')
        ])
    
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="pricing_history_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv"'
        }
    )
