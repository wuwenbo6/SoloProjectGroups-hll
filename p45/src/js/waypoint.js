import * as THREE from 'three';

export class WaypointNavigator {
    constructor(scene, agv, shelfManager = null) {
        this.scene = scene;
        this.agv = agv;
        this.shelfManager = shelfManager;
        this.waypoints = [];
        this.currentWaypointIndex = 0;
        this.isNavigating = false;
        this.isMoving = false;
        this.speed = 1.0;
        this.arrivalThreshold = 0.3;
        this.maxRetryCount = 5;
        
        this.markerGroup = new THREE.Group();
        this.scene.add(this.markerGroup);
    }
    
    setShelfManager(shelfManager) {
        this.shelfManager = shelfManager;
    }
    
    createWaypointMarker(x, z, index) {
        const group = new THREE.Group();
        
        const ringGeometry = new THREE.RingGeometry(0.15, 0.25, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF9800,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        group.add(ring);
        
        const pillarGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8);
        const pillarMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF9800,
            transparent: true,
            opacity: 0.6
        });
        const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
        pillar.position.y = 0.25;
        group.add(pillar);
        
        const sphereGeometry = new THREE.SphereGeometry(0.08, 16, 16);
        const sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0xFF5722
        });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        sphere.position.y = 0.55;
        group.add(sphere);
        
        group.position.set(x, 0, z);
        group.userData.index = index;
        
        return group;
    }
    
    validateWaypoint(x, z) {
        const shelves = this.getShelves();
        if (!shelves) return { valid: true, reason: 'No shelf data' };
        
        const testPos = { x, y: 0, z };
        for (const shelf of shelves) {
            const shelfHalfWidth = shelf.width / 2 + 0.5;
            const shelfHalfDepth = shelf.depth / 2 + 0.5;
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
            
            if (x >= shelfBox.minX && x <= shelfBox.maxX &&
                z >= shelfBox.minZ && z <= shelfBox.maxZ) {
                return { valid: false, reason: 'Waypoint too close to shelf' };
            }
        }
        
        return { valid: true };
    }
    
    addWaypoint(x, z) {
        const validation = this.validateWaypoint(x, z);
        if (!validation.valid) {
            console.warn('Cannot add waypoint:', validation.reason);
            return false;
        }
        
        const waypoint = { x, z };
        this.waypoints.push(waypoint);
        
        const marker = this.createWaypointMarker(x, z, this.waypoints.length - 1);
        this.markerGroup.add(marker);
        
        this.updateLine();
        return true;
    }
    
    removeWaypoint(index) {
        this.waypoints.splice(index, 1);
        this.markerGroup.remove(this.markerGroup.children[index]);
        this.updateLine();
    }
    
    clearWaypoints() {
        this.waypoints = [];
        this.markerGroup.clear();
        this.stopNavigation();
    }
    
    updateLine() {
        const existingLine = this.markerGroup.children.find(child => child.userData.isLine);
        if (existingLine) {
            this.markerGroup.remove(existingLine);
        }
        
        if (this.waypoints.length < 2) return;
        
        const points = this.waypoints.map(wp => new THREE.Vector3(wp.x, 0.03, wp.z));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineDashedMaterial({
            color: 0xFF9800,
            dashSize: 0.2,
            gapSize: 0.1,
            transparent: true,
            opacity: 0.6
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        line.userData.isLine = true;
        this.markerGroup.add(line);
    }
    
    startNavigation(speed = 1.0) {
        if (this.waypoints.length === 0) return;
        
        this.speed = speed;
        this.currentWaypointIndex = 0;
        this.isNavigating = true;
        this.isMoving = true;
    }
    
    stopNavigation() {
        this.isNavigating = false;
        this.isMoving = false;
        this.agv.stop();
    }
    
    getShelves() {
        if (this.shelfManager && this.shelfManager.shelves) {
            return this.shelfManager.shelves;
        }
        return null;
    }
    
    findAlternativePath(target, delta) {
        const currentPos = this.agv.getPosition();
        const dx = target.x - currentPos.x;
        const dz = target.z - currentPos.z;
        const targetAngle = Math.atan2(dx, dz);
        
        const angles = [
            targetAngle + Math.PI / 2,
            targetAngle - Math.PI / 2,
            targetAngle + Math.PI / 4,
            targetAngle - Math.PI / 4,
            targetAngle + Math.PI * 3 / 4,
            targetAngle - Math.PI * 3 / 4
        ];
        
        for (const angle of angles) {
            const testDist = this.speed * delta * 3;
            const testX = currentPos.x + Math.sin(angle) * testDist;
            const testZ = currentPos.z + Math.cos(angle) * testDist;
            
            const shelves = this.getShelves();
            if (!this.agv.checkCollision(shelves, { x: testX, y: 0, z: testZ })) {
                return angle;
            }
        }
        
        return null;
    }
    
    update(delta) {
        if (!this.isNavigating || this.currentWaypointIndex >= this.waypoints.length) {
            this.isMoving = false;
            return;
        }
        
        const target = this.waypoints[this.currentWaypointIndex];
        const currentPos = this.agv.getPosition();
        
        const dx = target.x - currentPos.x;
        const dz = target.z - currentPos.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance < this.arrivalThreshold) {
            this.currentWaypointIndex++;
            if (this.currentWaypointIndex >= this.waypoints.length) {
                this.stopNavigation();
            }
            return;
        }
        
        const shelves = this.getShelves();
        const targetAngle = Math.atan2(dx, dz);
        let angleDiff = targetAngle - this.agv.getRotation();
        
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        const moveSpeed = Math.min(this.speed, distance);
        const testX = currentPos.x + Math.sin(this.agv.getRotation()) * moveSpeed * delta * 2;
        const testZ = currentPos.z + Math.cos(this.agv.getRotation()) * moveSpeed * delta * 2;
        
        const wouldCollide = shelves && this.agv.checkCollision(shelves, { x: testX, y: 0, z: testZ });
        
        if (wouldCollide) {
            const altAngle = this.findAlternativePath(target, delta);
            if (altAngle !== null) {
                let altAngleDiff = altAngle - this.agv.getRotation();
                while (altAngleDiff > Math.PI) altAngleDiff -= Math.PI * 2;
                while (altAngleDiff < -Math.PI) altAngleDiff += Math.PI * 2;
                
                const angularSpeed = Math.sign(altAngleDiff) * Math.min(Math.abs(altAngleDiff) * 2, 2);
                this.agv.move(0, angularSpeed, delta, shelves);
            } else {
                this.agv.move(-this.speed * 0.3, 0, delta, shelves);
            }
        } else if (Math.abs(angleDiff) > 0.1) {
            const angularSpeed = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff) * 2, 2);
            this.agv.move(0, angularSpeed, delta, shelves);
        } else {
            this.agv.move(moveSpeed, 0, delta, shelves);
        }
        
        this.isMoving = true;
    }
    
    getCurrentWaypoint() {
        if (this.currentWaypointIndex < this.waypoints.length) {
            return this.waypoints[this.currentWaypointIndex];
        }
        return null;
    }
}
