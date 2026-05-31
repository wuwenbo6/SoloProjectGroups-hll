import * as THREE from 'three';

class Drone {
  constructor(id) {
    this.id = id;
    this.mesh = null;
    this.light = null;
    this.propellers = [];
    this.bodyParts = [];
    this.targetPosition = new THREE.Vector3();
    this.currentPosition = new THREE.Vector3();
    this.rotationSpeed = 0;
    this.propellerSpeed = 0;
    this.lightIntensity = 1;
    this.lightColor = new THREE.Color(0xff0000);
    this.status = 'idle';
    this.battery = 100;
    this.isOnline = true;
    this.baseOpacity = 1;

    this.createModel();
  }

  createModel() {
    const group = new THREE.Group();

    const bodyGeometry = new THREE.BoxGeometry(1.2, 0.15, 1.2);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x2c3e50,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 1
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    group.add(body);
    this.bodyParts.push(body);

    const topGeometry = new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const topMaterial = new THREE.MeshStandardMaterial({
      color: 0x34495e,
      metalness: 0.5,
      roughness: 0.5,
      transparent: true,
      opacity: 1
    });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 0.15;
    top.castShadow = true;
    group.add(top);
    this.bodyParts.push(top);

    const armLength = 0.8;
    const armGeometry = new THREE.CylinderGeometry(0.03, 0.03, armLength, 8);
    const armMaterial = new THREE.MeshStandardMaterial({
      color: 0x34495e,
      metalness: 0.7,
      roughness: 0.3,
      transparent: true,
      opacity: 1
    });

    const armPositions = [
      { x: 0.7, z: 0.7, rot: Math.PI / 4 },
      { x: -0.7, z: 0.7, rot: -Math.PI / 4 },
      { x: 0.7, z: -0.7, rot: Math.PI / 4 },
      { x: -0.7, z: -0.7, rot: -Math.PI / 4 }
    ];

    armPositions.forEach(pos => {
      const arm = new THREE.Mesh(armGeometry, armMaterial);
      arm.position.set(pos.x, 0, pos.z);
      arm.rotation.z = pos.rot;
      arm.castShadow = true;
      group.add(arm);
      this.bodyParts.push(arm);
    });

    const propellerGeometry = new THREE.BoxGeometry(0.8, 0.02, 0.08);
    const propellerMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.8,
      roughness: 0.2,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1
    });

    const propellerPositions = [
      { x: 1.0, z: 1.0 },
      { x: -1.0, z: 1.0 },
      { x: 1.0, z: -1.0 },
      { x: -1.0, z: -1.0 }
    ];

    propellerPositions.forEach((pos, index) => {
      const propeller = new THREE.Mesh(propellerGeometry, propellerMaterial);
      propeller.position.set(pos.x, 0.1, pos.z);
      propeller.castShadow = true;
      group.add(propeller);
      this.propellers.push(propeller);
      this.bodyParts.push(propeller);
    });

    const landingGearGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6);
    const landingGearMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.6,
      roughness: 0.4,
      transparent: true,
      opacity: 1
    });

    const landingPositions = [
      { x: 0.4, z: 0.4 },
      { x: -0.4, z: 0.4 },
      { x: 0.4, z: -0.4 },
      { x: -0.4, z: -0.4 }
    ];

    landingPositions.forEach(pos => {
      const gear = new THREE.Mesh(landingGearGeometry, landingGearMaterial);
      gear.position.set(pos.x, -0.2, pos.z);
      gear.castShadow = true;
      group.add(gear);
      this.bodyParts.push(gear);
    });

    this.mesh = group;

    this.light = new THREE.PointLight(0xff0000, 1, 10);
    this.light.position.set(0, 0.5, 0);
  }

  update(data) {
    this.currentPosition.set(
      data.position.x,
      data.position.z,
      data.position.y
    );
    
    this.mesh.position.lerp(this.currentPosition, 0.15);

    if (data.attitude) {
      this.mesh.rotation.x = data.attitude.pitch || 0;
      this.mesh.rotation.z = data.attitude.roll || 0;
      this.mesh.rotation.y = data.attitude.yaw || 0;
    }

    if (data.velocity) {
      const speed = Math.sqrt(
        data.velocity.x ** 2 +
        data.velocity.y ** 2 +
        data.velocity.z ** 2
      );
      this.propellerSpeed = 0.5 + speed * 0.1;
    }

    if (data.lightColor) {
      this.lightColor.setRGB(
        data.lightColor.r / 255,
        data.lightColor.g / 255,
        data.lightColor.b / 255
      );
      this.light.color.copy(this.lightColor);
    }

    if (data.lightIntensity !== undefined) {
      this.lightIntensity = data.lightIntensity;
      this.light.intensity = data.lightIntensity * 2;
    }

    this.light.position.copy(this.mesh.position);
    this.light.position.y += 0.5;

    if (data.status) {
      this.status = data.status;
    }

    if (data.battery !== undefined) {
      this.battery = data.battery;
    }

    if (data.isOnline !== undefined && data.isOnline !== this.isOnline) {
      this.isOnline = data.isOnline;
      this.updateOnlineStatus();
    }
  }

  updateOnlineStatus() {
    const opacity = this.isOnline ? 1 : 0.3;
    this.bodyParts.forEach(part => {
      if (part.material) {
        part.material.opacity = opacity;
      }
    });
    
    if (this.light) {
      this.light.intensity = this.isOnline ? this.lightIntensity * 2 : 0.1;
    }
  }

  animate(delta) {
    const targetSpeed = this.status === 'flying' ? 30 : 5;
    this.rotationSpeed += (targetSpeed - this.rotationSpeed) * 0.1;
    
    this.propellers.forEach((propeller, index) => {
      const direction = index % 2 === 0 ? 1 : -1;
      propeller.rotation.y += this.rotationSpeed * delta * direction;
    });

    if (this.status === 'flying') {
      this.mesh.position.y += Math.sin(Date.now() * 0.005) * 0.01;
    }
  }

  getPosition() {
    return this.mesh.position.clone();
  }

  setColor(color) {
    this.lightColor.set(color);
    this.light.color.copy(this.lightColor);
  }

  setLightIntensity(intensity) {
    this.lightIntensity = intensity;
    this.light.intensity = intensity * 2;
  }
}

export default Drone;
