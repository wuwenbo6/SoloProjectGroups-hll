import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";
import type { RuleResult } from "@/types/validation";

const severityColors: Record<string, string> = {
  error: "bg-error/15 text-error border-error/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  info: "bg-info/15 text-info border-info/30",
};

const statusColors: Record<string, string> = {
  pass: "text-accent",
  fail: "text-error",
  not_applicable: "text-muted-foreground",
};

const barColors: Record<string, string> = {
  pass: "bg-accent",
  "fail-error": "bg-error",
  "fail-warning": "bg-warning",
  "fail-info": "bg-info",
  "not_applicable": "bg-muted-foreground",
};

function getBarColor(rule: RuleResult): string {
  if (rule.status === "pass") return barColors["pass"];
  if (rule.status === "not_applicable") return barColors["not_applicable"];
  return barColors[`fail-${rule.severity}`] || barColors["fail-error"];
}

export default function RuleCard({ rule }: { rule: RuleResult }) {
  const [expanded, setExpanded] = useState(false);
  const { setSelectedRule } = useValidationStore();

  const hasDetail = rule.detail || rule.xpath || rule.suggestion;

  return (
    <div
      className={`group relative flex overflow-hidden rounded-lg border border-border bg-card transition-all duration-200 hover:border-accent/30 hover:shadow-[0_0_15px_rgba(0,229,160,0.05)]`}
    >
      <div className={`w-1 shrink-0 ${getBarColor(rule)}`} />

      <div className="flex flex-1 flex-col min-w-0">
        <button
          onClick={() => setSelectedRule(rule)}
          className="flex flex-1 items-start gap-3 p-4 text-left"
        >
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                {rule.id}
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${severityColors[rule.severity]}`}
              >
                {rule.severity}
              </span>
              <span
                className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${statusColors[rule.status]}`}
              >
                {rule.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-sm text-foreground leading-snug">{rule.description}</p>
          </div>

          {hasDetail && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-border hover:text-foreground"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </button>

        {expanded && hasDetail && (
          <div className="border-t border-border px-4 py-3 space-y-2">
            {rule.detail && (
              <p className="text-xs text-muted-foreground leading-relaxed">{rule.detail}</p>
            )}
            {rule.xpath && (
              <div className="rounded-md bg-[#0d1117] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  XPath
                </span>
                <code className="mt-1 block text-xs text-accent font-mono break-all">
                  {rule.xpath}
                </code>
              </div>
            )}
            {rule.suggestion && (
              <div className="rounded-md bg-warning/5 px-3 py-2 border border-warning/20">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">
                  Suggestion
                </span>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {rule.suggestion}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
