class IFCViewer {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.meshes = [];
        this.collisionMeshes = [];
        this.wireframe = false;
        this.axesHelper = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectedMesh = null;

        this.init();
        this.animate();
        this.setupEvents();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
        this.camera.position.set(50, 50, 50);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;

        const ambientLight = new THREE.AmbientLight(0x404050, 0.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(100, 100, 50);
        dirLight.castShadow = true;
        this.scene.add(dirLight);

        const dirLight2 = new THREE.DirectionalLight(0x8080ff, 0.3);
        dirLight2.position.set(-100, -50, 100);
        this.scene.add(dirLight2);

        const gridHelper = new THREE.GridHelper(200, 40, 0x2a2a4a, 0x1a1a2a);
        this.scene.add(gridHelper);

        this.axesHelper = new THREE.AxesHelper(20);
        this.scene.add(this.axesHelper);
    }

    setupEvents() {
        window.addEventListener('resize', () => this.onResize());

        this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    onMouseClick(event) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);

        const meshObjects = this.meshes.map(m => m.mesh);
        const intersects = this.raycaster.intersectObjects(meshObjects, false);

        if (this.selectedMesh) {
            if (this.selectedMesh.material.emissive) {
                this.selectedMesh.material.emissive.setHex(0x000000);
            }
        }

