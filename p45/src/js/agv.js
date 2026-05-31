import * as THREE from 'three';

export class AGV {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.linearVelocity = 0;
        this.angularVelocity = 0;
        this.scanRange = 2.5;
        this.halfWidth = 0.6;
        this.halfDepth = 0.4;
        
        this.createModel();
        this.scene.add(this.group);
    }
    
    createModel() {
        const bodyGeometry = new THREE.BoxGeometry(1.2, 0.4, 0.8);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2196F3,
            metalness: 0.5,
            roughness: 0.3
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.2;
        body.castShadow = true;
        this.group.add(body);
        
        const wheelGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 16);
        const wheelMaterial = new THREE.MeshStandardMaterial({
            color: 0x333333,
            metalness: 0.3,
            roughness: 0.8
        });
        
        const wheelPositions = [
            [-0.5, 0.15, 0.35],
            [0.5, 0.15, 0.35],
            [-0.5, 0.15, -0.35],
            [0.5, 0.15, -0.35]
        ];
        
        this.wheels = [];
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(...pos);
            wheel.castShadow = true;
            this.group.add(wheel);
            this.wheels.push(wheel);
        });
        
        const scannerGeometry = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16);
        const scannerMaterial = new THREE.MeshStandardMaterial({
            color: 0xFF5722,
            emissive: 0xFF5722,
            emissiveIntensity: 0.3
        });
        this.scanner = new THREE.Mesh(scannerGeometry, scannerMaterial);
        this.scanner.position.set(0, 0.45, 0);
        this.scanner.castShadow = true;
        this.group.add(this.scanner);
        
        const antennaGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
        const antennaMaterial = new THREE.MeshStandardMaterial({
            color: 0x4CAF50
        });
        const antenna = new THREE.Mesh(antennaGeometry, antennaMaterial);
        antenna.position.set(0.3, 0.6, 0);
        antenna.castShadow = true;
        this.group.add(antenna);
        
        this.scanRing = this.createScanRing();
        this.group.add(this.scanRing);
    }
    
    createScanRing() {
        const group = new THREE.Group();
        
        const ringGeometry = new THREE.RingGeometry(0.05, this.scanRange, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        group.add(ring);
        
        const lineGeometry = new THREE.RingGeometry(this.scanRange - 0.05, this.scanRange, 32);
        const lineMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const line = new THREE.Mesh(lineGeometry, lineMaterial);
        line.rotation.x = -Math.PI / 2;
        line.position.y = 0.02;
        group.add(line);
        
        group.visible = false;
        return group;
    }
    
    setScanRange(range) {
        this.scanRange = range;
        if (this.scanRing) {
            this.scanRing.parent.remove(this.scanRing);
            this.scanRing = this.createScanRing();
            this.group.add(this.scanRing);
        }
    }
    
    getBoundingBox(worldPos = null) {
        const pos = worldPos || this.getPosition();
        const rot = this.group.rotation.y;
        
        const cos = Math.abs(Math.cos(rot));
        const sin = Math.abs(Math.sin(rot));
        
        const bboxWidth = this.halfDepth * sin + this.halfWidth * cos;
        const bboxDepth = this.halfDepth * cos + this.halfWidth * sin;
        
        return {
            minX: pos.x - bboxWidth,
            maxX: pos.x + bboxWidth,
            minZ: pos.z - bboxDepth,
            maxZ: pos.z + bboxDepth,
            width: bboxWidth * 2,
            depth: bboxDepth * 2
        };
    }
    
    checkCollisionWithShelf(shelf, worldPos = null) {
        const agvBox = this.getBoundingBox(worldPos);
        
        const shelfHalfWidth = shelf.width / 2;
        const shelfHalfDepth = shelf.depth / 2;
        const cos = Math.abs(Math.cos(shelf.rotation));
        const sin = Math.abs(Math.sin(shelf.rotation));
        
        const shelfBboxWidth = shelfHalfDepth * sin + shelfHalfWidth * cos;
        const shelfBboxDepth = shelfHalfDepth * cos + shelfHalfWidth * sin;
        
        const shelfBox = {
            minX: shelf.position.x - shelfBboxWidth,
            maxX: shelf.position.x + shelfBboxWidth,
            minZ: shelf.position.z - shelfBboxDepth,
            maxZ: shelf.position.z + shelfBboxDepth
        };
        
        const margin = 0.1;
        return !(
            agvBox.maxX < shelfBox.minX - margin ||
            agvBox.minX > shelfBox.maxX + margin ||
            agvBox.maxZ < shelfBox.minZ - margin ||
            agvBox.minZ > shelfBox.maxZ + margin
        );
    }
    
    checkCollision(shelves, worldPos = null) {
        for (const shelf of shelves) {
            if (this.checkCollisionWithShelf(shelf, worldPos)) {
                return true;
            }
        }
        return false;
    }
    
    setPosition(x, y, z) {
        this.group.position.set(x, y, z);
    }
    
    getPosition() {
        return {
            x: this.group.position.x,
            y: this.group.position.y,
            z: this.group.position.z
        };
    }
    
    setRotation(angle) {
        this.group.rotation.y = angle;
    }
    
    getRotation() {
        return this.group.rotation.y;
    }
    
    setVelocity(linear, angular) {
        this.linearVelocity = linear;
        this.angularVelocity = angular;
    }
    
    move(linear, angular, delta, shelves = null) {
        const prevRotation = this.group.rotation.y;
        const prevPos = { x: this.group.position.x, z: this.group.position.z };
        
        this.group.rotation.y += angular * delta;
        
        const moveDistance = linear * delta;
        const newX = prevPos.x + Math.sin(this.group.rotation.y) * moveDistance;
        const newZ = prevPos.z + Math.cos(this.group.rotation.y) * moveDistance;
        
        if (shelves) {
            const wouldCollide = this.checkCollision(shelves, { x: newX, y: 0, z: newZ });
            if (wouldCollide) {
                this.group.rotation.y = prevRotation;
                return false;
            }
        }
        
        this.group.position.x = newX;
        this.group.position.z = newZ;
        
        this.wheels.forEach(wheel => {
            wheel.rotation.x += linear * delta * 5;
        });
        
        return true;
    }
    
    stop() {
        this.linearVelocity = 0;
        this.angularVelocity = 0;
    }
    
    showScanRing(show) {
        this.scanRing.visible = show;
    }
    
    updateScanRing(intensity) {
        if (this.scanRing.visible) {
            this.scanRing.children[0].material.opacity = 0.1 + Math.sin(intensity * 10) * 0.1;
        }
    }
}
