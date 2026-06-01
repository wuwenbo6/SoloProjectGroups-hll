import { useMemo } from "react";
import { Filter } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";
import ReportSummary from "./ReportSummary";
import RuleCard from "./RuleCard";

const filterButtons: { label: string; value: "all" | "error" | "warning" | "info" }[] = [
  { label: "All", value: "all" },
  { label: "Errors", value: "error" },
  { label: "Warnings", value: "warning" },
  { label: "Info", value: "info" },
];

export default function ValidationReport() {
  const { result, severityFilter, setSeverityFilter } = useValidationStore();

  const filteredRules = useMemo(() => {
    if (!result) return [];
    if (severityFilter === "all") return result.rules;
    return result.rules.filter((r) => r.severity === severityFilter);
  }, [result, severityFilter]);

  if (!result) return null;

  const counts = {
    all: result.rules.length,
    error: result.rules.filter((r) => r.severity === "error").length,
    warning: result.rules.filter((r) => r.severity === "warning").length,
    info: result.rules.filter((r) => r.severity === "info").length,
  };

  return (
    <div className="flex flex-col gap-6">
      <ReportSummary />

      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">
          Filter
        </span>
        {filterButtons.map((btn) => (
          <button
            key={btn.value}
            onClick={() => setSeverityFilter(btn.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
              severityFilter === btn.value
                ? "bg-accent/15 text-accent shadow-[0_0_10px_rgba(0,229,160,0.1)]"
                : "text-muted-foreground hover:bg-border hover:text-foreground"
            }`}
          >
            {btn.label}
            <span className="ml-1.5 opacity-60">{counts[btn.value]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filteredRules.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">No rules match the current filter.</p>
          </div>
        ) : (
          filteredRules.map((rule) => <RuleCard key={rule.id} rule={rule} />)
        )}
      </div>
    </div>
  );
}
