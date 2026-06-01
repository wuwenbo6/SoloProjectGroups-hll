import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class EITVisualizer {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.volumeData = null;
        this.isosurfaceMesh = null;
        this.slicePlanes = { x: null, y: null, z: null };
        this.sliceVisible = { x: false, y: false, z: false };
        this.slicePosition = { x: 0.5, y: 0.5, z: 0.5 };
        this.isovalue = 0.3;
        this.clock = new THREE.Clock();
        
        this.init();
    }
    
    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
        this.camera.position.set(2, 2, 2);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        this.scene.add(directionalLight);
        
        const pointLight = new THREE.PointLight(0xffffff, 0.5);
        pointLight.position.set(-5, -5, -5);
        this.scene.add(pointLight);
        
        this.addAxesHelper();
        this.addBoundingBox();
        
        window.addEventListener('resize', () => this.onResize());
        
        this.animate();
    }
    
    addAxesHelper() {
        const axesHelper = new THREE.AxesHelper(1.5);
        this.scene.add(axesHelper);
    }
    
    addBoundingBox() {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        const edges = new THREE.EdgesGeometry(geometry);
        const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x444444, opacity: 0.5, transparent: true })
        );
        this.scene.add(line);
    }
    
    setVolumeData(volumeData) {
        this.volumeData = volumeData;
        this.updateIsosurface();
        this.updateSlices();
    }
    
    getValue(x, y, z) {
        if (!this.volumeData) return 0;
        
        const { volume, shape } = this.volumeData;
        const [nx, ny, nz] = shape;
        
        const xi = Math.floor(x * (nx - 1));
        const yi = Math.floor(y * (ny - 1));
        const zi = Math.floor(z * (nz - 1));
        
        if (xi < 0 || xi >= nx || yi < 0 || yi >= ny || zi < 0 || zi >= nz) {
            return 0;
        }
        
        return volume[xi][yi][zi];
    }
    
    interpolateValue(x, y, z) {
        if (!this.volumeData) return 0;
        
        const { volume, shape, x_coords, y_coords, z_coords } = this.volumeData;
        const [nx, ny, nz] = shape;
        
        const fx = x * (nx - 1);
        const fy = y * (ny - 1);
        const fz = z * (nz - 1);
        
        const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, nx - 1);
        const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, ny - 1);
        const z0 = Math.floor(fz), z1 = Math.min(z0 + 1, nz - 1);
        
        const xd = fx - x0, yd = fy - y0, zd = fz - z0;
        
        const v000 = volume[x0][y0][z0];
        const v100 = volume[x1][y0][z0];
        const v010 = volume[x0][y1][z0];
        const v110 = volume[x1][y1][z0];
        const v001 = volume[x0][y0][z1];
        const v101 = volume[x1][y0][z1];
        const v011 = volume[x0][y1][z1];
        const v111 = volume[x1][y1][z1];
        
        const v00 = v000 * (1 - xd) + v100 * xd;
        const v10 = v010 * (1 - xd) + v110 * xd;
        const v01 = v001 * (1 - xd) + v101 * xd;
        const v11 = v011 * (1 - xd) + v111 * xd;
        
        const v0 = v00 * (1 - yd) + v10 * yd;
        const v1 = v01 * (1 - yd) + v11 * yd;
        
        return v0 * (1 - zd) + v1 * zd;
    }
    
    updateIsosurface() {
        if (this.isosurfaceMesh) {
            this.scene.remove(this.isosurfaceMesh);
            this.isosurfaceMesh.geometry.dispose();
            this.isosurfaceMesh.material.dispose();
        }
        
        if (!this.volumeData) return;
        
        const geometry = this.createIsosurfaceGeometry();
        
        const material = new THREE.MeshPhongMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            shininess: 100
        });
        
        this.isosurfaceMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.isosurfaceMesh);
    }
    
    createIsosurfaceGeometry() {
        const { shape } = this.volumeData;
        const [nx, ny, nz] = shape;
        const step = 2;
        
        const positions = [];
        const normals = [];
        
        for (let i = 0; i < nx - step; i += step) {
            for (let j = 0; j < ny - step; j += step) {
                for (let k = 0; k < nz - step; k += step) {
                    this.processVoxel(i, j, k, step, positions, normals);
                }
            }
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        
        return geometry;
    }
    
    processVoxel(i, j, k, step, positions, normals) {
        const corners = [];
        for (let di = 0; di <= 1; di++) {
            for (let dj = 0; dj <= 1; dj++) {
                for (let dk = 0; dk <= 1; dk++) {
                    const x = (i + di * step) / (this.volumeData.shape[0] - 1);
                    const y = (j + dj * step) / (this.volumeData.shape[1] - 1);
                    const z = (k + dk * step) / (this.volumeData.shape[2] - 1);
                    corners.push({
                        x, y, z,
                        value: this.interpolateValue(x, y, z)
                    });
                }
            }
        }
        
        this.marchingCubes(corners, positions, normals);
    }
    
    marchingCubes(corners, positions, normals) {
        const cubeIndex = corners.reduce((acc, corner, i) => {
            return acc + (corner.value < this.isovalue ? (1 << i) : 0);
        }, 0);
        
        if (cubeIndex === 0 || cubeIndex === 255) return;
        
        const edgeTable = [
            0x0, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
            0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00,
            0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
            0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
            0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
            0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
            0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
            0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
            0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
            0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
            0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
            0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
            0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
            0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
            0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
            0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
            0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
            0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
            0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
            0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
            0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
            0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
            0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
            0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
            0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
            0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
            0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
            0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
            0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
            0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
            0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
            0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0
        ];
        
        const triTable = [
            [], [0, 8, 3], [0, 1, 9], [1, 8, 3, 9, 8, 1], [1, 2, 10], [0, 8, 3, 1, 2, 10], [9, 2, 10, 0, 2, 9],
            [2, 8, 3, 2, 10, 8, 10, 9, 8], [3, 11, 2], [0, 11, 2, 8, 11, 0], [1, 9, 0, 2, 3, 11],
            [1, 11, 2, 1, 9, 11, 9, 8, 11], [3, 10, 1, 11, 10, 3], [0, 10, 1, 0, 8, 10, 8, 11, 10],
            [3, 9, 0, 3, 11, 9, 11, 10, 9], [9, 8, 10, 10, 8, 11], [4, 7, 8], [4, 3, 0, 7, 3, 4],
            [0, 1, 9, 8, 4, 7], [4, 1, 9, 4, 7, 1, 7, 3, 1], [1, 2, 10, 8, 4, 7], [3, 4, 7, 3, 0, 4, 1, 2, 10],
            [9, 2, 10, 9, 0, 2, 8, 4, 7], [2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4], [8, 4, 7, 3, 11, 2],
            [11, 4, 7, 11, 2, 4, 2, 0, 4], [9, 0, 1, 8, 4, 7, 2, 3, 11], [4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1],
            [3, 10, 1, 3, 11, 10, 7, 8, 4], [1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4],
            [4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3], [4, 7, 11, 4, 11, 9, 9, 11, 10],
            [9, 5, 4], [9, 5, 4, 0, 8, 3], [0, 5, 4, 1, 5, 0], [8, 5, 4, 8, 3, 5, 3, 1, 5],
            [1, 2, 10, 9, 5, 4], [3, 0, 8, 1, 2, 10, 4, 9, 5], [5, 2, 10, 5, 4, 2, 4, 0, 2],
            [2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8], [9, 5, 4, 2, 3, 11], [0, 11, 2, 0, 8, 11, 4, 9, 5],
            [0, 5, 4, 0, 1, 5, 2, 3, 11], [2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5],
            [10, 3, 11, 10, 1, 3, 9, 5, 4], [4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10],
            [5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3], [5, 4, 8, 5, 8, 10, 10, 8, 11],
            [9, 7, 8, 5, 7, 9], [9, 3, 0, 9, 5, 3, 5, 7, 3], [0, 7, 8, 0, 1, 7, 1, 5, 7],
            [1, 5, 3, 3, 5, 7], [9, 7, 8, 9, 5, 7, 10, 1, 2], [10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3],
            [8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2], [2, 10, 5, 2, 5, 3, 3, 5, 7],
            [7, 9, 5, 7, 8, 9, 3, 11, 2], [9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11],
            [2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7], [11, 2, 1, 11, 1, 7, 7, 1, 5],
            [9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11], [5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0],
            [11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0], [7, 11, 10, 7, 10, 5, 5, 10, 8],
            [10, 6, 5], [0, 8, 3, 5, 10, 6], [9, 0, 1, 5, 10, 6], [1, 8, 3, 1, 9, 8, 5, 10, 6],
            [1, 6, 5, 2, 6, 1], [2, 6, 5, 2, 1, 6, 3, 0, 8], [9, 2, 0, 9, 0, 6, 9, 6, 5, 6, 0, 2],
            [6, 5, 9, 6, 9, 2, 6, 2, 8, 2, 9, 3], [2, 3, 11, 10, 6, 5], [11, 0, 8, 11, 2, 0, 10, 6, 5],
            [0, 1, 9, 2, 3, 11, 5, 10, 6], [5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11],
            [6, 3, 11, 6, 5, 3, 5, 1, 3], [0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6],
            [3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9], [6, 5, 9, 6, 9, 11, 11, 9, 8],
            [5, 10, 6, 4, 7, 8], [4, 3, 0, 4, 7, 3, 6, 5, 10], [1, 9, 0, 5, 10, 6, 8, 4, 7],
            [10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4], [6, 1, 2, 6, 5, 1, 4, 7, 8],
            [1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7], [8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6],
            [7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9], [3, 11, 2, 7, 8, 4, 10, 6, 5],
            [5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11], [0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6],
            [9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6], [8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6],
            [5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11],
            [0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7], [6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9],
            [10, 4, 9, 6, 4, 10], [4, 10, 6, 4, 9, 10, 0, 8, 3], [10, 0, 1, 10, 6, 0, 6, 4, 0],
            [8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10], [1, 4, 9, 1, 2, 4, 2, 6, 4],
            [3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4], [0, 2, 4, 4, 2, 6], [8, 3, 2, 8, 2, 4, 4, 2, 6],
            [10, 4, 9, 10, 6, 4, 11, 2, 3], [0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6],
            [3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10], [6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1],
            [9, 6, 4, 9, 3, 6, 9, 1, 3, 8, 6, 3], [10, 1, 0, 10, 0, 6, 6, 0, 4],
            [3, 11, 6, 3, 6, 0, 0, 6, 4], [6, 4, 8, 11, 6, 8], [7, 10, 6, 7, 8, 10, 8, 9, 10],
            [0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10], [10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0],
            [10, 6, 7, 10, 7, 1, 1, 7, 3], [1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7],
            [2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9], [7, 8, 0, 7, 0, 6, 6, 0, 2],
            [7, 3, 2, 6, 7, 2], [2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7],
            [2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7], [1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11],
            [11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1],
            [8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6],
            [0, 9, 1, 11, 6, 7], [7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0], [7, 11, 6],
            [7, 6, 11], [3, 0, 8, 11, 7, 6], [0, 1, 9, 11, 7, 6], [8, 1, 9, 8, 3, 1, 11, 7, 6],
            [10, 1, 2, 6, 11, 7], [1, 2, 10, 3, 0, 8, 6, 11, 7], [2, 9, 0, 2, 10, 9, 6, 11, 7],
            [6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8], [7, 2, 3, 6, 2, 7], [7, 0, 8, 7, 6, 0, 6, 2, 0],
            [2, 7, 6, 2, 3, 7, 0, 1, 9], [1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6],
            [10, 7, 6, 10, 1, 7, 1, 3, 7], [10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8],
            [0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7], [7, 6, 10, 7, 10, 8, 8, 10, 9],
            [6, 8, 4, 11, 8, 6], [3, 6, 11, 3, 0, 6, 0, 4, 6], [8, 6, 11, 8, 4, 6, 9, 0, 1],
            [9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6], [6, 8, 4, 6, 11, 8, 2, 10, 1],
            [1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6], [4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9],
            [10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3], [8, 2, 3, 8, 4, 2, 4, 6, 2],
            [0, 4, 2, 4, 6, 2], [1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8],
            [1, 9, 4, 1, 4, 2, 2, 4, 6], [8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1],
            [10, 1, 0, 10, 0, 6, 6, 0, 4], [4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3],
            [10, 9, 4, 6, 10, 4], [4, 9, 5, 7, 6, 11], [0, 8, 3, 4, 9, 5, 11, 7, 6],
            [5, 0, 1, 5, 4, 0, 7, 6, 11], [11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5],
            [9, 5, 4, 10, 1, 2, 7, 6, 11], [6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5],
            [7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2], [3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6],
            [7, 2, 3, 7, 6, 2, 5, 4, 9], [9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7],
            [3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0], [6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8],
            [9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7],
            [1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4],
            [4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10], [7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10],
            [6, 9, 5, 6, 11, 9, 11, 8, 9], [3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5],
            [0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11], [6, 11, 3, 6, 3, 5, 5, 3, 1],
            [1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6],
            [0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10],
            [11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5],
            [6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3], [5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2],
            [9, 5, 6, 9, 6, 0, 0, 6, 2], [1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8],
            [1, 5, 6, 2, 1, 6], [1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6],
            [10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0], [0, 3, 8, 5, 6, 10],
            [10, 5, 6], [11, 5, 10, 7, 5, 11], [11, 5, 10, 11, 7, 5, 8, 3, 0],
            [5, 11, 7, 5, 10, 11, 1, 9, 0], [10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1],
            [11, 1, 2, 11, 7, 1, 7, 5, 1], [0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11],
            [9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7], [7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2],
            [2, 5, 10, 2, 3, 5, 3, 7, 5], [8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5],
            [9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2],
            [9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2], [1, 3, 5, 3, 7, 5],
            [0, 8, 7, 0, 7, 1, 1, 7, 5], [9, 0, 3, 9, 3, 5, 5, 3, 7], [9, 8, 7, 5, 9, 7],
            [5, 8, 4, 5, 10, 8, 10, 11, 8], [5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0],
            [0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5],
            [10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4], [2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8],
            [0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11],
            [0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5],
            [9, 4, 5, 2, 11, 3], [2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4],
            [5, 10, 2, 5, 2, 4, 4, 2, 0], [3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9],
            [5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2], [8, 4, 5, 8, 5, 3, 5, 10, 3, 1, 3, 1],
            [0, 4, 5, 1, 0, 5], [8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5], [9, 4, 5],
            [4, 11, 7, 4, 9, 11, 9, 10, 11], [0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11],
            [1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11],
            [3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4],
            [4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2],
            [9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3],
            [11, 7, 4, 11, 4, 2, 2, 4, 0], [11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4],
            [2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9],
            [9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7],
            [3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10],
            [1, 10, 2, 8, 7, 4], [4, 9, 1, 4, 1, 7, 7, 1, 3], [4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1],
            [4, 0, 3, 7, 4, 3], [4, 8, 7], [9, 10, 8, 10, 11, 8],
            [3, 0, 9, 3, 9, 11, 11, 9, 10], [0, 1, 10, 0, 10, 8, 8, 10, 11],
            [3, 1, 10, 11, 3, 10], [1, 2, 11, 1, 11, 9, 9, 11, 8],
            [3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9], [0, 2, 11, 8, 0, 11], [3, 2, 11],
            [2, 3, 8, 2, 8, 10, 10, 8, 9], [9, 10, 2, 0, 9, 2], [2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8],
            [1, 10, 2], [1, 3, 8, 9, 1, 8], [0, 9, 1], [0, 3, 8], []
        ];
        
        const edges = edgeTable[cubeIndex];
        if (edges === 0) return;
        
        const vertList = new Array(12);
        
        const edgeConnections = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
        ];
        
        for (let i = 0; i < 12; i++) {
            if (edges & (1 << i)) {
                const [c1, c2] = edgeConnections[i];
                const p1 = corners[c1];
                const p2 = corners[c2];
                
                const t = (this.isovalue - p1.value) / (p2.value - p1.value);
                vertList[i] = {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y),
                    z: p1.z + t * (p2.z - p1.z)
                };
            }
        }
        
        const tri = triTable[cubeIndex];
        for (let i = 0; i < tri.length; i += 3) {
            const v1 = vertList[tri[i]];
            const v2 = vertList[tri[i + 1]];
            const v3 = vertList[tri[i + 2]];
            
            if (v1 && v2 && v3) {
                const nx = (v2.y - v1.y) * (v3.z - v1.z) - (v2.z - v1.z) * (v3.y - v1.y);
                const ny = (v2.z - v1.z) * (v3.x - v1.x) - (v2.x - v1.x) * (v3.z - v1.z);
                const nz = (v2.x - v1.x) * (v3.y - v1.y) - (v2.y - v1.y) * (v3.x - v1.x);
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                
                positions.push(
                    (v1.x - 0.5) * 2, (v1.y - 0.5) * 2, (v1.z - 0.5) * 2,
                    (v2.x - 0.5) * 2, (v2.y - 0.5) * 2, (v2.z - 0.5) * 2,
                    (v3.x - 0.5) * 2, (v3.y - 0.5) * 2, (v3.z - 0.5) * 2
                );
                
                normals.push(
                    nx / len, ny / len, nz / len,
                    nx / len, ny / len, nz / len,
                    nx / len, ny / len, nz / len
                );
            }
        }
    }
    
    setSlice(axis, visible, position = null) {
        if (position !== null) {
            this.slicePosition[axis] = position;
        }
        this.sliceVisible[axis] = visible;
        this.updateSlices();
    }
    
    setSlicePosition(axis, position) {
        this.slicePosition[axis] = position;
        this.updateSlices();
    }
    
    updateSlices() {
        ['x', 'y', 'z'].forEach(axis => {
            if (this.slicePlanes[axis]) {
                this.scene.remove(this.slicePlanes[axis]);
                this.slicePlanes[axis].geometry.dispose();
                this.slicePlanes[axis].material.dispose();
            }
            
            if (this.sliceVisible[axis] && this.volumeData) {
                this.createSlicePlane(axis);
            }
        });
    }
    
    createSlicePlane(axis) {
        const resolution = 64;
        const geometry = new THREE.PlaneGeometry(2, 2, resolution - 1, resolution - 1);
        const positions = geometry.attributes.position.array;
        
        const colors = new Float32Array(positions.length);
        const colorMin = new THREE.Color(0x0000ff);
        const colorMax = new THREE.Color(0xff0000);
        
        for (let i = 0; i < positions.length; i += 3) {
            let x, y, z;
            
            if (axis === 'x') {
                x = this.slicePosition.x;
                y = (positions[i + 1] + 1) / 2;
                z = (positions[i + 2] + 1) / 2;
                positions[i] = (x - 0.5) * 2;
            } else if (axis === 'y') {
                x = (positions[i] + 1) / 2;
                y = this.slicePosition.y;
                z = (positions[i + 2] + 1) / 2;
                positions[i + 1] = (y - 0.5) * 2;
            } else {
                x = (positions[i] + 1) / 2;
                y = (positions[i + 1] + 1) / 2;
                z = this.slicePosition.z;
                positions[i + 2] = (z - 0.5) * 2;
            }
            
            const value = this.interpolateValue(x, y, z);
            const normalizedValue = Math.max(0, Math.min(1, (value + 1) / 2));
            
            const color = new THREE.Color().lerpColors(colorMin, colorMax, normalizedValue);
            colors[i] = color.r;
            colors[i + 1] = color.g;
            colors[i + 2] = color.b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.9
        });
        
        const plane = new THREE.Mesh(geometry, material);
        this.slicePlanes[axis] = plane;
        this.scene.add(plane);
    }
    
    setIsovalue(value) {
        this.isovalue = value;
        this.updateIsosurface();
    }
    
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        this.controls.update(delta);
        
        this.renderer.render(this.scene, this.camera);
    }
    
    destroy() {
        this.renderer.dispose();
        this.container.removeChild(this.renderer.domElement);
    }
}
