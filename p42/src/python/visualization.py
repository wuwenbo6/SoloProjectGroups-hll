import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib import animation
from mpl_toolkits.axes_grid1 import make_axes_locatable


def plot_fields(h, u, v, title=None, save_path=None, show=True):
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    
    im1 = axes[0].imshow(h, cmap='viridis', origin='lower')
    axes[0].set_title('Water Height (h)')
    divider1 = make_axes_locatable(axes[0])
    cax1 = divider1.append_axes("right", size="5%", pad=0.05)
    plt.colorbar(im1, cax=cax1)
    
    im2 = axes[1].imshow(u, cmap='RdBu', origin='lower')
    axes[1].set_title('Velocity u')
    divider2 = make_axes_locatable(axes[1])
    cax2 = divider2.append_axes("right", size="5%", pad=0.05)
    plt.colorbar(im2, cax=cax2)
    
    im3 = axes[2].imshow(v, cmap='RdBu', origin='lower')
    axes[2].set_title('Velocity v')
    divider3 = make_axes_locatable(axes[2])
    cax3 = divider3.append_axes("right", size="5%", pad=0.05)
    plt.colorbar(im3, cax=cax3)
    
    if title:
        fig.suptitle(title, fontsize=14)
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
    
    if show:
        plt.show()
    else:
        plt.close()
    
    return fig, axes


def plot_height_with_quiver(h, u, v, step=5, title=None, save_path=None, show=True):
    ny, nx = h.shape
    x = np.arange(nx)
    y = np.arange(ny)
    X, Y = np.meshgrid(x, y)
    
    fig, ax = plt.subplots(figsize=(10, 8))
    
    im = ax.imshow(h, cmap='viridis', origin='lower', extent=[0, nx, 0, ny])
    ax.quiver(X[::step, ::step], Y[::step, ::step], 
              u[::step, ::step], v[::step, ::step],
              color='white', scale=50)
    
    ax.set_xlabel('X')
    ax.set_ylabel('Y')
    
    divider = make_axes_locatable(ax)
    cax = divider.append_axes("right", size="5%", pad=0.05)
    plt.colorbar(im, cax=cax, label='Water Height')
    
    if title:
        ax.set_title(title)
    
    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path, dpi=150, bbox_inches='tight')
    
    if show:
        plt.show()
    else:
        plt.close()
    
    return fig, ax


def animate_simulation(h_frames, u_frames, v_frames, interval=50, save_path=None):
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    
    im1 = axes[0].imshow(h_frames[0], cmap='viridis', origin='lower')
    axes[0].set_title('Water Height (h)')
    plt.colorbar(im1, ax=axes[0])
    
    im2 = axes[1].imshow(u_frames[0], cmap='RdBu', origin='lower')
    axes[1].set_title('Velocity u')
    plt.colorbar(im2, ax=axes[1])
    
    im3 = axes[2].imshow(v_frames[0], cmap='RdBu', origin='lower')
    axes[2].set_title('Velocity v')
    plt.colorbar(im3, ax=axes[2])
    
    def update(frame):
        im1.set_data(h_frames[frame])
        im2.set_data(u_frames[frame])
        im3.set_data(v_frames[frame])
        fig.suptitle(f'Step {frame}', fontsize=14)
        return im1, im2, im3
    
    anim = animation.FuncAnimation(
        fig, update, frames=len(h_frames),
        interval=interval, blit=True
    )
    
    plt.tight_layout()
    
    if save_path:
        if save_path.endswith('.gif'):
            anim.save(save_path, writer='pillow', fps=10)
        elif save_path.endswith('.mp4'):
            anim.save(save_path, writer='ffmpeg', fps=10)
    
    return anim


