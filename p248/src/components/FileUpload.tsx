import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Loader2, X, FileVideo } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".mpd", ".xml"];

export default function FileUpload() {
  const { validateFile, convertToHls, hlsLoading, loading, error, reset } = useValidationStore();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFileType = (f: File): boolean => {
    const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const handleFile = useCallback((f: File) => {
    setLocalError(null);
    if (!validateFileType(f)) {
      setLocalError("Only .mpd and .xml files are accepted");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setLocalError("File size must be under 10MB");
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const onValidate = () => {
    if (file) validateFile(file);
  };

  const onClear = () => {
    setFile(null);
    setLocalError(null);
    reset();
    if (inputRef.current) inputRef.current.value = "";
  };

  const displayError = localError || error;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed
          p-10 transition-all duration-300 cursor-pointer
          ${
            dragOver
              ? "border-accent bg-accent/5 shadow-[0_0_30px_rgba(0,229,160,0.1)]"
              : "border-border bg-card hover:border-accent/50 hover:bg-card/80"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".mpd,.xml"
          onChange={onInputChange}
          className="hidden"
        />

        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-12 w-12 text-accent animate-spin" />
            <p className="text-sm text-muted-foreground">Validating MPD...</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg bg-accent/10 px-4 py-2">
              <FileText className="h-5 w-5 text-accent" />
              <span className="text-sm font-medium text-foreground">{file.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload
              className={`h-12 w-12 transition-colors duration-300 ${
                dragOver ? "text-accent" : "text-muted-foreground"
              }`}
            />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Drop your MPD file here or click to browse
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Supports .mpd and .xml files up to 10MB
              </p>
            </div>
          </div>
        )}
      </div>

      {displayError && (
        <div className="mt-3 rounded-lg bg-error/10 px-4 py-2.5 text-sm text-error">
          {displayError}
        </div>
      )}

      {file && !loading && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={onValidate}
            className="flex-1 rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-background transition-all duration-200 hover:bg-accent/90 hover:shadow-[0_0_20px_rgba(0,229,160,0.3)] active:scale-[0.98]"
          >
            Validate MPD
          </button>
          <button
            onClick={() => file && convertToHls(file)}
            disabled={hlsLoading}
            className="flex items-center justify-center gap-2 rounded-lg bg-[#1ed760]/10 border border-[#1ed760]/30 px-4 py-3 text-sm font-semibold text-[#1ed760] transition-all duration-200 hover:bg-[#1ed760]/20 hover:shadow-[0_0_20px_rgba(30,215,96,0.15)] active:scale-[0.98] disabled:opacity-50"
          >
            {hlsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileVideo className="h-4 w-4" />
            )}
            Convert to HLS
          </button>
        </div>
      )}
    </div>
  );
}
