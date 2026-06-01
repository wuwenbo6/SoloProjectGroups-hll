import { useMemo } from "react";
import { useValidationStore } from "@/store/validationStore";

function getXPathLineNumber(xmlSource: string, xpath: string): number | null {
  const segments = xpath.split("/");
  const targetTag = segments.filter((s) => s && !s.startsWith("@")).pop();
  if (!targetTag) return null;

  const tagName = targetTag.replace(/\[\d+\]/, "");
  const lines = xmlSource.split("\n");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`<${tagName}`)) {
      return i + 1;
    }
  }
  return null;
}

export default function XmlPreview() {
  const { result, selectedRule } = useValidationStore();

  const lines = useMemo(() => {
    if (!result?.xmlSource) return [];
    return result.xmlSource.split("\n");
  }, [result?.xmlSource]);

  const highlightedLine = useMemo(() => {
    if (!selectedRule?.xpath || !result?.xmlSource) return null;
    return getXPathLineNumber(result.xmlSource, selectedRule.xpath);
  }, [selectedRule?.xpath, result?.xmlSource]);

  if (!result?.xmlSource) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-[#0d1117]">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-error/60" />
          <div className="h-3 w-3 rounded-full bg-warning/60" />
          <div className="h-3 w-3 rounded-full bg-accent/60" />
        </div>
        <span className="ml-2 text-xs font-medium text-muted-foreground">
          {result.filename}
        </span>
      </div>
      <div className="overflow-auto max-h-[600px] custom-scrollbar">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => {
              const lineNum = i + 1;
              const isHighlighted = highlightedLine !== null && Math.abs(lineNum - highlightedLine) < 3;
              return (
                <tr
                  key={i}
                  className={`transition-colors duration-200 ${
                    isHighlighted ? "bg-accent/8" : "hover:bg-white/[0.02]"
                  }`}
                >
                  <td className="sticky left-0 w-12 shrink-0 select-none border-r border-border bg-[#0d1117] px-3 py-0 text-right align-top">
                    <span
                      className={`font-mono text-xs ${
                        isHighlighted ? "text-accent" : "text-muted-foreground/40"
                      }`}
                    >
                      {lineNum}
                    </span>
                  </td>
                  <td className="px-4 py-0 align-top">
                    <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-6 text-foreground/80">
                      {line}
                    </pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
