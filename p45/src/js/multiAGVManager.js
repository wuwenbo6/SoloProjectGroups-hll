import * as THREE from 'three';
import { AGV } from './agv.js';
import { WaypointNavigator } from './waypoint.js';
import { RFIDScanner } from './rfid.js';

export class MultiAGVManager {
    constructor(scene, shelfManager) {
        this.scene = scene;
        this.shelfManager = shelfManager;
        this.robots = [];
        this.selectedRobotId = null;
        this.isAutoMode = false;
        this.taskQueue = [];
        
        this.robotColors = [0x2196F3, 0x4CAF50, 0xFF9800, 0xE91E63, 0x9C27B0, 0x00BCD4];
        
        this.group = new THREE.Group();
        this.scene.add(this.group);
    }
    
    createRobot(id, startX = 0, startZ = 0, colorIndex = 0) {
        const agv = new AGV(this.scene);
        agv.setPosition(startX, 0, startZ);
        agv.id = id;
        
        const color = this.robotColors[colorIndex % this.robotColors.length];
        agv.group.children.forEach(child => {
            if (child.material && child.material.color && child === agv.group.children[0]) {
                child.material.color.setHex(color);
            }
        });
        
        const navigator = new WaypointNavigator(this.scene, agv, this.shelfManager);
        const rfidScanner = new RFIDScanner(this.scene, agv, this.shelfManager);
        
        const robot = {
            id,
            agv,
            navigator,
            rfidScanner,
            color,
            status: 'idle',
            currentTask: null,
            assignedWaypoints: []
        };
        
        this.robots.push(robot);
        
        if (this.robots.length === 1) {
            this.selectedRobotId = id;
        }
        
        return robot;
    }
    
    removeRobot(id) {
        const index = this.robots.findIndex(r => r.id === id);
        if (index !== -1) {
            const robot = this.robots[index];
            this.scene.remove(robot.agv.group);
            this.scene.remove(robot.navigator.markerGroup);
            this.robots.splice(index, 1);
            
            if (this.selectedRobotId === id && this.robots.length > 0) {
                this.selectedRobotId = this.robots[0].id;
            }
        }
    }
    
    getRobot(id) {
        return this.robots.find(r => r.id === id);
    }
    
    getSelectedRobot() {
        return this.getRobot(this.selectedRobotId);
    }
    
    selectRobot(id) {
        if (this.getRobot(id)) {
            this.selectedRobotId = id;
            return true;
        }
        return false;
    }
    
    getAllRobots() {
        return this.robots;
    }
    
    getRobotCount() {
        return this.robots.length;
    }
    
    generateInventoryPath() {
        const shelves = this.shelfManager.shelves;
        const waypoints = [];
        
        const aisleGroups = {};
        shelves.forEach(shelf => {
            const aisleKey = Math.round(shelf.position.z / 5) * 5;
            if (!aisleGroups[aisleKey]) {
                aisleGroups[aisleKey] = [];
            }
            aisleGroups[aisleKey].push(shelf);
        });
        
        const aisles = Object.keys(aisleGroups).sort((a, b) => parseFloat(a) - parseFloat(b));
        
        aisles.forEach((aisle, index) => {
            const aisleShelves = aisleGroups[aisle].sort((a, b) => a.position.x - b.position.x);
            
            if (aisleShelves.length > 0) {
                const minX = Math.min(...aisleShelves.map(s => s.position.x));
                const maxX = Math.max(...aisleShelves.map(s => s.position.x));
                const z = parseFloat(aisle) + 1.5;
                
                const direction = index % 2 === 0 ? 1 : -1;
                const startX = direction === 1 ? minX - 1.5 : maxX + 1.5;
                const endX = direction === 1 ? maxX + 1.5 : minX - 1.5;
                
                waypoints.push({ x: startX, z });
                
                const steps = 5;
                for (let i = 1; i <= steps; i++) {
                    waypoints.push({
                        x: startX + (endX - startX) * (i / steps),
                        z
                    });
                }
            }
        });
        
        return waypoints;
    }
    
    distributeTasks() {
        if (this.robots.length === 0) return [];
        
        const globalPath = this.generateInventoryPath();
        const tasksPerRobot = Math.ceil(globalPath.length / this.robots.length);
        
        const tasks = [];
        this.robots.forEach((robot, index) => {
            const startIdx = index * tasksPerRobot;
            const endIdx = Math.min(startIdx + tasksPerRobot, globalPath.length);
            const robotWaypoints = globalPath.slice(startIdx, endIdx);
            
            tasks.push({
                robotId: robot.id,
                waypoints: robotWaypoints,
                type: 'inventory'
            });
        });
        
        return tasks;
    }
    
    assignTask(robotId, task) {
        const robot = this.getRobot(robotId);
        if (!robot) return false;
        
        robot.currentTask = task;
        robot.status = 'assigned';
        
        task.waypoints.forEach(wp => {
            robot.navigator.addWaypoint(wp.x, wp.z);
        });
        
        return true;
    }
    
    startAutoInventory() {
        if (this.robots.length === 0) return false;
        
        const tasks = this.distributeTasks();
        
        tasks.forEach(task => {
            this.assignTask(task.robotId, task);
        });
        
        this.robots.forEach(robot => {
            robot.status = 'scanning';
            robot.rfidScanner.startScanning();
            robot.navigator.startNavigation(1.0);
        });
        
        this.isAutoMode = true;
        return true;
    }
    
    stopAutoInventory() {
        this.robots.forEach(robot => {
            robot.status = 'idle';
            robot.rfidScanner.stopScanning();
            robot.navigator.stopNavigation();
            robot.currentTask = null;
        });
        
        this.isAutoMode = false;
        return true;
    }
    
    getAllScannedTags() {
        const allTags = new Set();
        this.robots.forEach(robot => {
            robot.rfidScanner.getScannedTags().forEach(tag => {
                allTags.add(tag);
            });
        });
        return Array.from(allTags);
    }
    
    resetAllScans() {
        this.robots.forEach(robot => {
            robot.rfidScanner.reset();
        });
    }
    
    update(delta) {
        this.robots.forEach(robot => {
            robot.navigator.update(delta);
            robot.rfidScanner.update();
            
            if (this.isAutoMode && robot.status === 'scanning') {
                if (!robot.navigator.isNavigating && robot.navigator.waypoints.length > 0) {
                    if (!robot.navigator.isMoving) {
                        robot.status = 'completed';
                    }
                }
            }
        });
    }
    
    getCombinedInventoryStats() {
        const allTags = this.shelfManager.getAllTags();
        const scannedIds = new Set(this.getAllScannedTags());
        
        return {
            total: allTags.length,
            scanned: scannedIds.size,
            missing: allTags.length - scannedIds.size,
            robotCount: this.robots.length
        };
    }
}
