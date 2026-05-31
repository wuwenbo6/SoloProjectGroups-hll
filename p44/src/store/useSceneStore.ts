import { create } from 'zustand';
import type { SceneMetadata, MaterialConfig, CameraState } from '../../shared/types';

interface SceneState {
  currentScene: SceneMetadata | null;
  scenes: SceneMetadata[];
  selectedMaterial: MaterialConfig | null;
  isLoading: boolean;
  error: string | null;
  
  setCurrentScene: (scene: SceneMetadata | null) => void;
  setScenes: (scenes: SceneMetadata[]) => void;
  setSelectedMaterial: (material: MaterialConfig | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  updateMaterial: (materialId: string, updates: Partial<MaterialConfig>) => void;
  updateCamera: (camera: CameraState) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  currentScene: null,
  scenes: [],
  selectedMaterial: null,
  isLoading: false,
  error: null,

  setCurrentScene: (scene) => set({ currentScene: scene }),
  setScenes: (scenes) => set({ scenes }),
  setSelectedMaterial: (material) => set({ selectedMaterial: material }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  updateMaterial: (materialId, updates) => {
    const { currentScene } = get();
    if (!currentScene) return;

    const updatedMaterials = currentScene.materials.map(m =>
      m.id === materialId ? { ...m, ...updates } : m
    );

    set({
      currentScene: {
        ...currentScene,
        materials: updatedMaterials
      },
      selectedMaterial: get().selectedMaterial?.id === materialId
        ? { ...get().selectedMaterial, ...updates }
        : get().selectedMaterial
    });
  },

  updateCamera: (camera) => {
    const { currentScene } = get();
    if (!currentScene) return;

    set({
      currentScene: {
        ...currentScene,
        camera
      }
    });
  }
}));
