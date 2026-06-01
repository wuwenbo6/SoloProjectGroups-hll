import { create } from "zustand";
import type {
  AlgorithmType,
  NegotiateResponse,
  NegotiateStatus,
  ZRTPMessage,
} from "@/types/zrtp";

interface ZRTPState {
  status: NegotiateStatus;
  algorithm: AlgorithmType;
  simulate_mitm: boolean;
  result: NegotiateResponse | null;
  visibleMessages: ZRTPMessage[];
  errorMessage: string;
  showGoClearModal: boolean;
  showExportModal: boolean;
  pendingGoClear: {
    sender: "alice" | "bob";
    reason: string;
  } | null;
  setAlgorithm: (algo: AlgorithmType) => void;
  setSimulateMitm: (enabled: boolean) => void;
  startNegotiation: () => Promise<void>;
  requestGoClear: (sender: "alice" | "bob", reason: string) => Promise<void>;
  confirmGoClear: (sender: "alice" | "bob", reason: string) => Promise<void>;
  cancelGoClear: () => void;
  exportLog: (includeKeys: boolean) => void;
  setShowGoClearModal: (show: boolean) => void;
  setShowExportModal: (show: boolean) => void;
  reset: () => void;
}

async function negotiateAPI(
  algorithm: AlgorithmType,
  simulate_mitm: boolean
): Promise<NegotiateResponse> {
  const res = await fetch("/api/zrtp/negotiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ algorithm, simulate_mitm }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "协商请求失败");
  }
  return res.json();
}

async function goclearAPI(
  session_id: string,
  sender: "alice" | "bob",
  reason: string,
  confirm: boolean = false
): Promise<NegotiateResponse> {
  const endpoint = confirm ? "/api/zrtp/goclear/confirm" : "/api/zrtp/goclear";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, sender, reason, confirm: true }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "GoClear 请求失败");
  }
  return res.json();
}

async function streamMessages(messages: ZRTPMessage[], onMessage: (msg: ZRTPMessage) => void) {
  for (const msg of messages) {
    await new Promise((r) => setTimeout(r, 400));
    onMessage(msg);
  }
}

export const useZRTPStore = create<ZRTPState>((set, get) => ({
  status: "idle",
  algorithm: "DH2048",
  simulate_mitm: false,
  result: null,
  visibleMessages: [],
  errorMessage: "",
  showGoClearModal: false,
  showExportModal: false,
  pendingGoClear: null,

  setAlgorithm: (algo) => set({ algorithm: algo }),

  setSimulateMitm: (enabled) => set({ simulate_mitm: enabled }),

  startNegotiation: async () => {
    set({ status: "negotiating", visibleMessages: [], result: null, errorMessage: "", pendingGoClear: null });
    try {
      const result = await negotiateAPI(get().algorithm, get().simulate_mitm);
      set({ result, status: "success" });
      streamMessages(result.messages, (msg) => {
        set((state) => ({ visibleMessages: [...state.visibleMessages, msg] }));
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      set({ status: "error", errorMessage: msg });
    }
  },

  requestGoClear: async (sender: "alice" | "bob", reason: string) => {
    const { result } = get();
    if (!result) return;

    try {
      const updated = await goclearAPI(result.session_id, sender, reason, false);
      set({ result: updated });

      const currentLen = get().visibleMessages.length;
      const newMsgs = updated.messages.slice(currentLen);
      streamMessages(newMsgs, (msg) => {
        set((state) => ({ visibleMessages: [...state.visibleMessages, msg] }));
      });

      if (updated.pending_goclear) {
        set({ showGoClearModal: true, pendingGoClear: { sender, reason } });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      set({ status: "error", errorMessage: msg });
    }
  },

  confirmGoClear: async (sender: "alice" | "bob", reason: string) => {
    const { result } = get();
    if (!result) return;

    try {
      const updated = await goclearAPI(result.session_id, sender, reason, true);
      set({ result: updated, showGoClearModal: false, pendingGoClear: null });

      const currentLen = get().visibleMessages.length;
      const newMsgs = updated.messages.slice(currentLen);
      streamMessages(newMsgs, (msg) => {
        set((state) => ({ visibleMessages: [...state.visibleMessages, msg] }));
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "未知错误";
      set({ status: "error", errorMessage: msg });
    }
  },

  cancelGoClear: () => {
    set({ showGoClearModal: false, pendingGoClear: null });
  },

  exportLog: (includeKeys: boolean = false) => {
    const { result } = get();
    if (!result) return;

    const url = `/api/zrtp/export/${result.session_id}?include_keys=${includeKeys}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `zrtp-session-${result.session_id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  setShowGoClearModal: (show) => set({ showGoClearModal: show }),
  setShowExportModal: (show) => set({ showExportModal: show }),

  reset: () =>
    set({
      status: "idle",
      result: null,
      visibleMessages: [],
      errorMessage: "",
      showGoClearModal: false,
      showExportModal: false,
      pendingGoClear: null,
    }),
}));
