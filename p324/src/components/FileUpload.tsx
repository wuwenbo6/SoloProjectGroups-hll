import { useCallback, useRef, useState } from "react";
import { Upload, FileImage, AlertCircle } from "lucide-react";
import { useDicomStore } from "@/store/useDicomStore";

export default function FileUpload() {
  const { loading, error, upload } = useDicomStore();
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      if (file) upload(file);
    },
    [upload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback(() => setDragActive(false), []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="w-full">
      <div
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          relative cursor-pointer rounded-2xl border-2 border-dashed p-12
          transition-all duration-300 ease-out
          ${dragActive
            ? "border-accent bg-accent-dim scale-[1.01]"
            : "border-border hover:border-accent/50 hover:bg-bg-secondary/50"
          }
          ${loading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <input ref={inputRef} type="file" accept=".dcm,.dicom,*" onChange={onChange} className="hidden" />

        <div className="flex flex-col items-center gap-4">
          {loading ? (
            <>
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                <FileImage className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 text-accent" />
              </div>
              <p className="text-fg-secondary text-sm">正在解析 DICOM 文件...</p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-bg-tertiary flex items-center justify-center transition-colors group-hover:bg-accent/10">
                <Upload className="w-8 h-8 text-accent" />
              </div>
              <div className="text-center">
                <p className="text-fg-primary font-medium text-base">拖拽 DICOM 文件至此处</p>
                <p className="text-fg-muted text-sm mt-1">或点击选择文件 · 支持 CT / MR 模态</p>
              </div>
              <div className="flex gap-2 mt-2">
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-accent/10 text-accent border border-accent/20">.dcm</span>
                <span className="px-3 py-1 rounded-full text-xs font-mono bg-bg-tertiary text-fg-secondary border border-border">DICOM</span>
              </div>
            </>
          )}
        </div>

        {dragActive && (
          <div className="absolute inset-0 rounded-2xl bg-accent/5 pointer-events-none" />
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
