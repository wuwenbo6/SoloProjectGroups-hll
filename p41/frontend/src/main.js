import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import Drone from './Drone';
import PatternGenerator from './PatternGenerator';
import UIController from './UIController';
import WebSocketClient from './WebSocketClient';

class DroneSwarmApp {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.drones = new Map();
    this.waypoints = [];
    this.formationPositions = [];
    this.wsClient = null;
    this.uiController = null;
    this.patternGenerator = null;
    this.clock = new THREE.Clock();
    this.trajectoryLines = [];
    this.ground = null;
    this.gridHelper = null;

    this.init();
  }

  init() {
    this.setupScene();
    this.setupLighting();
    this.setupGround();
    this.setupControls();
    this.setupPatternGenerator();
    this.setupWebSocket();
    this.setupUIController();
    this.animate();
    
    window.addEventListener('resize', () => this.onWindowResize());
  }

  setupScene() {
    const container = document.getElementById('scene-container');
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a2e);
    this.scene.fog = new THREE.Fog(0x0a0a2e, 50, 200);

    this.camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(40, 30, 40);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    container.appendChild(this.renderer.domElement);
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404080, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -100;
    directionalLight.shadow.camera.right = 100;
    directionalLight.shadow.camera.top = 100;
    directionalLight.shadow.camera.bottom = -100;
    this.scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x2e2e4e, 0.3);
    this.scene.add(hemisphereLight);
  }

  setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.9,
      metalness: 0.1
    });
    this.ground = new THREE.Mesh(groundGeometry, groundMaterial);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.gridHelper = new THREE.GridHelper(200, 50, 0x1a73e8, 0x1a1a3e);
    this.gridHelper.position.y = 0.01;
    this.scene.add(this.gridHelper);

    this.addStars();
  }

  addStars() {
    const starsGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 400;
      positions[i + 1] = Math.random() * 200 + 50;
      positions[i + 2] = (Math.random() - 0.5) * 400;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      transparent: true,
      opacity: 0.8
    });

    const stars = new THREE.Points(starsGeometry, starsMaterial);
    this.scene.add(stars);
  }

  setupControls() {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 150;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 10, 0);
  }

  setupPatternGenerator() {
    this.patternGenerator = new PatternGenerator();
  }

  setupWebSocket() {
    this.wsClient = new WebSocketClient();
    
    this.wsClient.on('drones_status', (data) => {
      this.updateDrones(data.drones);
      this.uiController.updateBatteryStats(data.drones);
    });

    this.wsClient.on('flight_status', (data) => {
      console.log('飞行状态:', data.status);
    });

    this.wsClient.on('light_config', (data) => {
      console.log('灯光配置:', data.config);
    });

    this.wsClient.connect();
  }

  setupUIController() {
    this.uiController = new UIController(this);
  }

  updateDrones(dronesData) {
    const seenIds = new Set();

    dronesData.forEach(droneData => {
      seenIds.add(droneData.id);
      
      if (this.drones.has(droneData.id)) {
        const drone = this.drones.get(droneData.id);
        drone.update(droneData);
      } else {
        const drone = new Drone(droneData.id);
        drone.update(droneData);
        this.scene.add(drone.mesh);
        this.scene.add(drone.light);
        this.drones.set(droneData.id, drone);
      }
    });

    this.drones.forEach((drone, id) => {
      if (!seenIds.has(id)) {
        this.scene.remove(drone.mesh);
        this.scene.remove(drone.light);
        this.drones.delete(id);
      }
    });

    this.uiController.updateStats(dronesData);
  }

  setDroneCount(count) {
    this.wsClient.send({
      type: 'set_drone_count',
      count: count
    });
  }

  startFlight() {
    this.wsClient.send({ type: 'start_fly' });
  }

  pauseFlight() {
    this.wsClient.send({ type: 'pause_fly' });
  }

  stopFlight() {
    this.wsClient.send({ type: 'stop_fly' });
  }

  returnHome() {
    this.wsClient.send({ type: 'return_home' });
  }

  setSpeed(speed) {
    this.wsClient.send({ type: 'set_speed', speed: speed });
  }

  setLights(config) {
    this.wsClient.send({ type: 'set_lights', lightConfig: config });
  }

  toggleCollisionAvoidance(enabled) {
    this.wsClient.send({ type: 'set_collision_avoidance', enabled: enabled });
  }

  applyFormation(positions) {
    this.formationPositions = positions;
    this.wsClient.send({ type: 'set_formation', positions: positions });
    this.drawTrajectory(positions);
  }

  setWaypoints(waypoints) {
    this.waypoints = waypoints;
    this.wsClient.send({ type: 'set_waypoints', waypoints: waypoints });
  }

  drawTrajectory(positions) {
    this.trajectoryLines.forEach(line => this.scene.remove(line));
    this.trajectoryLines = [];

    const points = positions.map(p => new THREE.Vector3(p.x, p.z + 15, p.y));
    
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x4fc3f7, 
      transparent: true, 
      opacity: 0.5 
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    this.scene.add(line);
    this.trajectoryLines.push(line);

    positions.forEach((pos, index) => {
      const markerGeometry = new THREE.SphereGeometry(0.3, 8, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: index === 0 ? 0x00ff00 : 0x4fc3f7 
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(pos.x, pos.z + 15, pos.y);
      this.scene.add(marker);
      this.trajectoryLines.push(marker);
    });
  }

  generatePattern(patternType, text = '') {
    const droneCount = this.drones.size || 10;
    let positions = [];

    switch (patternType) {
      case 'circle':
        positions = this.patternGenerator.circle(droneCount, 15);
        break;
      case 'square':
        positions = this.patternGenerator.square(droneCount, 15);
        break;
      case 'star':
        positions = this.patternGenerator.star(droneCount, 15);
        break;
      case 'heart':
        positions = this.patternGenerator.heart(droneCount, 15);
        break;
      case 'triangle':
        positions = this.patternGenerator.triangle(droneCount, 15);
        break;
      case 'text':
        if (text) {
          positions = this.patternGenerator.text(text, droneCount, 15);
        }
        break;
    }

    return positions;
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    
    this.drones.forEach(drone => {
      drone.animate(delta);
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  onWindowResize() {
    const container = document.getElementById('scene-container');
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  }

  async saveFormation(name) {
    const positions = Array.from(this.drones.values()).map(drone => ({
      x: drone.mesh.position.x,
      y: drone.mesh.position.z,
      z: drone.mesh.position.y - 15
    }));

    const response = await fetch('/api/formations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description: `编队方案: ${name}`,
        droneCount: this.drones.size,
        positions,
        waypoints: this.waypoints,
        lightConfig: this.uiController.currentLightConfig
      })
    });

    return response.json();
  }

  async loadFormation(id) {
    const response = await fetch(`/api/formations/${id}`);
    const data = await response.json();
    
    if (data.formation) {
      this.setDroneCount(data.formation.droneCount);
      
      setTimeout(() => {
        this.applyFormation(data.formation.positions);
        if (data.formation.lightConfig) {
          this.uiController.applyLightConfig(data.formation.lightConfig);
        }
      }, 500);
    }
    
    return data;
  }

  async deleteFormation(id) {
    const response = await fetch(`/api/formations/${id}`, {
      method: 'DELETE'
    });
    return response.json();
  }

  async getFormations() {
    const response = await fetch('/api/formations');
    return response.json();
  }

  async uploadWaypoints(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('/api/waypoints/upload', {
      method: 'POST',
      body: formData
    });
    
    return response.json();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new DroneSwarmApp();
});

export default DroneSwarmApp;
