import asyncio
import json
import os
import zipfile
from typing import Optional, Dict, Any
from fastapi import WebSocket, WebSocketDisconnect

from .phase_field_solver import PhaseFieldSolver3D


class SimulationService:
    """模拟服务 - 管理相场模拟的生命周期和WebSocket通信"""
    
    def __init__(self):
        self.active_simulations: Dict[str, Dict[str, Any]] = {}
        self.export_base_dir = "exports"
        os.makedirs(self.export_base_dir, exist_ok=True)
    
    async def start_simulation(
        self,
        websocket: WebSocket,
        params: Dict[str, Any]
    ):
        """启动模拟会话"""
        sim_id = str(id(websocket))
        
        try:
            export_enabled = params.get('export_obj', False)
            export_dir = None
            if export_enabled:
                export_dir = os.path.join(self.export_base_dir, f"sim_{sim_id}")
                os.makedirs(export_dir, exist_ok=True)
            
            solver = PhaseFieldSolver3D(
                grid_size=params.get('grid_size', 64),
                undercooling=params.get('undercooling', 0.5),
                anisotropy=params.get('anisotropy', 0.04),
                anisotropy_mode=params.get('anisotropy_mode', 4),
                interface_width=params.get('interface_width', 3.0),
                mobility=params.get('mobility', 1.0),
                num_grains=params.get('num_grains', 1),
                grain_radius=params.get('grain_radius', 3),
                random_orientation=params.get('random_orientation', True),
                export_dir=export_dir
            )
            
            self.active_simulations[sim_id] = {
                'solver': solver,
                'is_paused': False,
                'is_running': True,
                'current_step': 0,
                'total_steps': params.get('total_steps', 200),
                'export_dir': export_dir
            }
            
            await websocket.send_json({
                'type': 'init',
                'data': {
                    'dimensions': [solver.N, solver.N, solver.N],
                    'total_steps': self.active_simulations[sim_id]['total_steps'],
                    'num_grains': solver.num_grains
                }
            })
            
            await self._run_simulation_loop(websocket, sim_id)
            
        except Exception as e:
            await websocket.send_json({
                'type': 'error',
                'data': {'message': str(e)}
            })
        finally:
            if sim_id in self.active_simulations:
                del self.active_simulations[sim_id]
    
    async def _run_simulation_loop(self, websocket: WebSocket, sim_id: str):
        """运行模拟主循环"""
        sim = self.active_simulations.get(sim_id)
        if not sim:
            return
        
        solver: PhaseFieldSolver3D = sim['solver']
        total_steps = sim['total_steps']
        
        while sim['is_running'] and sim['current_step'] < total_steps:
            if sim['is_paused']:
                await asyncio.sleep(0.1)
                continue
            
            try:
                phi, free_energy = solver.step()
                sim['current_step'] += 1
                
                if sim['current_step'] % 3 == 0 or sim['current_step'] == total_steps:
                    surface_data = solver.get_surface_points(threshold=0.4, max_points=12000)
                    stats = solver.get_stats()
                    
                    await websocket.send_json({
                        'type': 'step',
                        'step': sim['current_step'],
                        'data': {
                            'surface': surface_data,
                            'free_energy': free_energy,
                            'progress': sim['current_step'] / total_steps,
                            'dt': solver.dt,
                            'stats': stats
                        }
                    })
                
                try:
                    data = await asyncio.wait_for(websocket.receive_text(), timeout=0.001)
                    msg = json.loads(data)
                    await self._handle_control_message(sim_id, msg)
                except asyncio.TimeoutError:
                    pass
                
                await asyncio.sleep(0.01)
                
            except WebSocketDisconnect:
                sim['is_running'] = False
                break
            except Exception as e:
                print(f"Simulation error: {e}")
                break
        
        if sim['current_step'] >= total_steps:
            export_info = None
            if sim['export_dir']:
                zip_path = await self._zip_export_frames(sim['export_dir'])
                export_info = {'zip_path': zip_path}
            
            await websocket.send_json({
                'type': 'complete',
                'step': sim['current_step'],
                'data': {
                    'message': 'Simulation completed',
                    'export': export_info
                }
            })
    
    async def _handle_control_message(self, sim_id: str, msg: Dict[str, Any]):
        """处理控制消息"""
        sim = self.active_simulations.get(sim_id)
        if not sim:
            return
        
        msg_type = msg.get('type')
        
        if msg_type == 'pause':
            sim['is_paused'] = True
        elif msg_type == 'resume':
            sim['is_paused'] = False
        elif msg_type == 'stop':
            sim['is_running'] = False
        elif msg_type == 'reset':
            sim['is_running'] = False
    
    async def _zip_export_frames(self, export_dir: str) -> str:
        """将导出的OBJ帧打包为ZIP文件"""
        zip_path = f"{export_dir}.zip"
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for root, dirs, files in os.walk(export_dir):
                for file in files:
                    if file.endswith('.obj'):
                        file_path = os.path.join(root, file)
                        arcname = os.path.basename(file_path)
                        zipf.write(file_path, arcname)
        
        return zip_path


simulation_service = SimulationService()
