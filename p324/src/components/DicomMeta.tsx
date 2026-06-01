import { useState } from "react";
import { ChevronDown, ChevronUp, User, Calendar, Scan, Grid3x3 } from "lucide-react";
import { useDicomStore } from "@/store/useDicomStore";

export default function DicomMeta() {
  const { result } = useDicomStore();
  const [expanded, setExpanded] = useState(true);

  if (!result) return null;

  const { metadata } = result;

  const items = [
    { icon: User, label: "患者姓名", value: metadata.patient_name || "—" },
    { label: "患者 ID", value: metadata.patient_id || "—" },
    { icon: Scan, label: "模态", value: metadata.modality || "—" },
    { icon: Calendar, label: "检查日期", value: metadata.study_date || "—" },
    { label: "序列描述", value: metadata.series_description || "—" },
    { icon: Grid3x3, label: "图像尺寸", value: `${metadata.columns} × ${metadata.rows}` },
    { label: "位分配", value: `${metadata.bits_allocated} bit` },
    { label: "像素间距", value: metadata.pixel_spacing?.length >= 2 ? `${metadata.pixel_spacing[0]} × ${metadata.pixel_spacing[1]} mm` : "—" },
  ];

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-bg-tertiary/30 transition-colors"
      >
        <span className="text-sm font-medium text-fg-secondary">DICOM 元信息</span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-fg-muted" />
        ) : (
          <ChevronDown className="w-4 h-4 text-fg-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-5 pb-4 space-y-0">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
            >
              <div className="flex items-center gap-2">
                {item.icon && <item.icon className="w-3.5 h-3.5 text-fg-muted" />}
                <span className="text-xs text-fg-muted">{item.label}</span>
              </div>
              <span className="text-xs font-mono text-fg-primary">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
