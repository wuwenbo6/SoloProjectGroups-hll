class PointCloudViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.pointClouds = {
            source: null,
            target: null,
            transformed: null,
            merged: null
        };
        this.heatmapMesh = null;
        this.heatmapData = null;
        this.currentView = 'both';
        this.heatmapOverlay = false;
        this.animationId = null;

        this.init();
    }

    init() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f1419);

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
        this.camera.position.set(5, 5, 8);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
        }

        this.addLights();
        this.addGridHelper();
        this.addAxesHelper();

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    addLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(10, 10, 10);
        this.scene.add(dirLight);
    }

    addGridHelper() {
        const gridHelper = new THREE.GridHelper(20, 40, 0x333333, 0x222222);
        gridHelper.position.y = -0.01;
        this.scene.add(gridHelper);
    }

    addAxesHelper() {
        const axesHelper = new THREE.AxesHelper(3);
        this.scene.add(axesHelper);
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    clearPointCloud(key) {
        if (this.pointClouds[key]) {
            this.scene.remove(this.pointClouds[key]);
            this.pointClouds[key].geometry.dispose();
            this.pointClouds[key].material.dispose();
            this.pointClouds[key] = null;
        }
    }

    clearAll() {
        Object.keys(this.pointClouds).forEach(key => this.clearPointCloud(key));
        this.clearHeatmap();
    }

    loadPointCloud(points, colors, key, pointSize = 0.02, defaultColor = null) {
        this.clearPointCloud(key);

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(points.length * 3);

        for (let i = 0; i < points.length; i++) {
            positions[i * 3] = points[i][0];
            positions[i * 3 + 1] = points[i][1];
            positions[i * 3 + 2] = points[i][2];
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        if (colors && colors.length > 0) {
            const colorAttr = new Float32Array(colors.length * 3);
            for (let i = 0; i < colors.length; i++) {
                colorAttr[i * 3] = colors[i][0];
                colorAttr[i * 3 + 1] = colors[i][1];
                colorAttr[i * 3 + 2] = colors[i][2];
            }
            geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));
        }

        const material = new THREE.PointsMaterial({
            size: pointSize,
            vertexColors: colors && colors.length > 0,
            color: defaultColor || 0xffffff,
            sizeAttenuation: true
        });

        const pointCloud = new THREE.Points(geometry, material);
        this.pointClouds[key] = pointCloud;
        this.scene.add(pointCloud);

        return pointCloud;
    }

    loadFromData(data, key, defaultColor, pointSize = 0.02) {
        if (!data || !data.points) return;
        return this.loadPointCloud(
            data.points,
            data.colors || [],
            key,
            pointSize,
            defaultColor
        );
    }

    async loadFromJson(url, key, defaultColor, pointSize = 0.02) {
        try {
            const response = await fetch(url);
            const data = await response.json();
            return this.loadFromData(data, key, defaultColor, pointSize);
        } catch (error) {
            console.error(`Failed to load point cloud from ${url}:`, error);
            return null;
        }
    }

    clearHeatmap() {
        if (this.heatmapMesh) {
            this.scene.remove(this.heatmapMesh);
            this.heatmapMesh.geometry.dispose();
            this.heatmapMesh.material.dispose();
            this.heatmapMesh = null;
        }
    }

    createHeatmap(heatmapData) {
        this.clearHeatmap();
        this.heatmapData = heatmapData;

        if (!heatmapData || !heatmapData.heatmap) return;

        const heatmap = heatmapData.heatmap;
        const resolution = heatmapData.resolution || 64;
        const mins = heatmapData.mins || [0, 0, 0];
        const maxs = heatmapData.maxs || [1, 1, 1];

        const width = maxs[0] - mins[0];
        const depth = maxs[1] - mins[1];

        const canvas = document.createElement('canvas');
        canvas.width = resolution;
        canvas.height = resolution;
        const ctx = canvas.getContext('2d');

        const imageData = ctx.createImageData(resolution, resolution);
        for (let y = 0; y < resolution; y++) {
            for (let x = 0; x < resolution; x++) {
                const idx = (y * resolution + x) * 4;
                const value = heatmap[y][x];
                const rgb = this.heatColor(value);
                imageData.data[idx] = rgb[0];
                imageData.data[idx + 1] = rgb[1];
                imageData.data[idx + 2] = rgb[2];
                imageData.data[idx + 3] = value > 0.01 ? 180 : 0;
            }
        }
        ctx.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;

        const geometry = new THREE.PlaneGeometry(width, depth);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.heatmapMesh = new THREE.Mesh(geometry, material);
        this.heatmapMesh.rotation.x = -Math.PI / 2;
        this.heatmapMesh.position.set(
            (mins[0] + maxs[0]) / 2,
            mins[2] - 0.05,
            (mins[1] + maxs[1]) / 2
        );
        this.heatmapMesh.visible = false;
        this.scene.add(this.heatmapMesh);
    }

    heatColor(value) {
        value = Math.max(0, Math.min(1, value));
        let r, g, b;

        if (value < 0.25) {
            r = 0;
            g = Math.floor(value / 0.25 * 255);
            b = 255;
        } else if (value < 0.5) {
            r = 0;
            g = 255;
            b = Math.floor(255 - (value - 0.25) / 0.25 * 255);
        } else if (value < 0.75) {
            r = Math.floor((value - 0.5) / 0.25 * 255);
            g = 255;
            b = 0;
        } else {
            r = 255;
            g = Math.floor(255 - (value - 0.75) / 0.25 * 255);
            b = 0;
        }

        return [r, g, b];
    }

    setView(viewType) {
        this.currentView = viewType;

        const visibleMap = {
            'source': { source: true, target: false, transformed: false, merged: false },
            'target': { source: false, target: true, transformed: false, merged: false },
            'both': { source: true, target: true, transformed: false, merged: false },
            'merged': { source: false, target: false, transformed: true, merged: true },
            'heatmap': { source: true, target: true, transformed: false, merged: false }
        };

        const config = visibleMap[viewType] || visibleMap['both'];

        for (const [key, visible] of Object.entries(config)) {
            if (this.pointClouds[key]) {
                this.pointClouds[key].visible = visible;
            }
        }

        if (this.heatmapMesh) {
            this.heatmapMesh.visible = (viewType === 'heatmap') || this.heatmapOverlay;
        }
    }

    toggleHeatmapOverlay() {
        this.heatmapOverlay = !this.heatmapOverlay;
        if (this.heatmapMesh) {
            this.heatmapMesh.visible = this.heatmapOverlay;
        }
    }

    resetView() {
        let center = new THREE.Vector3(0, 0, 0);
        let count = 0;

        for (const key of Object.keys(this.pointClouds)) {
            if (this.pointClouds[key] && this.pointClouds[key].visible) {
                const box = new THREE.Box3().setFromObject(this.pointClouds[key]);
                center.add(box.getCenter(new THREE.Vector3()));
                count++;
            }
        }

        if (count > 0) {
            center.divideScalar(count);
            const offset = new THREE.Vector3(5, 5, 8);
            this.camera.position.copy(center).add(offset);
            this.controls.target.copy(center);
            this.controls.update();
        } else {
            this.camera.position.set(5, 5, 8);
            this.controls.target.set(0, 0, 0);
            this.controls.update();
        }
    }

    setPointSize(size) {
        Object.values(this.pointClouds).forEach(pc => {
            if (pc) {
                pc.material.size = size;
                pc.material.needsUpdate = true;
            }
        });
    }

    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        if (this.controls) {
            this.controls.update();
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.clearAll();
        this.renderer.dispose();
        this.controls.dispose();
    }
}
