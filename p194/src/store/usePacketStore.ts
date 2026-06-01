import { create } from "zustand";
import type { ProtocolLayer, Preset } from "@/utils/types";

interface PacketState {
  encapLayers: ProtocolLayer[];
  encapRawHex: string;
  decapLayers: ProtocolLayer[];
  decapInnerEth: { dst: string; src: string; type: string; payload: string } | null;
  presets: Preset[];
  loading: boolean;
  error: string | null;
  selectedLayerIndex: number | null;
  setEncapResult: (layers: ProtocolLayer[], rawHex: string) => void;
  setDecapResult: (layers: ProtocolLayer[], innerEth: { dst: string; src: string; type: string; payload: string } | null) => void;
  setPresets: (presets: Preset[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  selectLayer: (index: number | null) => void;
  reset: () => void;
}

export const usePacketStore = create<PacketState>((set) => ({
  encapLayers: [],
  encapRawHex: "",
  decapLayers: [],
  decapInnerEth: null,
  presets: [],
  loading: false,
  error: null,
  selectedLayerIndex: null,
  setEncapResult: (layers, rawHex) => set({ encapLayers: layers, encapRawHex: rawHex, error: null }),
  setDecapResult: (layers, innerEth) => set({ decapLayers: layers, decapInnerEth: innerEth, error: null }),
  setPresets: (presets) => set({ presets }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  selectLayer: (index) => set({ selectedLayerIndex: index }),
  reset: () => set({ encapLayers: [], encapRawHex: "", decapLayers: [], decapInnerEth: null, error: null, selectedLayerIndex: null }),
}));
