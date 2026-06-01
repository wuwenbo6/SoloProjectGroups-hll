import { Shield, RotateCcw } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";
import FileUpload from "@/components/FileUpload";
import ValidationReport from "@/components/ValidationReport";
import XmlPreview from "@/components/XmlPreview";
import DetailPanel from "@/components/DetailPanel";
import HlsPanel from "@/components/HlsPanel";
import RulesReference from "@/components/RulesReference";

export default function ValidatorPage() {
  const { result, loading, reset, hlsResult } = useValidationStore();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-lg bg-accent/10 p-2">
              <Shield className="h-6 w-6 text-accent" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                DASH-IF IOP MPD Validator
              </h1>
              <p className="text-xs text-muted-foreground">
                Validate MPEG-DASH MPD documents against DASH-IF Interoperability Points
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RulesReference />
            {result && (
              <button
                onClick={reset}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:border-accent/50 hover:text-accent"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Validation
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {!result && !loading ? (
          <div className="flex flex-col items-center gap-8 py-16">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">
                Validate your MPD files
              </h2>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                Upload an MPD or XML file to validate it against DASH-IF IOP conformance rules and get a detailed compliance report.
              </p>
            </div>
            <FileUpload />
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-8 py-16">
            <FileUpload />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-6 lg:flex-row">
              <div className="min-w-0 flex-1 lg:max-w-[55%]">
                <ValidationReport />
              </div>
              <div className="min-w-0 flex-1 lg:max-w-[45%]">
                <div className="sticky top-20 flex flex-col gap-4">
                  <XmlPreview />
                  {(hlsResult || result) && <HlsPanel />}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <DetailPanel />
    </div>
  );
}
