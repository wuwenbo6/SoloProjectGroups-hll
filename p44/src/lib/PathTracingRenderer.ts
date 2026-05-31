import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { AnimationMixer, Clock } from 'three';
import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter.js';
import type { MaterialConfig, CameraState } from '../../shared/types';

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  width?: number;
  height?: number;
}

export interface AnimationInfo {
  name: string;
  duration: number;
}

export interface DenoiseSettings {
  enabled: boolean;
  type: 'fxaa' | 'smaa';
  intensity: number;
}

export class PathTracingRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private controls: OrbitControls;
  private gltfLoader: GLTFLoader;
  private exrExporter: EXRExporter;
  private model: THREE.Group | null = null;
  private materials: Map<string, THREE.MeshStandardMaterial> = new Map();
  private animationId: number | null = null;
  private onMaterialsLoaded?: (materials: MaterialConfig[]) => void;
  
  private animationMixer: AnimationMixer | null = null;
  private animationClock: Clock;
  private animations: THREE.AnimationClip[] = [];
  private currentAnimation: THREE.AnimationAction | null = null;
  private animationTimeScale: number = 1;
  
  private denoisePass: ShaderPass | SMAAPass | null = null;
  private denoiseSettings: DenoiseSettings = {
    enabled: true,
    type: 'fxaa',
    intensity: 1.0
  };

  constructor(options: RendererOptions) {
    const { canvas } = options;
    const width = options.width || canvas.clientWidth;
    const height = options.height || canvas.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 2, 5);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.3,
      0.5,
      0.85
    );
    this.composer.addPass(bloomPass);

    this.setupDenoise(width, height);

    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 100;

    this.gltfLoader = new GLTFLoader();
    this.exrExporter = new EXRExporter();
    this.animationClock = new Clock();

    this.setupLighting();
    this.setupEnvironment();
    this.startAnimation();
  }

  private setupDenoise(width: number, height: number): void {
    if (this.denoisePass) {
      this.composer.removePass(this.denoisePass);
    }

    if (this.denoiseSettings.type === 'fxaa') {
      const fxaaPass = new ShaderPass(FXAAShader);
      fxaaPass.uniforms['resolution'].value.set(1 / width, 1 / height);
      this.denoisePass = fxaaPass;
    } else {
      this.denoisePass = new SMAAPass(width, height);
    }
    
    this.composer.insertPass(this.denoisePass, this.composer.passes.length - 1);
  }

  private setupLighting(): void {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 2);
    mainLight.position.set(5, 10, 7);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x00f0ff, 0.5);
    fillLight.position.set(-5, 3, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xff6b35, 0.3);
    rimLight.position.set(0, 5, -10);
    this.scene.add(rimLight);

    const pointLight1 = new THREE.PointLight(0x00f0ff, 1, 20);
    pointLight1.position.set(-3, 3, 3);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff6b35, 0.8, 15);
    pointLight2.position.set(3, 2, -3);
    this.scene.add(pointLight2);
  }

  private setupEnvironment(): void {
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    
    const envScene = new THREE.Scene();
    
    const gradientTexture = new THREE.DataTexture(
      this.createEnvironmentGradient(),
      256,
      256,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    gradientTexture.mapping = THREE.EquirectangularReflectionMapping;
    gradientTexture.needsUpdate = true;

    const envMap = pmremGenerator.fromEquirectangular(gradientTexture).texture;
    this.scene.environment = envMap;
    
    gradientTexture.dispose();
    pmremGenerator.dispose();

    this.addGroundPlane();
  }

  private createEnvironmentGradient(): Float32Array {
    const size = 256 * 256;
    const data = new Float32Array(size * 4);

    for (let i = 0; i < size; i++) {
      const y = Math.floor(i / 256) / 256;
      const stride = i * 4;

      const topColor = new THREE.Color(0x1a1a2e);
      const bottomColor = new THREE.Color(0x0a0a0f);
      const color = topColor.clone().lerp(bottomColor, y);

      data[stride] = color.r;
      data[stride + 1] = color.g;
      data[stride + 2] = color.b;
      data[stride + 3] = 1;
    }

    return data;
  }

  private addGroundPlane(): void {
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.3,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const gridHelper = new THREE.GridHelper(50, 50, 0x333344, 0x222233);
    gridHelper.position.y = 0;
    this.scene.add(gridHelper);
  }

  private disposeModel(model: THREE.Group | null): void {
    if (!model) return;

    model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        
        if (child.material) {
          const materials = Array.isArray(child.material) 
            ? child.material 
            : [child.material];
          
          materials.forEach((mat) => {
            if (mat instanceof THREE.Material) {
              mat.dispose();
              
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.map?.dispose();
                mat.normalMap?.dispose();
                mat.roughnessMap?.dispose();
                mat.metalnessMap?.dispose();
                mat.aoMap?.dispose();
                mat.emissiveMap?.dispose();
                mat.envMap?.dispose();
              }
            }
          });
        }
      }
    });

    this.scene.remove(model);
  }

  async loadGLTF(url: string, onProgress?: (progress: number) => void): Promise<MaterialConfig[]> {
    return new Promise((resolve, reject) => {
      if (this.model) {
        this.disposeModel(this.model);
        this.model = null;
        this.materials.clear();
      }

      if (this.animationMixer) {
        this.animationMixer.stopAllAction();
        this.animationMixer.uncacheRoot(this.model);
      }
      this.animations = [];
      this.currentAnimation = null;

      if (typeof window !== 'undefined' && 'gc' in window) {
        (window as any).gc?.();
      }

      this.gltfLoader.load(
        url,
        (gltf) => {
          this.model = gltf.scene;
          
          const box = new THREE.Box3().setFromObject(this.model);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 3 / maxDim;
          
          this.model.position.sub(center);
          this.model.scale.multiplyScalar(scale);
          this.model.position.y += size.y * scale / 2;

          const materialConfigs: MaterialConfig[] = [];
          
          this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              if (child.material) {
                const materials = Array.isArray(child.material) 
                  ? child.material 
                  : [child.material];

                materials.forEach((mat, index) => {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.side = THREE.DoubleSide;
                    mat.flatShading = false;
                    mat.needsUpdate = true;

                    const matId = `${child.uuid}-${index}`;
                    this.materials.set(matId, mat);
                    
                    materialConfigs.push({
                      id: matId,
                      name: mat.name || `${child.name || 'Mesh'}_${index}`,
                      metalness: mat.metalness,
                      roughness: mat.roughness,
                      color: '#' + mat.color.getHexString()
                    });
                  } else if (mat instanceof THREE.Material) {
                    mat.side = THREE.DoubleSide;
                    mat.needsUpdate = true;
                  }
                });
              }
            }
          });

          if (gltf.animations && gltf.animations.length > 0) {
            this.animations = gltf.animations;
            this.animationMixer = new AnimationMixer(this.model);
          }

          this.scene.add(this.model);
          
          this.fitCameraToModel();
          
          if (this.onMaterialsLoaded) {
            this.onMaterialsLoaded(materialConfigs);
          }
          
          onProgress?.(100);
          resolve(materialConfigs);
        },
        (xhr) => {
          if (xhr.total > 0) {
            const progress = (xhr.loaded / xhr.total) * 100;
            onProgress?.(progress);
          }
        },
        (error) => {
          console.error('GLTF加载失败:', error);
          reject(error);
        }
      );
    });
  }

  private fitCameraToModel(): void {
    if (!this.model) return;

    const box = new THREE.Box3().setFromObject(this.model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    
    this.camera.position.set(center.x, center.y + size.y * 0.3, center.z + cameraZ * 1.5);
    this.controls.target.copy(center);
    this.controls.update();
  }

  updateMaterial(materialId: string, config: Partial<MaterialConfig>): void {
    const material = this.materials.get(materialId);
    if (!material) return;

    if (config.metalness !== undefined) {
      material.metalness = config.metalness;
    }
    if (config.roughness !== undefined) {
      material.roughness = config.roughness;
    }
    if (config.color !== undefined) {
      material.color.set(config.color);
    }
    
    material.needsUpdate = true;
  }

  setOnMaterialsLoaded(callback: (materials: MaterialConfig[]) => void): void {
    this.onMaterialsLoaded = callback;
  }

  getCameraState(): CameraState {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
      fov: this.camera.fov
    };
  }

  setCameraState(state: CameraState): void {
    this.camera.position.set(...state.position);
    this.controls.target.set(...state.target);
    this.camera.fov = state.fov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setSize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  exportImage(width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
      const originalSize = {
        width: this.renderer.domElement.width,
        height: this.renderer.domElement.height
      };
      
      this.setSize(width, height);
      this.renderer.render(this.scene, this.camera);
      
      const dataUrl = this.renderer.domElement.toDataURL('image/png');
      
      this.setSize(originalSize.width, originalSize.height);
      
      resolve(dataUrl);
    });
  }

  async exportEXR(width: number, height: number): Promise<Uint8Array> {
    const originalSize = {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height
    };
    
    this.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
    
    const exrData = this.exrExporter.parse(this.renderer, {
      type: THREE.HalfFloatType,
      compression: EXRExporter.ZIP_COMPRESSION
    });
    
    this.setSize(originalSize.width, originalSize.height);
    
    return exrData;
  }

  getAnimations(): AnimationInfo[] {
    return this.animations.map(clip => ({
      name: clip.name,
      duration: clip.duration
    }));
  }

  playAnimation(index: number): boolean {
    if (!this.animationMixer || index >= this.animations.length) {
      return false;
    }

    if (this.currentAnimation) {
      this.currentAnimation.stop();
    }

    this.currentAnimation = this.animationMixer.clipAction(this.animations[index]);
    this.currentAnimation.setEffectiveTimeScale(this.animationTimeScale);
    this.currentAnimation.play();
    
    return true;
  }

  pauseAnimation(): void {
    if (this.currentAnimation) {
      this.currentAnimation.paused = true;
    }
  }

  resumeAnimation(): void {
    if (this.currentAnimation) {
      this.currentAnimation.paused = false;
    }
  }

  stopAnimation(): void {
    if (this.currentAnimation) {
      this.currentAnimation.stop();
      this.currentAnimation = null;
    }
  }

  setAnimationTimeScale(scale: number): void {
    this.animationTimeScale = scale;
    if (this.currentAnimation) {
      this.currentAnimation.setEffectiveTimeScale(scale);
    }
  }

  setAnimationProgress(progress: number): void {
    if (this.animationMixer && this.currentAnimation && this.animations.length > 0) {
      const currentClip = this.currentAnimation.getClip();
      const time = progress * currentClip.duration;
      this.animationMixer.setTime(time);
    }
  }

  getAnimationProgress(): number {
    if (!this.currentAnimation) return 0;
    const currentClip = this.currentAnimation.getClip();
    return this.animationMixer?.time / currentClip.duration || 0;
  }

  setDenoiseSettings(settings: Partial<DenoiseSettings>): void {
    this.denoiseSettings = { ...this.denoiseSettings, ...settings };
    
    if (settings.type || settings.enabled !== undefined) {
      const size = this.renderer.getSize(new THREE.Vector2());
      if (this.denoiseSettings.enabled) {
        this.setupDenoise(size.x, size.y);
      } else if (this.denoisePass) {
        this.composer.removePass(this.denoisePass);
        this.denoisePass = null;
      }
    }
  }

  getDenoiseSettings(): DenoiseSettings {
    return { ...this.denoiseSettings };
  }

  private startAnimation(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);
      
      const delta = this.animationClock.getDelta();
      if (this.animationMixer) {
        this.animationMixer.update(delta);
      }
      
      this.controls.update();
      this.composer.render();
    };
    animate();
  }

  forceGC(): void {
    if (typeof window !== 'undefined' && 'gc' in window) {
      (window as any).gc?.();
    }
  }

  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    this.disposeModel(this.model);
    this.model = null;

    this.materials.forEach((mat) => mat.dispose());
    this.materials.clear();

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
      }
    });

    this.composer.dispose();
    this.renderer.dispose();
    this.controls.dispose();

    this.forceGC();
  }
}