class RealtimeVisualizer:
    def __init__(self, title=None, cmap_h='viridis', cmap_uv='RdBu'):
        self.fig, self.axes = plt.subplots(1, 3, figsize=(15, 5))
        
        self.im1 = self.axes[0].imshow(np.zeros((1,1)), cmap=cmap_h, origin='lower')
        self.axes[0].set_title('Water Height (h)')
        self.cbar1 = plt.colorbar(self.im1, ax=self.axes[0])
        
        self.im2 = self.axes[1].imshow(np.zeros((1,1)), cmap=cmap_uv, origin='lower')
        self.axes[1].set_title('Velocity u')
        self.cbar2 = plt.colorbar(self.im2, ax=self.axes[1])
        
        self.im3 = self.axes[2].imshow(np.zeros((1,1)), cmap=cmap_uv, origin='lower')
        self.axes[2].set_title('Velocity v')
        self.cbar3 = plt.colorbar(self.im3, ax=self.axes[2])
        
        self.title_text = self.fig.suptitle(title or 'Step 0', fontsize=14)
        
        plt.tight_layout()
        
        self.h_frames = []
        self.u_frames = []
        self.v_frames = []
        
        self.is_interactive = matplotlib.get_backend() in ['TkAgg', 'Qt5Agg', 'Qt4Agg', 'GTKAgg', 'WXAgg']
        if self.is_interactive:
            plt.ion()
            plt.show(block=False)
    
    def update(self, h, u, v, step=None):
        self.im1.set_data(h)
        self.im1.set_clim(h.min(), h.max())
        
        vlim = max(abs(u.min()), abs(u.max()), abs(v.min()), abs(v.max()))
        self.im2.set_data(u)
        self.im2.set_clim(-vlim, vlim)
        self.im3.set_data(v)
        self.im3.set_clim(-vlim, vlim)
        
        if step is not None:
            self.title_text.set_text(f'Step {step}')
        
        self.h_frames.append(h.copy())
        self.u_frames.append(u.copy())
        self.v_frames.append(v.copy())
        
        if self.is_interactive:
            self.fig.canvas.draw()
            self.fig.canvas.flush_events()
    
    def record_frame(self, h, u, v):
        self.h_frames.append(h.copy())
        self.u_frames.append(u.copy())
        self.v_frames.append(v.copy())
    
    def save_gif(self, filename, fps=10, interval=50):
        if not self.h_frames:
            print("No frames to save!")
            return
        
        fig, axes = plt.subplots(1, 3, figsize=(15, 5))
        
        im1 = axes[0].imshow(self.h_frames[0], cmap='viridis', origin='lower')
        axes[0].set_title('Water Height (h)')
        plt.colorbar(im1, ax=axes[0])
        
        im2 = axes[1].imshow(self.u_frames[0], cmap='RdBu', origin='lower')
        axes[1].set_title('Velocity u')
        plt.colorbar(im2, ax=axes[1])
        
        im3 = axes[2].imshow(self.v_frames[0], cmap='RdBu', origin='lower')
        axes[2].set_title('Velocity v')
        plt.colorbar(im3, ax=axes[2])
        
        def update(frame):
            im1.set_data(self.h_frames[frame])
            im1.set_clim(self.h_frames[frame].min(), self.h_frames[frame].max())
            
            vlim = max(abs(self.u_frames[frame].min()), abs(self.u_frames[frame].max()),
                       abs(self.v_frames[frame].min()), abs(self.v_frames[frame].max()))
            im2.set_data(self.u_frames[frame])
            im2.set_clim(-vlim, vlim)
            im3.set_data(self.v_frames[frame])
            im3.set_clim(-vlim, vlim)
            
            fig.suptitle(f'Step {frame}', fontsize=14)
            return im1, im2, im3
        
        anim = animation.FuncAnimation(
            fig, update, frames=len(self.h_frames),
            interval=interval, blit=True
        )
        
        plt.tight_layout()
        
        if filename.endswith('.gif'):
            anim.save(filename, writer='pillow', fps=fps)
        elif filename.endswith('.mp4'):
            anim.save(filename, writer='ffmpeg', fps=fps)
        
        plt.close(fig)
        print(f"Animation saved to {filename} ({len(self.h_frames)} frames)")
    
    def close(self):
        if self.is_interactive:
            plt.ioff()
        plt.close(self.fig)
    
    def __del__(self):
        try:
            plt.close(self.fig)
        except:
            pass


def run_simulation_with_visualization(solver, num_steps, plot_interval=1,
                                       save_gif_path=None, gif_fps=10):
    """Run simulation with real-time visualization and optional GIF export"""
    viz = RealtimeVisualizer()
    
    try:
        for step in range(num_steps):
            solver.step()
            
            if step % plot_interval == 0:
                h = solver.h
                u = solver.u
                v = solver.v
                viz.update(h, u, v, step=step)
                
                if save_gif_path:
                    viz.record_frame(h, u, v)
        
        if save_gif_path:
            viz.save_gif(save_gif_path, fps=gif_fps)
        
    except KeyboardInterrupt:
        print("\nSimulation interrupted by user")
    finally:
        viz.close()
    
    return solver