        if (intersects.length > 0) {
            this.selectedMesh = intersects[0].object;
            if (this.selectedMesh.material.emissive) {
                this.selectedMesh.material.emissive.setHex(0x333333);
            }

            const elementId = intersects[0].object.userData.elementId;
            if (elementId && window.onElementSelect) {
                window.onElementSelect(elementId);
            }
        } else {
            this.selectedMesh = null;
            if (window.onElementSelect) {
                window.onElementSelect(null);
            }
        }
    }

    clearModel() {
        this.meshes.forEach(item => {
            this.scene.remove(item.mesh);
            item.mesh.geometry.dispose();
            if (Array.isArray(item.mesh.material)) {
                item.mesh.material.forEach(m => m.dispose());
            } else {
                item.mesh.material.dispose();
            }
        });
        this.meshes = [];
        this.collisionMeshes = [];
        this.selectedMesh = null;
    }

    loadModel(elements) {
        this.clearModel();

        let globalMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        let globalMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

        elements.forEach(element => {
            const geometry = this.createGeometry(element.vertices, element.faces);
            const material = this.createMaterial(element.colors, element.merged);

            const mesh = new THREE.Mesh(geometry, material);
            mesh.userData.elementId = element.id;
            mesh.userData.ifcType = element.ifc_type;
            mesh.userData.ifcId = element.ifc_id;
            mesh.userData.name = element.name;
            mesh.userData.merged = element.merged;

            if (element.aabb_min && element.aabb_max) {
                const min = this.parseAabb(element.aabb_min);
                const max = this.parseAabb(element.aabb_max);
                mesh.userData.aabb = { min, max };

                globalMin.min(min);
                globalMax.max(max);
            }

            this.scene.add(mesh);
            this.meshes.push({ mesh, elementId: element.id });
        });

        this.frameModel(globalMin, globalMax);
    }

    createGeometry(vertices, faces) {
        const geometry = new THREE.BufferGeometry();

        const vertexArray = new Float32Array(vertices);
        const faceArray = new Uint32Array(faces);

        geometry.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3));
        geometry.setIndex(new THREE.BufferAttribute(faceArray, 1));
        geometry.computeVertexNormals();

        return geometry;
    }

    createMaterial(colors, merged) {
        if (colors && colors.length > 0) {
            const colorArray = new Float32Array(colors);
            const geometry = this._tempColorGeom(colorArray);
        }

        const baseColor = merged ? 0x4a9eff : 0xcccccc;

        return new THREE.MeshPhongMaterial({
            color: baseColor,
            side: THREE.DoubleSide,
            flatShading: false,
            shininess: 30,
        });
    }

    _tempColorGeom(colorArray) {
        return null;
    }

    parseAabb(aabbStr) {
        const parts = aabbStr.split(',').map(parseFloat);
        return new THREE.Vector3(parts[0], parts[1], parts[2]);
    }

    frameModel(min, max) {
        if (!isFinite(min.x)) return;

        const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
        const size = new THREE.Vector3().subVectors(max, min);
        const maxDim = Math.max(size.x, size.y, size.z);

        const distance = maxDim * 2;
        const direction = new THREE.Vector3(1, 0.8, 1).normalize();

        this.camera.position.copy(center).add(direction.multiplyScalar(distance));
        this.controls.target.copy(center);
        this.controls.update();
    }

    resetView() {
        if (this.meshes.length === 0) return;

        let globalMin = new THREE.Vector3(Infinity, Infinity, Infinity);
        let globalMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

        this.meshes.forEach(item => {
            const aabb = item.mesh.userData.aabb;
            if (aabb) {
                globalMin.min(aabb.min);
                globalMax.max(aabb.max);
            }
        });

        this.frameModel(globalMin, globalMax);
    }

    toggleWireframe() {
        this.wireframe = !this.wireframe;
        this.meshes.forEach(item => {
            item.mesh.material.wireframe = this.wireframe;
        });
    }

    toggleAxes() {
        if (this.axesHelper) {
            this.axesHelper.visible = !this.axesHelper.visible;
        }
    }

    highlightCollisions(collisions) {
        this.clearCollisionHighlight();

        const collidedIds = new Set();
        collisions.forEach(c => {
            collidedIds.add(c.element_a.id);
            collidedIds.add(c.element_b.id);
        });

        this.meshes.forEach(item => {
            if (collidedIds.has(item.elementId)) {
                item.mesh.material.color.setHex(0xff3333);
                item.mesh.material.emissive.setHex(0x330000);
                this.collisionMeshes.push(item.mesh);
            }
        });
    }

    clearCollisionHighlight() {
        this.collisionMeshes.forEach(mesh => {
            const merged = mesh.userData.merged;
            mesh.material.color.setHex(merged ? 0x4a9eff : 0xcccccc);
            if (mesh.material.emissive) {
                mesh.material.emissive.setHex(0x000000);
            }
        });
        this.collisionMeshes = [];
    }

    showAABBs(elementIds) {
        this.clearAABBs();

        const idSet = new Set(elementIds);
        this.meshes.forEach(item => {
            if (idSet.has(item.elementId) || !elementIds) {
                const aabb = item.mesh.userData.aabb;
                if (aabb) {
                    const boxHelper = new THREE.Box3Helper(
                        new THREE.Box3(aabb.min, aabb.max),
                        0x00ff00
                    );
                    boxHelper.userData.isAABB = true;
                    this.scene.add(boxHelper);
                }
            }
        });
    }

    clearAABBs() {
        const toRemove = [];
        this.scene.traverse((obj) => {
            if (obj.userData && obj.userData.isAABB) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));
    }

    applySunlightColors(results) {
        this.clearSunlight();

        this.meshes.forEach(item => {
            const result = results.find(r => r.element_id === item.elementId);
            if (result) {
                const color = new THREE.Color(result.color);
                item.mesh.material.color.copy(color);
                item.mesh.material.emissive.setHex(0x000000);
                item.mesh.userData.sunlightResult = result;
            }
        });
    }

    clearSunlight() {
        this.meshes.forEach(item => {
            const merged = item.mesh.userData.merged;
            item.mesh.material.color.setHex(merged ? 0x4a9eff : 0xcccccc);
            item.mesh.material.emissive.setHex(0x000000);
            delete item.mesh.userData.sunlightResult;
        });
        this.clearSunPath();
    }

    showSunPath(sunPath, center = new THREE.Vector3(0, 0, 0)) {
        this.clearSunPath();

        const radius = 50;
        const points = [];

        sunPath.forEach(sp => {
            const alt = THREE.MathUtils.degToRad(sp.altitude);
            const az = THREE.MathUtils.degToRad(sp.azimuth);

            const x = radius * Math.cos(alt) * Math.sin(az);
            const y = radius * Math.cos(alt) * Math.cos(az);
            const z = radius * Math.sin(alt);

            points.push(new THREE.Vector3(x, y, z).add(center));
        });

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffaa00,
            linewidth: 2,
            transparent: true,
            opacity: 0.8,
        });

        const sunPathLine = new THREE.Line(geometry, material);
        sunPathLine.userData.isSunPath = true;
        this.scene.add(sunPathLine);

        sunPath.forEach((sp, idx) => {
            const alt = THREE.MathUtils.degToRad(sp.altitude);
            const az = THREE.MathUtils.degToRad(sp.azimuth);

            const x = radius * Math.cos(alt) * Math.sin(az);
            const y = radius * Math.cos(alt) * Math.cos(az);
            const z = radius * Math.sin(alt);

            const dir = new THREE.Vector3(x, y, z).normalize();
            const arrowHelper = new THREE.ArrowHelper(
                dir,
                center,
                radius * 0.9,
                new THREE.Color().setHSL(sp.irradiance / 1000, 1, 0.5),
                2,
                1
            );
            arrowHelper.userData.isSunPath = true;
            this.scene.add(arrowHelper);

            if (idx % 2 === 0 && sp.irradiance > 50) {
                const sunLight = new THREE.PointLight(0xffffff, 0.3, 200);
                sunLight.position.set(x + center.x, y + center.y, z + center.z);
                sunLight.userData.isSunPath = true;
                this.scene.add(sunLight);
            }
        });
    }

    clearSunPath() {
        const toRemove = [];
        this.scene.traverse((obj) => {
            if (obj.userData && obj.userData.isSunPath) {
                toRemove.push(obj);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
