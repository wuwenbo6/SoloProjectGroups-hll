import logging
import json
import os
from datetime import datetime
from typing import Dict, List, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class ReportGenerator:
    def __init__(self, output_dir: str = 'reports'):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
    
    def generate_simulation_report(self, 
                                     simulation: Dict, 
                                     results: pd.DataFrame,
                                     parameters: List[Dict],
                                     format: str = 'html') -> str:
        """生成模拟报告"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"simulation_{simulation.get('id')}_{timestamp}.{format}"
        filepath = os.path.join(self.output_dir, filename)
        
        if format == 'html':
            content = self._generate_html_simulation_report(simulation, results, parameters)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        elif format == 'json':
            content = {
                'simulation': simulation,
                'parameters': parameters,
                'summary': self._calculate_summary(results),
                'generated_at': datetime.now().isoformat()
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(content, f, indent=2, ensure_ascii=False)
        
        logger.info(f"Simulation report generated: {filepath}")
        return filepath
    
    def generate_scenario_comparison_report(self, 
                                             scenarios: List[Dict],
                                             results: Dict[str, pd.DataFrame],
                                             format: str = 'html') -> str:
        """生成情景对比报告"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"scenario_comparison_{timestamp}.{format}"
        filepath = os.path.join(self.output_dir, filename)
        
        if format == 'html':
            content = self._generate_html_scenario_report(scenarios, results)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        
        logger.info(f"Scenario comparison report generated: {filepath}")
        return filepath
    
    def generate_sensitivity_report(self, 
                                     analysis: Dict,
                                     sensitivity_results: List[Dict],
                                     format: str = 'html') -> str:
        """生成敏感度分析报告"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"sensitivity_analysis_{analysis.get('id')}_{timestamp}.{format}"
        filepath = os.path.join(self.output_dir, filename)
        
        if format == 'html':
            content = self._generate_html_sensitivity_report(analysis, sensitivity_results)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        
        logger.info(f"Sensitivity report generated: {filepath}")
        return filepath
    
    def generate_calibration_report(self, 
                                     calibration: Dict,
                                     results: List[Dict],
                                     format: str = 'html') -> str:
        """生成校准报告"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"calibration_{calibration.get('id')}_{timestamp}.{format}"
        filepath = os.path.join(self.output_dir, filename)
        
        if format == 'html':
            content = self._generate_html_calibration_report(calibration, results)
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
        
        logger.info(f"Calibration report generated: {filepath}")
        return filepath
    
    def _calculate_summary(self, results: pd.DataFrame) -> Dict:
        """计算结果摘要统计"""
        variables = ['streamflow', 'sediment_yield', 'nitrate_load', 
                     'phosphorus_load', 'total_nitrogen', 'total_phosphorus']
        
        summary = {}
        for var in variables:
            if var in results.columns:
                values = results[var].dropna()
                summary[var] = {
                    'mean': float(values.mean()),
                    'std': float(values.std()),
                    'min': float(values.min()),
                    'max': float(values.max()),
                    'sum': float(values.sum()),
                    'median': float(values.median())
                }
        
        return summary
    
    def _generate_html_simulation_report(self, 
                                           simulation: Dict, 
                                           results: pd.DataFrame,
                                           parameters: List[Dict]) -> str:
        """生成HTML格式的模拟报告"""
        summary = self._calculate_summary(results)
        
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>模拟报告 - {simulation.get('name')}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }}
        h1 {{ color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }}
        h2 {{ color: #2c5282; margin-top: 30px; }}
        h3 {{ color: #2b6cb0; }}
        .section {{ background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 10px; text-align: left; }}
        th {{ background-color: #4299e1; color: white; }}
        tr:nth-child(even) {{ background-color: #f7fafc; }}
        .info-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }}
        .info-item {{ background: white; padding: 15px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .info-label {{ color: #718096; font-size: 0.875rem; }}
        .info-value {{ color: #2d3748; font-size: 1.25rem; font-weight: 600; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 0.875rem; }}
    </style>
</head>
<body>
    <h1>📊 SWAT模拟报告</h1>
    
    <div class="section">
        <h2>📋 基本信息</h2>
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">模拟名称</div>
                <div class="info-value">{simulation.get('name')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">状态</div>
                <div class="info-value">{simulation.get('status')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">开始日期</div>
                <div class="info-value">{simulation.get('start_date')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">结束日期</div>
                <div class="info-value">{simulation.get('end_date')}</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>⚙️ 模型参数</h2>
        <table>
            <tr>
                <th>参数名称</th>
                <th>参数值</th>
                <th>变化类型</th>
            </tr>
            {''.join([f"<tr><td>{p.get('parameter_name')}</td><td>{p.get('parameter_value')}</td><td>{p.get('change_type')}</td></tr>" for p in parameters])}
        </table>
    </div>
    
    <div class="section">
        <h2>📈 结果汇总</h2>
        <table>
            <tr>
                <th>变量</th>
                <th>均值</th>
                <th>标准差</th>
                <th>最小值</th>
                <th>最大值</th>
                <th>总量</th>
            </tr>
"""
        
        var_names = {
            'streamflow': '径流 (m³/s)',
            'sediment_yield': '泥沙产量 (t)',
            'nitrate_load': '硝氮负荷 (kg)',
            'phosphorus_load': '磷负荷 (kg)',
            'total_nitrogen': '总氮 (kg)',
            'total_phosphorus': '总磷 (kg)'
        }
        
        for var, stats in summary.items():
            html += f"""            <tr>
                <td>{var_names.get(var, var)}</td>
                <td>{stats['mean']:.4f}</td>
                <td>{stats['std']:.4f}</td>
                <td>{stats['min']:.4f}</td>
                <td>{stats['max']:.4f}</td>
                <td>{stats['sum']:.2f}</td>
            </tr>
"""
        
        html += f"""        </table>
    </div>
    
    <div class="footer">
        <p>报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>SWAT水文模拟系统</p>
    </div>
</body>
</html>"""
        
        return html
    
    def _generate_html_scenario_report(self, 
                                         scenarios: List[Dict],
                                         results: Dict[str, pd.DataFrame]) -> str:
        """生成HTML格式的情景对比报告"""
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>情景对比分析报告</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }}
        h1 {{ color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }}
        h2 {{ color: #2c5282; margin-top: 30px; }}
        h3 {{ color: #2b6cb0; }}
        .section {{ background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 10px; text-align: left; }}
        th {{ background-color: #4299e1; color: white; }}
        tr:nth-child(even) {{ background-color: #f7fafc; }}
        .scenario-card {{ background: white; padding: 15px; border-radius: 8px; margin: 10px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .baseline {{ border-left: 4px solid #48bb78; }}
        .scenario-title {{ color: #2d3748; font-weight: 600; font-size: 1.1rem; }}
        .diff-positive {{ color: #c53030; }}
        .diff-negative {{ color: #2f855a; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 0.875rem; }}
    </style>
</head>
<body>
    <h1>🔄 情景对比分析报告</h1>
    
    <div class="section">
        <h2>📋 情景列表</h2>
"""
        
        for scenario in scenarios:
            baseline_class = 'baseline' if scenario.get('is_baseline') else ''
            html += f"""        <div class="scenario-card {baseline_class}">
            <div class="scenario-title">{scenario.get('name')} {'(基准情景)' if scenario.get('is_baseline') else ''}</div>
            <p style="color: #718096; margin: 10px 0;">{scenario.get('description', '无描述')}</p>
            <p><strong>类型:</strong> {scenario.get('scenario_type')}</p>
        </div>
"""
        
        html += """    </div>
    
    <div class="section">
        <h2>📊 对比结果</h2>
        <table>
            <tr>
                <th>情景</th>
                <th>平均径流 (m³/s)</th>
                <th>泥沙总量 (t)</th>
                <th>总氮负荷 (kg)</th>
                <th>总磷负荷 (kg)</th>
            </tr>
"""
        
        baseline_flow = None
        for scenario in scenarios:
            scenario_id = str(scenario.get('id'))
            if scenario_id in results:
                df = results[scenario_id]
                flow_mean = df['streamflow'].mean()
                sediment_sum = df['sediment_yield'].sum()
                tn_sum = df['total_nitrogen'].sum()
                tp_sum = df['total_phosphorus'].sum()
                
                if scenario.get('is_baseline'):
                    baseline_flow = flow_mean
                
                flow_diff = ''
                if baseline_flow and not scenario.get('is_baseline'):
                    diff_pct = (flow_mean - baseline_flow) / baseline_flow * 100
                    diff_class = 'diff-positive' if diff_pct > 0 else 'diff-negative'
                    flow_diff = f' <span class="{diff_class}">({diff_pct:+.1f}%)</span>'
                
                html += f"""            <tr>
                <td>{scenario.get('name')}</td>
                <td>{flow_mean:.4f}{flow_diff}</td>
                <td>{sediment_sum:.2f}</td>
                <td>{tn_sum:.2f}</td>
                <td>{tp_sum:.2f}</td>
            </tr>
"""
        
        html += f"""        </table>
    </div>
    
    <div class="footer">
        <p>报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>SWAT水文模拟系统</p>
    </div>
</body>
</html>"""
        
        return html
    
    def _generate_html_sensitivity_report(self, 
                                            analysis: Dict,
                                            sensitivity_results: List[Dict]) -> str:
        """生成HTML格式的敏感度分析报告"""
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>敏感度分析报告 - {analysis.get('name')}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }}
        h1 {{ color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }}
        h2 {{ color: #2c5282; margin-top: 30px; }}
        h3 {{ color: #2b6cb0; }}
        .section {{ background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 10px; text-align: left; }}
        th {{ background-color: #4299e1; color: white; }}
        tr:nth-child(even) {{ background-color: #f7fafc; }}
        .rank-1 {{ background-color: #fef5f5 !important; }}
        .rank-2 {{ background-color: #fff5f5 !important; }}
        .rank-3 {{ background-color: #fffaf0 !important; }}
        .method-badge {{ display: inline-block; background: #4299e1; color: white; padding: 4px 12px; border-radius: 12px; font-size: 0.875rem; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 0.875rem; }}
        .info-box {{ background: #ebf8ff; padding: 15px; border-radius: 6px; margin: 15px 0; }}
        .info-title {{ color: #2c5282; font-weight: 600; margin-bottom: 8px; }}
    </style>
</head>
<body>
    <h1>🔍 敏感度分析报告</h1>
    
    <div class="section">
        <h2>📋 分析设置</h2>
        <p><strong>分析名称:</strong> {analysis.get('name')}</p>
        <p><strong>方法:</strong> <span class="method-badge">{analysis.get('method')}</span></p>
        <p><strong>目标变量:</strong> {analysis.get('target_variable')}</p>
        <p><strong>样本数:</strong> {analysis.get('n_samples')}</p>
        <p><strong>水平数:</strong> {analysis.get('n_levels')}</p>
        <p><strong>状态:</strong> {analysis.get('status')}</p>
    </div>
    
    <div class="info-box">
        <div class="info-title">📊 Morris方法说明</div>
        <ul>
            <li><strong>μ* (mu-star):</strong> 基本效应的绝对值均值，表示参数总体敏感度</li>
            <li><strong>σ (sigma):</strong> 基本效应的标准差，表示参数间非线性或交互作用程度</li>
            <li><strong>μ (mu):</strong> 基本效应的均值，表示参数影响方向</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>🎯 参数敏感度排序</h2>
        <table>
            <tr>
                <th>排名</th>
                <th>参数</th>
                <th>μ*</th>
                <th>σ</th>
                <th>μ</th>
            </tr>
"""
        
        for result in sorted(sensitivity_results, key=lambda x: x.get('rank', 999)):
            rank = result.get('rank', 0)
            rank_class = f'rank-{rank}' if rank <= 3 else ''
            html += f"""            <tr class="{rank_class}">
                <td>{rank}</td>
                <td>{result.get('parameter_name')}</td>
                <td>{result.get('mu_star', 0):.6f}</td>
                <td>{result.get('sigma', 0):.6f}</td>
                <td>{result.get('mu', 0):.6f}</td>
            </tr>
"""
        
        html += f"""        </table>
    </div>
    
    <div class="section">
        <h2>📌 参数分类</h2>
"""
        
        if len(sensitivity_results) >= 3:
            sorted_results = sorted(sensitivity_results, key=lambda x: x.get('mu_star', 0), reverse=True)
            top_3 = [r.get('parameter_name') for r in sorted_results[:3]]
            html += f"""        <p><strong>高敏感度参数 (前3位):</strong> {', '.join(top_3)}</p>
"""
        
        html += f"""    </div>
    
    <div class="footer">
        <p>报告生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        <p>SWAT水文模拟系统</p>
    </div>
</body>
</html>"""
        
        return html
    
    def _generate_html_calibration_report(self, 
                                           calibration: Dict,
                                           results: List[Dict]) -> str:
        """生成HTML格式的校准报告"""
        best_result = None
        for r in results:
            if r.get('is_best'):
                best_result = r
                break
        
        if best_result is None and results:
            best_result = max(results, key=lambda x: x.get('objective_value', -float('inf')))
        
        html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>参数校准报告 - {calibration.get('name')}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; }}
        h1 {{ color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }}
        h2 {{ color: #2c5282; margin-top: 30px; }}
        .section {{ background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        table {{ width: 100%; border-collapse: collapse; margin: 15px 0; }}
        th, td {{ border: 1px solid #e2e8f0; padding: 10px; text-align: left; }}
        th {{ background-color: #4299e1; color: white; }}
        tr:nth-child(even) {{ background-color: #f7fafc; }}
        .result-box {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 12px; text-align: center; }}
        .result-value {{ font-size: 3rem; font-weight: 700; }}
        .result-label {{ font-size: 1rem; opacity: 0.9; }}
        .metrics-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 20px; }}
        .metric {{ background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .metric-value {{ font-size: 1.5rem; font-weight: 600; color: #2d3748; }}
        .metric-label {{ color: #718096; font-size: 0.875rem; }}
        .footer {{ margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #718096; font-size: 0.875rem; }}
    </style>
</head>
<body>
    <h1>🎯 SUFI-2 参数校准报告</h1>
    
    <div class="section">
        <h2>📋 校准设置</h2>
        <div class="info-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">校准名称</div>
                <div style="font-weight: 600;">{calibration.get('name')}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">算法</div>
                <div style="font-weight: 600;">{calibration.get('algorithm')}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">目标函数</div>
                <div style="font-weight: 600;">{calibration.get('objective_function')}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">总迭代次数</div>
                <div style="font-weight: 600;">{calibration.get('total_iterations')}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">每迭代样本数</div>
                <div style="font-weight: 600;">{calibration.get('n_samples')}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 6px;">
                <div style="color: #718096; font-size: 0.875rem;">状态</div>
                <div style="font-weight: 600;">{calibration.get('status')}</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h2>🏆 最佳结果</h2>
"""
        
        if best_result:
            html += f"""        <div class="result-box">
            <div class="result-value">{best_result.get('objective_value', 0):.4f}</div>
            <div class="result-label">最佳目标函数值 ({calibration.get('objective_function')})</div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric">
                <div class="metric-value">{best_result.get('p_factor', 'N/A'):.3f}</div>
                <div class="metric-label">P-factor (目标 > 0.7)</div>
            </div>
            <div class="metric">
                <div class="metric-value">{best_result.get('r_factor', 'N/A'):.3f}</div>
                <div class="metric-label">R-factor (目标 < 1.0)</div>
            </div>
            <div class="metric">
                <div class="metric-value">{best_result.get('iteration', 0)}</div>
                <div class="metric-label">最佳迭代轮次</div>
            </div>
        </div>
"""
        
        html += """    </div>
    
    <div class="footer">
        <p>报告生成时间: """ + datetime.now().strftime('%Y-%m-%d %H:%M:%S') + """</p>
        <p>SWAT水文模拟系统</p>
    </div>
</body>
</html>"""
        
        return html
