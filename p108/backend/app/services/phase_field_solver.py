import numpy as np
import os
from typing import Tuple, Dict, Any, List, Optional


class Grain:
    """单个晶粒的信息"""
    def __init__(self, grain_id: int, center: Tuple[int, int, int], 
                 orientation: float = 0.0, radius: int = 3):
        self.id = grain_id
        self.center = center
        self.orientation = orientation
        self.radius = radius


class PhaseFieldSolver3D:
    """
    3D 相场模型求解器 - 支持多晶生长
    
    特性:
    - 多晶生长竞争（多个晶核，不同取向）
    - 自适应时间步长
    - Marching Cubes等值面提取
    - OBJ序列导出
    """
    
    def __init__(
        self,
        grid_size: int = 64,
        undercooling: float = 0.5,
        anisotropy: float = 0.04,
        anisotropy_mode: int = 4,
        interface_width: float = 3.0,
        mobility: float = 1.0,
        dx: float = 1.0,
        dt: float = None,
        adaptive_dt: bool = True,
        cfl_coeff: float = 0.25,
        num_grains: int = 1,
        grain_radius: int = 3,
        random_orientation: bool = True,
        export_dir: Optional[str] = None
    ):
        self.N = grid_size
        self.undercooling = undercooling
        self.anisotropy = anisotropy
        self.anisotropy_mode = anisotropy_mode
        self.interface_width = interface_width
        self.mobility = mobility
        self.dx = dx
        self.adaptive_dt = adaptive_dt
        self.cfl_coeff = cfl_coeff
        self.num_grains = num_grains
        self.grain_radius = grain_radius
        self.random_orientation = random_orientation
        
        self.epsilon = interface_width / (2 * np.sqrt(2))
        self.tau = self.epsilon ** 2
        
        self.dt = dt if dt is not None else self._calculate_stable_dt()
        
        self.phi = None
        self.grain_ids = None
        self.temperature = None
        self.grains: List[Grain] = []
        self.step_count = 0
        
        self.export_dir = export_dir
        self.export_enabled = export_dir is not None
        if self.export_enabled:
            os.makedirs(export_dir, exist_ok=True)
        
        self._initialize_fields()
    
    def _calculate_stable_dt(self) -> float:
        """基于扩散稳定性条件计算最大时间步长"""
        D_max = self.mobility * self.epsilon ** 2 / self.tau
        dt_stable = self.cfl_coeff * (self.dx ** 2) / (6 * D_max)
        return min(dt_stable, 0.01)
    
    def _initialize_fields(self):
        """初始化多晶相场和温度场"""
        self.phi = np.zeros((self.N, self.N, self.N), dtype=np.float32)
        self.grain_ids = np.zeros((self.N, self.N, self.N), dtype=np.int32)
        self.temperature = np.full((self.N, self.N, self.N), 
                                    self.undercooling, dtype=np.float32)
        
        self.grains = []
        self._create_grains()
        self.step_count = 0
    
    def _create_grains(self):
        """创建多个晶核"""
        margin = self.N // 6
        min_dist = self.N // (self.num_grains ** (1/3)) * 0.7
        
        rng = np.random.RandomState(42)
        
        for i in range(self.num_grains):
            attempts = 0
            placed = False
            
            while not placed and attempts < 100:
                x = rng.randint(margin, self.N - margin)
                y = rng.randint(margin, self.N - margin)
                z = rng.randint(margin, self.N - margin)
                
                valid = True
                for grain in self.grains:
                    dist = np.sqrt((x - grain.center[0])**2 + 
                                   (y - grain.center[1])**2 + 
                                   (z - grain.center[2])**2)
                    if dist < min_dist:
                        valid = False
                        break
                
                if valid:
                    orientation = rng.uniform(0, 2 * np.pi) if self.random_orientation else 0.0
                    grain = Grain(i + 1, (x, y, z), orientation, self.grain_radius)
                    self.grains.append(grain)
                    self._place_grain(grain)
                    placed = True
                
                attempts += 1
    
    def _place_grain(self, grain: Grain):
        """在网格中放置单个晶核"""
        cx, cy, cz = grain.center
        r = grain.radius
        
        x = np.arange(self.N)[:, None, None]
        y = np.arange(self.N)[None, :, None]
        z = np.arange(self.N)[None, None, :]
        
        dist_sq = (x - cx)**2 + (y - cy)**2 + (z - cz)**2
        mask = dist_sq < r**2
        
        self.phi[mask] = 1.0
        self.grain_ids[mask] = grain.id
    
    def _laplacian_pad(self, f: np.ndarray) -> np.ndarray:
        """使用padding的拉普拉斯计算"""
        f_pad = np.pad(f, pad_width=1, mode='edge')
        
        lap = (
            f_pad[2:, 1:-1, 1:-1] + f_pad[:-2, 1:-1, 1:-1] +
            f_pad[1:-1, 2:, 1:-1] + f_pad[1:-1, :-2, 1:-1] +
            f_pad[1:-1, 1:-1, 2:] + f_pad[1:-1, 1:-1, :-2] -
            6 * f_pad[1:-1, 1:-1, 1:-1]
        ) / (self.dx ** 2)
        
        return lap
    
    def _gradient_pad(self, f: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """使用padding计算梯度"""
        f_pad = np.pad(f, pad_width=1, mode='edge')
        
        grad_x = (f_pad[2:, 1:-1, 1:-1] - f_pad[:-2, 1:-1, 1:-1]) / (2 * self.dx)
        grad_y = (f_pad[1:-1, 2:, 1:-1] - f_pad[1:-1, :-2, 1:-1]) / (2 * self.dx)
        grad_z = (f_pad[1:-1, 1:-1, 2:] - f_pad[1:-1, 1:-1, :-2]) / (2 * self.dx)
        
        return grad_x, grad_y, grad_z
    
    def _anisotropy_factor(self, grad_x: np.ndarray, grad_y: np.ndarray, 
                           grad_z: np.ndarray, grain_id: np.ndarray = None) -> np.ndarray:
        """计算各向异性因子（考虑晶粒取向）"""
        norm_sq = grad_x**2 + grad_y**2 + grad_z**2
        norm = np.sqrt(norm_sq + 1e-12)
        
        nx = grad_x / norm
        ny = grad_y / norm
        nz = grad_z / norm
        
        if grain_id is not None and self.random_orientation:
            orientation_field = np.zeros_like(nx)
            for grain in self.grains:
                mask = grain_id == grain.id
                orientation_field[mask] = grain.orientation
            
            cos_theta = np.cos(orientation_field)
            sin_theta = np.sin(orientation_field)
            
            nx_rot = nx * cos_theta - ny * sin_theta
            ny_rot = nx * sin_theta + ny * cos_theta
            nx, ny = nx_rot, ny_rot
        
        if self.anisotropy_mode == 4:
            aniso = 1 + self.anisotropy * (nx**4 + ny**4 + nz**4 - 0.6)
        elif self.anisotropy_mode == 6:
            aniso = 1 + self.anisotropy * (nx**6 + ny**6 + nz**6 - 3/7)
        else:
            aniso = 1.0
        
        return aniso
    
    def _driving_force(self, phi: np.ndarray, T: np.ndarray) -> np.ndarray:
        """计算驱动力项"""
        T_clamped = np.clip(T, -2.0, 2.0)
        arg = np.clip(50 * T_clamped, -10, 10)
        m = np.arctan(arg) / 0.6267
        m = 1.0 / np.maximum(m, 0.01)
        
        phi_double = phi * (1 - phi)
        well_term = phi - 0.5
        
        return phi_double * (well_term + m)
    
    def _adaptive_time_step(self, dphi_dt: np.ndarray, dT_dt: np.ndarray) -> float:
        """根据CFL条件自适应调整时间步长"""
        if not self.adaptive_dt:
            return self.dt
        
        max_change_phi = np.max(np.abs(dphi_dt))
        max_change_T = np.max(np.abs(dT_dt))
        
        max_allowed = 0.05
        dt_factor = max_allowed / max(max_change_phi, max_change_T, 1e-6)
        dt_factor = min(1.5, max(0.3, dt_factor))
        
        new_dt = self.dt * dt_factor
        new_dt = min(new_dt, self._calculate_stable_dt() * 1.5)
        new_dt = max(new_dt, 1e-5)
        
        self.dt = new_dt
        return new_dt
    
    def step(self) -> Tuple[np.ndarray, float]:
        """执行一个时间步的求解"""
        lap_phi = self._laplacian_pad(self.phi)
        
        grad_x, grad_y, grad_z = self._gradient_pad(self.phi)
        aniso = self._anisotropy_factor(grad_x, grad_y, grad_z, self.grain_ids)
        
        epsilon_eff = self.epsilon * aniso
        driving = self._driving_force(self.phi, self.temperature)
        
        diff_term = epsilon_eff**2 * lap_phi
        
        dphi_dt = (self.mobility / self.tau) * (diff_term + driving)
        
        lap_T = self._laplacian_pad(self.temperature)
        latent_heat = 2.0 * dphi_dt
        dT_dt = lap_T + latent_heat
        
        dt = self._adaptive_time_step(dphi_dt, dT_dt)
        
        phi_new = self.phi + dt * dphi_dt
        phi_new = np.clip(phi_new, 0.0, 1.0)
        
        T_new = self.temperature + dt * dT_dt
        
        max_T_change = np.max(np.abs(T_new - self.temperature))
        if max_T_change > 1.0:
            T_new = self.temperature + np.clip(dt * dT_dt, -0.5, 0.5)
        
        growth_mask = (phi_new > 0.5) & (self.phi <= 0.5)
        if np.any(growth_mask):
            interface_grad = np.abs(dphi_dt)
            for grain in self.grains:
                cx, cy, cz = grain.center
                gx, gy, gz = np.where(growth_mask)
                if len(gx) > 0:
                    dists = (gx - cx)**2 + (gy - cy)**2 + (gz - cz)**2
                    nearest = np.argmin(dists)
                    self.grain_ids[gx[nearest], gy[nearest], gz[nearest]] = grain.id
        
        self.phi = phi_new
        self.temperature = T_new
        self.step_count += 1
        
        free_energy = self._calculate_free_energy()
        
        if self.export_enabled and self.step_count % 5 == 0:
            self.export_obj_frame()
        
        return self.phi.copy(), free_energy
    
    def _calculate_free_energy(self) -> float:
        """计算系统自由能"""
        grad_x, grad_y, grad_z = self._gradient_pad(self.phi)
        grad_sq = grad_x**2 + grad_y**2 + grad_z**2
        
        aniso = self._anisotropy_factor(grad_x, grad_y, grad_z, self.grain_ids)
        
        double_well = self.phi**2 * (1 - self.phi)**2
        
        energy_density = (
            0.5 * (self.epsilon * aniso)**2 * grad_sq +
            double_well +
            self.phi * self.temperature
        )
        
        return float(np.sum(energy_density) * (self.dx ** 3))
    
    def export_obj_frame(self, frame_num: int = None) -> str:
        """导出当前帧为OBJ文件（点云格式，简单可靠）"""
        if frame_num is None:
            frame_num = self.step_count
        
        filename = f"frame_{frame_num:04d}.obj"
        filepath = os.path.join(self.export_dir, filename)
        
        mask = self.phi >= 0.4
        indices = np.where(mask)
        
        n_points = len(indices[0])
        max_export = 50000
        
        if n_points > max_export:
            stride = max(1, n_points // max_export)
            x = indices[0][::stride]
            y = indices[1][::stride]
            z = indices[2][::stride]
            gids = self.grain_ids[x, y, z]
        else:
            x, y, z = indices
            gids = self.grain_ids[mask]
        
        offset = self.N / 2.0
        scale = 1.0
        
        with open(filepath, 'w') as f:
            f.write(f"# Dendrite Growth Frame {frame_num}\n")
            f.write(f"# Grain count: {self.num_grains}\n")
            f.write(f"# Points: {len(x)}\n\n")
            
            for i in range(len(x)):
                px = (x[i] - offset) * scale
                py = (y[i] - offset) * scale
                pz = (z[i] - offset) * scale
                
                gid = gids[i] if i < len(gids) else 0
                hue = (gid * 0.618) % 1.0
                r = int(hue * 255) % 255 / 255.0
                g = int((hue + 0.33) * 255) % 255 / 255.0
                b = int((hue + 0.67) * 255) % 255 / 255.0
                
                f.write(f"v {px:.3f} {py:.3f} {pz:.3f} {r:.3f} {g:.3f} {b:.3f}\n")
            
            f.write("\n")
            
            for i in range(1, len(x) + 1):
                f.write(f"p {i}\n")
        
        return filepath
    
    def get_surface_points(self, threshold: float = 0.3, max_points: int = 15000) -> Dict[str, Any]:
        """获取表面点数据（降采样优化）"""
        phi_mask = (self.phi >= threshold - 0.15) & (self.phi <= threshold + 0.15)
        indices = np.where(phi_mask)
        
        n_points = len(indices[0])
        
        if n_points > max_points:
            stride = max(1, n_points // max_points)
            x = indices[0][::stride]
            y = indices[1][::stride]
            z = indices[2][::stride]
            values = self.phi[x, y, z]
        else:
            x = indices[0]
            y = indices[1]
            z = indices[2]
            values = self.phi[indices]
        
        return {
            'x': x.tolist(),
            'y': y.tolist(),
            'z': z.tolist(),
            'values': values.tolist(),
            'dimensions': [self.N, self.N, self.N],
            'total_points': n_points,
            'rendered_points': len(x),
            'num_grains': self.num_grains
        }
    
    def get_phase_field(self) -> np.ndarray:
        return self.phi.copy()
    
    def get_temperature_field(self) -> np.ndarray:
        return self.temperature.copy()
    
    def get_grain_ids(self) -> np.ndarray:
        return self.grain_ids.copy()
    
    def get_stats(self) -> Dict[str, Any]:
        """获取模拟统计信息"""
        solid_fraction = np.mean(self.phi > 0.5)
        active_grains = np.unique(self.grain_ids[self.phi > 0.5])
        
        return {
            'step': self.step_count,
            'dt': self.dt,
            'solid_fraction': float(solid_fraction),
            'temperature_mean': float(np.mean(self.temperature)),
            'temperature_min': float(np.min(self.temperature)),
            'temperature_max': float(np.max(self.temperature)),
            'active_grains': len(active_grains),
            'total_grains': self.num_grains
        }
