import numpy as np
import os
import uuid

class ElasticitySolver:
    def __init__(self, geometry_type, geometry_params, bc, material, refinement=1):
        self.geometry_type = geometry_type
        self.geometry_params = geometry_params
        self.bc = bc
        self.material = material
        self.refinement = refinement
        self.nodes = []
        self.elements = []
        self.displacements = []
        self.stresses = []
        self.bbox = {'min': [0, 0], 'max': [1, 1]}
        
    def generate_mesh(self):
        self.nodes = []
        self.elements = []
        n = 10 * self.refinement
        
        if self.geometry_type == 'rectangle':
            L = float(self.geometry_params.get('width', 100.0))
            H = float(self.geometry_params.get('height', 50.0))
            x0 = float(self.geometry_params.get('x', 0.0))
            y0 = float(self.geometry_params.get('y', 0.0))
            
            self.bbox = {'min': [x0, y0], 'max': [x0 + L, y0 + H]}
            
            nx = max(5, n)
            ny = max(3, int(n * H / L))
            
            for j in range(ny + 1):
                for i in range(nx + 1):
                    x = x0 + i * L / nx
                    y = y0 + j * H / ny
                    self.nodes.append([x, y])
            
            for j in range(ny):
                for i in range(nx):
                    n1 = j * (nx + 1) + i
                    n2 = n1 + 1
                    n3 = n1 + (nx + 1) + 1
                    n4 = n1 + (nx + 1)
                    self.elements.append([n1, n2, n3])
                    self.elements.append([n1, n3, n4])
                    
        elif self.geometry_type == 'circle':
            R = float(self.geometry_params.get('radius', 50.0))
            cx = float(self.geometry_params.get('center_x', 0.0))
            cy = float(self.geometry_params.get('center_y', 0.0))
            
            self.bbox = {'min': [cx - R, cy - R], 'max': [cx + R, cy + R]}
            
            self.nodes.append([cx, cy])
            
            num_rings = max(3, n // 2)
            ring_node_counts = []
            ring_node_starts = [1]
            
            for ring in range(1, num_rings + 1):
                r = R * ring / num_rings
                num_points = max(8, 8 * ring)
                ring_node_counts.append(num_points)
                
                for i in range(num_points):
                    theta = 2 * np.pi * i / num_points
                    x = cx + r * np.cos(theta)
                    y = cy + r * np.sin(theta)
                    self.nodes.append([x, y])
                
                if ring < num_rings:
                    ring_node_starts.append(len(self.nodes))
            
            for ring in range(num_rings):
                outer_start = ring_node_starts[ring]
                outer_count = ring_node_counts[ring]
                
                if ring == 0:
                    for i in range(outer_count):
                        next_i = (i + 1) % outer_count
                        self.elements.append([0, outer_start + i, outer_start + next_i])
                else:
                    inner_start = ring_node_starts[ring - 1]
                    inner_count = ring_node_counts[ring - 1]
                    
                    for i in range(outer_count):
                        inner_i = int(i * inner_count / outer_count) % inner_count
                        next_inner_i = int((i + 1) * inner_count / outer_count) % inner_count
                        next_i = (i + 1) % outer_count
                        
                        self.elements.append([
                            inner_start + inner_i,
                            outer_start + i,
                            outer_start + next_i
                        ])
                        if next_inner_i != inner_i:
                            self.elements.append([
                                inner_start + inner_i,
                                inner_start + next_inner_i,
                                outer_start + next_i
                            ])
        
        self.nodes = np.array(self.nodes, dtype=np.float64)
        self.elements = np.array(self.elements, dtype=np.int32)
        return len(self.nodes), len(self.elements)
    
    def find_boundary_nodes(self, edge):
        if len(self.nodes) == 0:
            return []
        
        coords = self.nodes
        bbox_size = max(self.bbox['max'][0] - self.bbox['min'][0], 
                        self.bbox['max'][1] - self.bbox['min'][1])
        tol = bbox_size * 1e-3
        
        if self.geometry_type == 'rectangle':
            L = float(self.geometry_params.get('width', 100.0))
            H = float(self.geometry_params.get('height', 50.0))
            x0 = float(self.geometry_params.get('x', 0.0))
            y0 = float(self.geometry_params.get('y', 0.0))
            
            x_coords = coords[:, 0]
            y_coords = coords[:, 1]
            
            if edge == 'left':
                return np.where(np.abs(x_coords - x0) < tol)[0]
            elif edge == 'right':
                return np.where(np.abs(x_coords - (x0 + L)) < tol)[0]
            elif edge == 'bottom':
                return np.where(np.abs(y_coords - y0) < tol)[0]
            elif edge == 'top':
                return np.where(np.abs(y_coords - (y0 + H)) < tol)[0]
                
        elif self.geometry_type == 'circle':
            R = float(self.geometry_params.get('radius', 50.0))
            cx = float(self.geometry_params.get('center_x', 0.0))
            cy = float(self.geometry_params.get('center_y', 0.0))
            
            dx = coords[:, 0] - cx
            dy = coords[:, 1] - cy
            dist = np.sqrt(dx**2 + dy**2)
            
            if edge == 'outer':
                return np.where(np.abs(dist - R) < tol)[0]
            elif edge == 'inner':
                return np.where(dist < tol * 5)[0]
        
        return []
    
    def apply_boundary_conditions(self, K, F):
        for bc_item in self.bc:
            bc_type = bc_item.get('type', '')
            edge = bc_item.get('edge', '')
            value = float(bc_item.get('value', 0.0))
            
            nodes = self.find_boundary_nodes(edge)
            
            if len(nodes) == 0:
                continue
            
            if bc_type == 'fixed':
                for node in nodes:
                    for dof in [0, 1]:
                        idx = 2 * node + dof
                        K[idx, :] = 0
                        K[:, idx] = 0
                        K[idx, idx] = 1.0
                        F[idx] = 0.0
            elif bc_type == 'force':
                direction = bc_item.get('direction', 'y')
                force_per_node = value / max(1, len(nodes))
                for node in nodes:
                    if direction == 'x':
                        F[2 * node] += force_per_node
                    else:
                        F[2 * node + 1] += force_per_node
        
        return K, F
    
    def solve(self):
        num_nodes, num_elem = self.generate_mesh()
        num_dofs = 2 * num_nodes
        
        E = float(self.material.get('E', 200e9))
        nu = float(self.material.get('nu', 0.3))
        
        E_scaled = E / 1e12
        F_scale = 1e-6
        
        mu = E_scaled / (2 * (1 + nu))
        lam = E_scaled * nu / ((1 + nu) * (1 - 2 * nu))
        
        K = np.zeros((num_dofs, num_dofs), dtype=np.float64)
        F = np.zeros(num_dofs, dtype=np.float64)
        
        for elem in self.elements:
            n1, n2, n3 = elem
            x1, y1 = self.nodes[n1]
            x2, y2 = self.nodes[n2]
            x3, y3 = self.nodes[n3]
            
            area = 0.5 * abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
            
            if area < 1e-10:
                continue
            
            B = np.zeros((3, 6), dtype=np.float64)
            B[0, 0] = y2 - y3
            B[0, 2] = y3 - y1
            B[0, 4] = y1 - y2
            B[1, 1] = x3 - x2
            B[1, 3] = x1 - x3
            B[1, 5] = x2 - x1
            B[2, 0] = x3 - x2
            B[2, 1] = y2 - y3
            B[2, 2] = x1 - x3
            B[2, 3] = y3 - y1
            B[2, 4] = x2 - x1
            B[2, 5] = y1 - y2
            
            B /= (2 * area)
            
            D = np.array([
                [lam + 2*mu, lam, 0],
                [lam, lam + 2*mu, 0],
                [0, 0, mu]
            ], dtype=np.float64)
            
            k_elem = area * B.T @ D @ B
            
            for i, ni in enumerate(elem):
                for j, nj in enumerate(elem):
                    for di in range(2):
                        for dj in range(2):
                            K[2*ni + di, 2*nj + dj] += k_elem[2*i + di, 2*j + dj]
        
        K, F = self.apply_boundary_conditions(K, F)
        F = F * F_scale
        
        K_diag = np.diag(K)
        zero_rows = np.where(K_diag < 1e-10)[0]
        for idx in zero_rows:
            if F[idx] == 0:
                K[idx, idx] = 1.0
                F[idx] = 0.0
        
        try:
            K_reg = K + 1e-8 * np.eye(num_dofs)
            u = np.linalg.solve(K_reg, F)
        except np.linalg.LinAlgError:
            try:
                u = np.linalg.lstsq(K, F, rcond=1e-8)[0]
            except:
                u = np.zeros(num_dofs, dtype=np.float64)
        
        self.displacements = u.reshape(-1, 2)
        
        stress_scale = 1e12
        self.stresses = np.zeros((len(self.elements), 3), dtype=np.float64)
        for e_idx, elem in enumerate(self.elements):
            n1, n2, n3 = elem
            x1, y1 = self.nodes[n1]
            x2, y2 = self.nodes[n2]
            x3, y3 = self.nodes[n3]
            
            area = 0.5 * abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
            
            if area < 1e-10:
                continue
            
            B = np.zeros((3, 6), dtype=np.float64)
            B[0, 0] = y2 - y3
            B[0, 2] = y3 - y1
            B[0, 4] = y1 - y2
            B[1, 1] = x3 - x2
            B[1, 3] = x1 - x3
            B[1, 5] = x2 - x1
            B[2, 0] = x3 - x2
            B[2, 1] = y2 - y3
            B[2, 2] = x1 - x3
            B[2, 3] = y3 - y1
            B[2, 4] = x2 - x1
            B[2, 5] = y1 - y2
            
            B /= (2 * area)
            
            D = np.array([
                [lam + 2*mu, lam, 0],
                [lam, lam + 2*mu, 0],
                [0, 0, mu]
            ], dtype=np.float64)
            
            u_elem = np.array([
                self.displacements[n1, 0], self.displacements[n1, 1],
                self.displacements[n2, 0], self.displacements[n2, 1],
                self.displacements[n3, 0], self.displacements[n3, 1]
            ], dtype=np.float64)
            
            stress = D @ B @ u_elem
            self.stresses[e_idx] = stress * stress_scale
        
        return {
            'nodes': self.nodes.tolist(),
            'elements': self.elements.tolist(),
            'displacements': self.displacements.tolist(),
            'stresses': self.stresses.tolist(),
            'von_mises': self._compute_von_mises().tolist()
        }
    
    def _compute_von_mises(self):
        s11 = self.stresses[:, 0]
        s22 = self.stresses[:, 1]
        s12 = self.stresses[:, 2]
        return np.sqrt(s11**2 - s11*s22 + s22**2 + 3*s12**2)
    
    def save_vtk(self, output_dir):
        os.makedirs(output_dir, exist_ok=True)
        filename = f'simulation_{uuid.uuid4().hex}.vtk'
        filepath = os.path.join(output_dir, filename)
        
        with open(filepath, 'w') as f:
            f.write('# vtk DataFile Version 3.0\n')
            f.write('Finite Element Results\n')
            f.write('ASCII\n')
            f.write('DATASET UNSTRUCTURED_GRID\n')
            
            f.write(f'POINTS {len(self.nodes)} float\n')
            for node in self.nodes:
                f.write(f'{node[0]} {node[1]} 0\n')
            
            f.write(f'CELLS {len(self.elements)} {4 * len(self.elements)}\n')
            for elem in self.elements:
                f.write(f'3 {elem[0]} {elem[1]} {elem[2]}\n')
            
            f.write(f'CELL_TYPES {len(self.elements)}\n')
            for _ in self.elements:
                f.write('5\n')
            
            f.write(f'POINT_DATA {len(self.nodes)}\n')
            f.write('VECTORS displacement float\n')
            for disp in self.displacements:
                f.write(f'{disp[0]} {disp[1]} 0\n')
            
            f.write(f'CELL_DATA {len(self.elements)}\n')
            f.write('VECTORS stress float\n')
            for stress in self.stresses:
                f.write(f'{stress[0]} {stress[1]} {stress[2]}\n')
            
            f.write('SCALARS von_mises float 1\n')
            f.write('LOOKUP_TABLE default\n')
            vm = self._compute_von_mises()
            for v in vm:
                f.write(f'{v}\n')
        
        return filename
    
    def save_vtu(self, output_dir):
        os.makedirs(output_dir, exist_ok=True)
        filename = f'simulation_{uuid.uuid4().hex}.vtu'
        filepath = os.path.join(output_dir, filename)
        
        von_mises = self._compute_von_mises()
        
        with open(filepath, 'w') as f:
            f.write('<?xml version="1.0"?>\n')
            f.write('<VTKFile type="UnstructuredGrid" version="0.1" byte_order="LittleEndian">\n')
            f.write(f'  <UnstructuredGrid NumberOfPieces="1">\n')
            f.write(f'    <Piece NumberOfPoints="{len(self.nodes)}" NumberOfCells="{len(self.elements)}">\n')
            
            f.write('      <Points>\n')
            f.write('        <DataArray type="Float32" NumberOfComponents="3" format="ascii">\n')
            for node in self.nodes:
                f.write(f'          {node[0]} {node[1]} 0\n')
            f.write('        </DataArray>\n')
            f.write('      </Points>\n')
            
            f.write('      <Cells>\n')
            f.write('        <DataArray type="Int32" Name="connectivity" format="ascii">\n')
            for elem in self.elements:
                f.write(f'          {elem[0]} {elem[1]} {elem[2]}\n')
            f.write('        </DataArray>\n')
            f.write('        <DataArray type="Int32" Name="offsets" format="ascii">\n')
            for i in range(1, len(self.elements) + 1):
                f.write(f'          {i * 3}\n')
            f.write('        </DataArray>\n')
            f.write('        <DataArray type="UInt8" Name="types" format="ascii">\n')
            for _ in self.elements:
                f.write('          5\n')
            f.write('        </DataArray>\n')
            f.write('      </Cells>\n')
            
            f.write('      <PointData>\n')
            f.write('        <DataArray type="Float32" Name="displacement" NumberOfComponents="3" format="ascii">\n')
            for disp in self.displacements:
                f.write(f'          {disp[0]} {disp[1]} 0\n')
            f.write('        </DataArray>\n')
            f.write('      </PointData>\n')
            
            f.write('      <CellData>\n')
            f.write('        <DataArray type="Float32" Name="stress" NumberOfComponents="3" format="ascii">\n')
            for stress in self.stresses:
                f.write(f'          {stress[0]} {stress[1]} {stress[2]}\n')
            f.write('        </DataArray>\n')
            f.write('        <DataArray type="Float32" Name="von_mises" format="ascii">\n')
            for vm in von_mises:
                f.write(f'          {vm}\n')
            f.write('        </DataArray>\n')
            f.write('      </CellData>\n')
            
            f.write('    </Piece>\n')
            f.write('  </UnstructuredGrid>\n')
            f.write('</VTKFile>\n')
        
        return filename
    
    def solve_transient(self, num_steps=10):
        results = []
        original_bc = self.bc.copy()
        
        for step in range(num_steps + 1):
            factor = step / num_steps
            
            self.bc = []
            for bc_item in original_bc:
                new_bc = bc_item.copy()
                if bc_item.get('type') == 'force':
                    new_bc['value'] = bc_item['value'] * factor
                self.bc.append(new_bc)
            
            result = self.solve()
            result['time_step'] = step
            result['load_factor'] = factor
            results.append(result)
        
        self.bc = original_bc
        return results

def run_simulation(data):
    solver = ElasticitySolver(
        geometry_type=data['geometry_type'],
        geometry_params=data['geometry_params'],
        bc=data['boundary_conditions'],
        material=data['material_properties'],
        refinement=int(data.get('mesh_refinement', 1))
    )
    
    transient = data.get('transient', False)
    num_steps = data.get('num_steps', 10)
    
    if transient:
        results = solver.solve_transient(num_steps)
        vtk_file = solver.save_vtk('results')
        vtu_file = solver.save_vtu('results')
        return {
            'status': 'completed',
            'results': results,
            'result': results[-1],
            'vtk_file': vtk_file,
            'vtu_file': vtu_file
        }
    else:
        result = solver.solve()
        vtk_file = solver.save_vtk('results')
        vtu_file = solver.save_vtu('results')
        return {
            'status': 'completed',
            'result': result,
            'vtk_file': vtk_file,
            'vtu_file': vtu_file
        }
