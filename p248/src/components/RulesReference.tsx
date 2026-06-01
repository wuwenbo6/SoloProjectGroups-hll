import { useState, useEffect } from "react";
import { BookOpen, Download, Loader2, X, ChevronDown, ChevronUp } from "lucide-react";
import type { RuleReference } from "@/types/validation";

export default function RulesReference() {
  const [open, setOpen] = useState(false);
  const [rules, setRules] = useState<RuleReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    if (open && rules.length === 0) {
      setLoading(true);
      fetch("/api/rules")
        .then((r) => r.json())
        .then((data) => setRules(data))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open, rules.length]);

  const handleExportMarkdown = () => {
    window.open("/api/rules/markdown", "_blank");
  };

  const handleExportJson = async () => {
    if (rules.length === 0) return;
    const blob = new Blob([JSON.stringify(rules, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dash-if-iop-rules.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = rules.reduce<Record<string, RuleReference[]>>((acc, rule) => {
    if (!acc[rule.category]) acc[rule.category] = [];
    acc[rule.category].push(rule);
    return acc;
  }, {});

  const severityColor: Record<string, string> = {
    error: "text-error bg-error/10",
    warning: "text-warning bg-warning/10",
    info: "text-info bg-info/10",
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-all hover:border-accent/50 hover:text-accent"
      >
        <BookOpen className="h-3.5 w-3.5" />
        Rules Reference
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 backdrop-blur-sm p-4 pt-16">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center rounded-lg bg-accent/10 p-1.5">
                  <BookOpen className="h-4 w-4 text-accent" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    DASH-IF IOP Validation Rules
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {rules.length} rules across {Object.keys(categories).length} categories
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Markdown
                </button>
                <button
                  onClick={handleExportJson}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/10 px-2.5 py-1.5 text-xs font-semibold text-accent transition-all hover:bg-accent/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  JSON
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-6">
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Loader2 className="h-8 w-8 text-accent animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading rules...</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {Object.entries(categories).map(([category, catRules]) => (
                    <div key={category} className="rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() =>
                          setExpandedCategory(
                            expandedCategory === category ? null : category
                          )
                        }
                        className="flex w-full items-center justify-between px-4 py-3 bg-border/20 hover:bg-border/30 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {category}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({catRules.length} rules)
                          </span>
                        </div>
                        {expandedCategory === category ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>

                      {expandedCategory === category && (
                        <div className="flex flex-col gap-0">
                          {catRules.map((rule) => (
                            <div
                              key={rule.id}
                              className="border-t border-border px-4 py-3"
                            >
                              <div className="flex items-start gap-2 mb-1.5">
                                <span className="font-mono text-xs font-bold text-foreground shrink-0">
                                  {rule.id}
                                </span>
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${severityColor[rule.severity] || ""}`}
                                >
                                  {rule.severity}
                                </span>
                              </div>
                              <p className="text-xs text-foreground mb-1.5">
                                {rule.description}
                              </p>
                              <p className="text-[11px] text-muted-foreground mb-1">
                                <span className="font-semibold">Spec:</span>{" "}
                                {rule.spec_ref}
                              </p>
                              <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {rule.check}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
