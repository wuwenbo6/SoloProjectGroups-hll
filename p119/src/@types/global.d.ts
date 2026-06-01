export {};

declare global {
  interface Window {
    electronAPI: {
      selectDicomFolder: () => Promise<string | null>;
      selectExportPath: () => Promise<string | null>;
      getPythonPort: () => Promise<number>;
      onPythonReady: (callback: () => void) => () => void;
      onPythonError: (callback: (error: string) => void) => () => void;
    };
  }
}
