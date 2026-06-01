import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { useValidationStore } from "@/store/validationStore";

function AnimatedNumber({ target, duration = 800 }: { target: number; duration?: number }) {
  const [current, setCurrent] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(start + diff * eased);
      setCurrent(next);
      prevRef.current = next;
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return <span>{current}</span>;
}

function ProgressRing({ percentage }: { percentage: number }) {
  const [animatedPct, setAnimatedPct] = useState(0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedPct / 100) * circumference;

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedPct(percentage), 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className="relative flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-border"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-accent transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold text-foreground font-mono">
          <AnimatedNumber target={Math.round(percentage)} />
        </span>
        <span className="text-xs text-muted-foreground">pass rate</span>
      </div>
    </div>
  );
}

export default function ReportSummary() {
  const { result } = useValidationStore();
  if (!result) return null;

  const { summary } = result;
  const passRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;

  const cards = [
    {
      label: "Passed",
      value: summary.passed,
      icon: CheckCircle2,
      color: "text-accent",
      bgColor: "bg-accent/10",
      borderColor: "border-accent/20",
    },
    {
      label: "Warnings",
      value: summary.warnings,
      icon: AlertTriangle,
      color: "text-warning",
      bgColor: "bg-warning/10",
      borderColor: "border-warning/20",
    },
    {
      label: "Errors",
      value: summary.errors,
      icon: XCircle,
      color: "text-error",
      bgColor: "bg-error/10",
      borderColor: "border-error/20",
    },
  ];

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-stretch sm:justify-center">
      <div className="flex gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`flex flex-col items-center gap-2 rounded-xl border ${card.borderColor} ${card.bgColor} px-6 py-5 transition-transform duration-200 hover:scale-105`}
          >
            <card.icon className={`h-6 w-6 ${card.color}`} />
            <span className={`text-3xl font-bold font-mono ${card.color}`}>
              <AnimatedNumber target={card.value} />
            </span>
            <span className="text-xs font-medium text-muted-foreground">{card.label}</span>
          </div>
        ))}
      </div>
      <ProgressRing percentage={passRate} />
    </div>
  );
}
