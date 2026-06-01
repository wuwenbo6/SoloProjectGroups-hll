import { useEffect } from "react";
import { X, AlertTriangle, XCircle, Info, CheckCircle2 } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";

const severityConfig = {
  error: { icon: XCircle, color: "text-error", label: "Error" },
  warning: { icon: AlertTriangle, color: "text-warning", label: "Warning" },
  info: { icon: Info, color: "text-info", label: "Info" },
};

const statusConfig = {
  pass: { icon: CheckCircle2, color: "text-accent", label: "Pass" },
  fail: { icon: XCircle, color: "text-error", label: "Fail" },
  not_applicable: { icon: Info, color: "text-muted-foreground", label: "Not Applicable" },
};

export default function DetailPanel() {
  const { selectedRule, setSelectedRule } = useValidationStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedRule(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedRule]);

  if (!selectedRule) return null;

  const sev = severityConfig[selectedRule.severity];
  const stat = statusConfig[selectedRule.status];
  const SevIcon = sev.icon;
  const StatIcon = stat.icon;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={() => setSelectedRule(null)}
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl animate-slide-in">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold text-accent">{selectedRule.id}</span>
          </div>
          <button
            onClick={() => setSelectedRule(null)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 rounded-full border border-border px-3 py-1 ${sev.color}`}>
              <SevIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">{sev.label}</span>
            </div>
            <div className={`flex items-center gap-1.5 rounded-full border border-border px-3 py-1 ${stat.color}`}>
              <StatIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-semibold uppercase tracking-wider">{stat.label}</span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{selectedRule.description}</p>
          </div>

          {selectedRule.detail && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Detail
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">{selectedRule.detail}</p>
            </div>
          )}

          {selectedRule.xpath && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                XPath Location
              </h3>
              <div className="rounded-lg bg-[#0d1117] border border-border p-3">
                <code className="text-xs font-mono text-accent break-all">{selectedRule.xpath}</code>
              </div>
            </div>
          )}

          {selectedRule.suggestion && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Suggestion
              </h3>
              <div className="rounded-lg border border-warning/20 bg-warning/5 p-3">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {selectedRule.suggestion}
                </p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Category
            </h3>
            <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground">
              {selectedRule.category}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
