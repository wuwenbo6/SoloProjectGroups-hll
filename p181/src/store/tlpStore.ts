import { create } from 'zustand';
import { TLP, ParseResult, ErrorInjection, ModifiedTLP } from '@/types/tlp';
import { flipBit, parseFile, parseFileInChunks, recalculateECRC, parseTLPData } from '@/utils/tlpParser';

interface TLPStore {
  parseResult: ParseResult | null;
  selectedTLP: TLP | null;
  modifiedTLPs: Map<number, ModifiedTLP>;
  loading: boolean;
  loadingProgress: number;
  parsedCount: number;
  error: string | null;
  useChunkedUpload: boolean;
  loadFile: (file: File) => Promise<void>;
  loadFileChunked: (file: File) => Promise<void>;
  selectTLP: (tlp: TLP | null) => void;
  injectError: (injection: ErrorInjection) => void;
  clearModifications: () => void;
  clearAll: () => void;
  exportModified: () => Blob | null;
  getCurrentTLPData: (tlp: TLP) => Uint8Array;
  toggleChunkedUpload: () => void;
}

export const useTLPStore = create<TLPStore>((set, get) => ({
  parseResult: null,
  selectedTLP: null,
  modifiedTLPs: new Map(),
  loading: false,
  loadingProgress: 0,
  parsedCount: 0,
  error: null,
  useChunkedUpload: true,

  loadFile: async (file: File) => {
    const { useChunkedUpload } = get();
    if (useChunkedUpload && file.size > 10 * 1024 * 1024) {
      return get().loadFileChunked(file);
    }

    set({ loading: true, error: null, loadingProgress: 0, parsedCount: 0 });
    try {
      const result = await parseFile(file);
      set({
        parseResult: result,
        selectedTLP: result.tlps.length > 0 ? result.tlps[0] : null,
        modifiedTLPs: new Map(),
        loading: false,
        loadingProgress: 100,
        parsedCount: result.tlps.length,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '文件加载失败',
        loading: false,
      });
    }
  },

  loadFileChunked: async (file: File) => {
    set({ loading: true, error: null, loadingProgress: 0, parsedCount: 0 });
    try {
      const result = await parseFileInChunks(
        file,
        (percent, tlpsParsed) => {
          set({ loadingProgress: percent, parsedCount: tlpsParsed });
        },
        1024 * 1024
      );
      set({
        parseResult: result,
        selectedTLP: result.tlps.length > 0 ? result.tlps[0] : null,
        modifiedTLPs: new Map(),
        loading: false,
        loadingProgress: 100,
        parsedCount: result.tlps.length,
      });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : '文件加载失败',
        loading: false,
      });
    }
  },

  selectTLP: (tlp: TLP | null) => {
    set({ selectedTLP: tlp });
  },

  injectError: (injection: ErrorInjection) => {
    const { parseResult, modifiedTLPs } = get();
    if (!parseResult) return;

    const tlp = parseResult.tlps[injection.tlpIndex];
    if (!tlp) return;

    const existingMod = modifiedTLPs.get(injection.tlpIndex);
    const baseData = existingMod ? existingMod.modifiedData : tlp.rawData;

    try {
      let modifiedData = flipBit(baseData, injection.byteOffset, injection.bitPosition);

      if (injection.autoRecalculateECRC) {
        modifiedData = recalculateECRC(modifiedData);
      }

      const reparsed = parseTLPData(modifiedData);
      const updatedTlp = reparsed.length > 0 ? reparsed[0] : null;

      const newModified = new Map(modifiedTLPs);
      newModified.set(injection.tlpIndex, {
        originalData: existingMod ? existingMod.originalData : tlp.rawData,
        modifiedData,
        injection,
      });
      set({ modifiedTLPs: newModified });

      if (get().selectedTLP?.index === injection.tlpIndex) {
        set({
          selectedTLP: {
            ...(updatedTlp || tlp),
            rawData: modifiedData,
            modified: true,
            index: injection.tlpIndex,
            ecrc: updatedTlp?.ecrc,
          },
        });
      }
    } catch (e) {
      set({ error: e instanceof Error ? e.message : '错误注入失败' });
    }
  },

  toggleChunkedUpload: () => {
    set({ useChunkedUpload: !get().useChunkedUpload });
  },

  clearModifications: () => {
    set({ modifiedTLPs: new Map() });
    const { parseResult, selectedTLP } = get();
    if (selectedTLP && parseResult) {
      const originalTLP = parseResult.tlps[selectedTLP.index];
      set({ selectedTLP: { ...originalTLP, modified: false } });
    }
  },

  clearAll: () => {
    set({
      parseResult: null,
      selectedTLP: null,
      modifiedTLPs: new Map(),
      error: null,
    });
  },

  exportModified: () => {
    const { parseResult, modifiedTLPs } = get();
    if (!parseResult) return null;

    const parts: Uint8Array[] = [];
    for (const tlp of parseResult.tlps) {
      const modified = modifiedTLPs.get(tlp.index);
      parts.push(modified ? modified.modifiedData : tlp.rawData);
    }

    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }

    return new Blob([result], { type: 'application/octet-stream' });
  },

  getCurrentTLPData: (tlp: TLP): Uint8Array => {
    const modified = get().modifiedTLPs.get(tlp.index);
    return modified ? modified.modifiedData : tlp.rawData;
  },
}));
