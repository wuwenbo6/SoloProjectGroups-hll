import os
import io
import base64
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from app import db
from app.models import NodeResult, LinkResult, NetworkNode, NetworkLink

class AnimationExporter:
    def __init__(self, simulation_id):
        self.simulation_id = simulation_id
        self.output_dir = os.path.join(os.path.dirname(__file__), '../../data/animations')
        os.makedirs(self.output_dir, exist_ok=True)
    
    def export_mp4(self, filename=None, fps=5, dpi=100):
        if not filename:
            filename = f"simulation_{self.simulation_id}.mp4"
        
        filepath = os.path.join(self.output_dir, filename)
        
        node_data, timestamps = self._load_node_data()
        link_data = self._load_link_data()
        network_nodes = self._load_network_nodes()
        network_links = self._load_network_links()
        
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10), 
                                       gridspec_kw={'height_ratios': [3, 1]})
        
        scatter = ax1.scatter([], [], c=[], s=100, cmap='jet', 
                               vmin=0, vmax=5, edgecolors='black')
        
        lines = []
        for link in network_links:
            line, = ax1.plot([], [], 'k-', linewidth=2, alpha=0.6)
            lines.append(line)
        
        cbar = plt.colorbar(scatter, ax=ax1, label='水深 (m)')
        
        ax1.set_xlabel('经度')
        ax1.set_ylabel('纬度')
        ax1.set_title('城市排水管网淹没模拟')
        ax1.set_aspect('equal')
        
        time_text = ax1.text(0.02, 0.98, '', transform=ax1.transAxes,
                              verticalalignment='top', fontsize=12,
                              bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        hydrograph_line, = ax2.plot([], [], 'b-', linewidth=2)
        ax2.set_xlabel('时间')
        ax2.set_ylabel('节点最大水深 (m)')
        ax2.set_title('节点最大水深过程线')
        ax2.grid(True, alpha=0.3)
        
        all_x = [n.x_coord for n in network_nodes]
        all_y = [n.y_coord for n in network_nodes]
        ax1.set_xlim(min(all_x) - 0.001, max(all_x) + 0.001)
        ax1.set_ylim(min(all_y) - 0.001, max(all_y) + 0.001)
        
        max_depths = []
        
        def init():
            scatter.set_offsets(np.zeros((0, 2)))
            scatter.set_array(np.array([]))
            for line in lines:
                line.set_data([], [])
            time_text.set_text('')
            hydrograph_line.set_data([], [])
            return scatter, time_text, hydrograph_line, *lines
        
        def update(frame):
            timestamp = timestamps[frame]
            
            coords = []
            depths = []
            for node in network_nodes:
                node_id = node.node_id
                if node_id in node_data and timestamp in node_data[node_id]:
                    coords.append([node.x_coord, node.y_coord])
                    depths.append(node_data[node_id][timestamp])
            
            if coords:
                scatter.set_offsets(np.array(coords))
                scatter.set_array(np.array(depths))
            
            for i, link in enumerate(network_links):
                from_node = next((n for n in network_nodes if n.node_id == link.from_node), None)
                to_node = next((n for n in network_nodes if n.node_id == link.to_node), None)
                if from_node and to_node:
                    lines[i].set_data(
                        [from_node.x_coord, to_node.x_coord],
                        [from_node.y_coord, to_node.y_coord]
                    )
            
            time_str = timestamp.strftime('%Y-%m-%d %H:%M')
            time_text.set_text(f'时间: {time_str}')
            
            max_depth = max(depths) if depths else 0
            max_depths.append(max_depth)
            
            time_indices = list(range(len(max_depths)))
            hydrograph_line.set_data(time_indices, max_depths)
            ax2.set_xlim(0, len(timestamps))
            ax2.set_ylim(0, max(max_depths) * 1.1 if max_depths else 1)
            
            return scatter, time_text, hydrograph_line, *lines
        
        anim = animation.FuncAnimation(fig, update, frames=len(timestamps),
                                        init_func=init, blit=True, interval=1000/fps)
        
        writer = animation.FFMpegWriter(fps=fps, metadata=dict(artist='SWMM Simulator'))
        anim.save(filepath, writer=writer, dpi=dpi)
        
        plt.close(fig)
        
        return {
            'success': True,
            'filepath': filepath,
            'filename': filename,
            'n_frames': len(timestamps),
            'duration': len(timestamps) / fps
        }
    
    def export_gif(self, filename=None, fps=5):
        if not filename:
            filename = f"simulation_{self.simulation_id}.gif"
        
        filepath = os.path.join(self.output_dir, filename)
        
        node_data, timestamps = self._load_node_data()
        network_nodes = self._load_network_nodes()
        
        fig, ax = plt.subplots(figsize=(10, 8))
        
        scatter = ax.scatter([], [], c=[], s=150, cmap='jet', 
                               vmin=0, vmax=5, edgecolors='black')
        plt.colorbar(scatter, ax=ax, label='水深 (m)')
        
        ax.set_xlabel('经度')
        ax.set_ylabel('纬度')
        ax.set_title('排水管网淹没模拟')
        ax.set_aspect('equal')
        
        all_x = [n.x_coord for n in network_nodes]
        all_y = [n.y_coord for n in network_nodes]
        ax.set_xlim(min(all_x) - 0.001, max(all_x) + 0.001)
        ax.set_ylim(min(all_y) - 0.001, max(all_y) + 0.001)
        
        time_text = ax.text(0.02, 0.98, '', transform=ax.transAxes,
                             verticalalignment='top', fontsize=12,
                             bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        def update(frame):
            timestamp = timestamps[frame]
            coords = []
            depths = []
            for node in network_nodes:
                node_id = node.node_id
                if node_id in node_data and timestamp in node_data[node_id]:
                    coords.append([node.x_coord, node.y_coord])
                    depths.append(node_data[node_id][timestamp])
            
            if coords:
                scatter.set_offsets(np.array(coords))
                scatter.set_array(np.array(depths))
            
            time_str = timestamp.strftime('%H:%M')
            time_text.set_text(f'时间: {time_str}')
            return scatter, time_text
        
        anim = animation.FuncAnimation(fig, update, frames=len(timestamps),
                                        blit=True, interval=1000/fps)
        
        anim.save(filepath, writer='pillow', fps=fps)
        plt.close(fig)
        
        return {
            'success': True,
            'filepath': filepath,
            'filename': filename
        }
    
    def _load_node_data(self):
        results = NodeResult.query.filter_by(simulation_id=self.simulation_id).all()
        
        node_data = {}
        timestamps = set()
        
        for r in results:
            if r.node_id not in node_data:
                node_data[r.node_id] = {}
            node_data[r.node_id][r.timestamp] = r.depth
            timestamps.add(r.timestamp)
        
        timestamps = sorted(list(timestamps))
        return node_data, timestamps
    
    def _load_link_data(self):
        results = LinkResult.query.filter_by(simulation_id=self.simulation_id).all()
        
        link_data = {}
        for r in results:
            if r.link_id not in link_data:
                link_data[r.link_id] = {}
            link_data[r.link_id][r.timestamp] = {
                'flow': r.flow,
                'velocity': r.velocity
            }
        
        return link_data
    
    def _load_network_nodes(self):
        return NetworkNode.query.all()
    
    def _load_network_links(self):
        return NetworkLink.query.all()
    
    def get_animation_base64(self, filename):
        filepath = os.path.join(self.output_dir, filename)
        if not os.path.exists(filepath):
            return None
        
        with open(filepath, 'rb') as f:
            return base64.b64encode(f.read()).decode('utf-8')
