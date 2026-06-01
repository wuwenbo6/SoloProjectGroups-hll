import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Layers,
  Cpu,
  Database,
  Settings,
  FileCode,
  AlertCircle,
  Download,
} from "lucide-react";
import { exportCsv, downloadCsv } from "@/utils/api";
import type {
  ParseResult,
  TPKTHeader,
  COTPHeader,
  S7CommHeader,
  S7CommParameters,
  S7CommData,
  ReadItem,
  WriteItem,
  DataItem,
} from "@/types/s7comm";

interface ParseResultProps {
  result: ParseResult | null;
  recordId?: number;
}

const LAYER_COLORS = {
  tpkt: {
    badge: "bg-blue-900/60 text-blue-300 border-blue-700/50",
    header: "text-blue-400",
    row: "hover:bg-blue-950/30",
    border: "border-blue-800/40",
  },
  cotp: {
    badge: "bg-amber-900/60 text-amber-300 border-amber-700/50",
    header: "text-amber-400",
    row: "hover:bg-amber-950/30",
    border: "border-amber-800/40",
  },
  s7comm: {
    badge: "bg-cyan-900/60 text-cyan-300 border-cyan-700/50",
    header: "text-cyan-400",
    row: "hover:bg-cyan-950/30",
    border: "border-cyan-800/40",
  },
  parameters: {
    badge: "bg-purple-900/60 text-purple-300 border-purple-700/50",
    header: "text-purple-400",
    row: "hover:bg-purple-950/30",
    border: "border-purple-800/40",
  },
  data: {
    badge: "bg-rose-900/60 text-rose-300 border-rose-700/50",
    header: "text-rose-400",
    row: "hover:bg-rose-950/30",
    border: "border-rose-800/40",
  },
};

function Section({
  title,
  icon: Icon,
  colorKey,
  offsetInfo,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ElementType;
  colorKey: keyof typeof LAYER_COLORS;
  offsetInfo?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = LAYER_COLORS[colorKey];

  return (
    <div className={`rounded-lg border ${colors.border} bg-gray-900/50 overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex w-full items-center gap-2 px-3 py-2 ${colors.row} transition-colors`}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400" />
        )}
        <Icon className={`h-4 w-4 ${colors.header}`} />
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${colors.badge}`}>
          {title}
        </span>
        {offsetInfo && (
          <span className="ml-auto text-xs text-gray-500 font-mono">{offsetInfo}</span>
        )}
      </button>
      {open && <div className="border-t border-gray-800 px-3 py-2">{children}</div>}
    </div>
  );
}

function FieldRow({
  name,
  hex,
  decimal,
  description,
  colorKey,
}: {
  name: string;
  hex?: string;
  decimal?: string | number;
  description?: string;
  colorKey: keyof typeof LAYER_COLORS;
}) {
  const colors = LAYER_COLORS[colorKey];
  return (
    <div className={`flex items-center gap-3 rounded px-2 py-1 text-sm ${colors.row}`}>
      <span className="w-36 shrink-0 text-gray-300 font-medium truncate" title={name}>
        {name}
      </span>
      {hex && (
        <span className="w-24 shrink-0 font-mono text-xs text-yellow-400/80">{hex}</span>
      )}
      {decimal !== undefined && (
        <span className="w-16 shrink-0 font-mono text-xs text-gray-400">{decimal}</span>
      )}
      {description && (
        <span className="text-xs text-gray-500 truncate" title={description}>{description}</span>
      )}
    </div>
  );
}

function TPKTLayer({ header }: { header: TPKTHeader }) {
  return (
    <Section title="TPKT" icon={Layers} colorKey="tpkt" offsetInfo={`offset: ${header.offset}`}>
      <FieldRow name="Version" hex={`0x${header.version.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.version} description="Protocol version" colorKey="tpkt" />
      <FieldRow name="Reserved" hex={`0x${header.reserved.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.reserved} colorKey="tpkt" />
      <FieldRow name="Length" hex={`0x${header.length.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.length} description="Total packet length" colorKey="tpkt" />
      <FieldRow name="Header Length" decimal={header.header_length} description="TPKT header size" colorKey="tpkt" />
      {header.raw_bytes && (
        <FieldRow name="Raw" description={header.raw_bytes} colorKey="tpkt" />
      )}
    </Section>
  );
}

function COTPLayer({ header }: { header: COTPHeader }) {
  return (
    <Section title="COTP" icon={Cpu} colorKey="cotp" offsetInfo={`offset: ${header.offset}`}>
      <FieldRow name="Length" hex={`0x${header.length.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.length} colorKey="cotp" />
      <FieldRow name="Header Length" decimal={header.header_length} description="COTP header size (1 + length)" colorKey="cotp" />
      <FieldRow name="PDU Type" hex={`0x${header.pdu_type.toString(16).toUpperCase().padStart(2, "0")}`} description={header.pdu_type_name} colorKey="cotp" />
      {header.dst_ref !== undefined && header.dst_ref !== 0 && (
        <FieldRow name="Dst Ref" hex={`0x${header.dst_ref.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.dst_ref} colorKey="cotp" />
      )}
      {header.src_ref !== undefined && header.src_ref !== 0 && (
        <FieldRow name="Src Ref" hex={`0x${header.src_ref.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.src_ref} colorKey="cotp" />
      )}
      {header.params && Object.entries(header.params).map(([key, value]) => (
        <FieldRow
          key={key}
          name={key}
          decimal={typeof value === "number" ? value : undefined}
          description={typeof value === "object" ? JSON.stringify(value) : String(value)}
          colorKey="cotp"
        />
      ))}
      {header.raw_bytes && (
        <FieldRow name="Raw" description={header.raw_bytes} colorKey="cotp" />
      )}
    </Section>
  );
}

function S7CommLayer({ header }: { header: S7CommHeader }) {
  return (
    <Section title="S7comm" icon={FileCode} colorKey="s7comm" offsetInfo={`offset: ${header.offset}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md border border-cyan-700/50 bg-cyan-900/60 px-3 py-1 text-sm font-bold text-cyan-300">
          {header.function_code_name}
        </span>
        <span className="inline-flex items-center rounded-md border border-cyan-700/40 bg-cyan-950/60 px-2 py-0.5 text-xs text-cyan-400">
          {header.msg_type_name}
        </span>
      </div>
      <FieldRow name="Protocol ID" hex={`0x${header.protocol_id.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.protocol_id} description="0x32 = S7comm" colorKey="s7comm" />
      <FieldRow name="Msg Type" hex={`0x${header.msg_type.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.msg_type} description={header.msg_type_name} colorKey="s7comm" />
      <FieldRow name="Reserved" hex={`0x${header.reserved.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.reserved} colorKey="s7comm" />
      <FieldRow name="PDU Ref" hex={`0x${header.pdu_ref.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.pdu_ref} colorKey="s7comm" />
      <FieldRow name="Param Length" hex={`0x${header.param_length.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.param_length} colorKey="s7comm" />
      <FieldRow name="Data Length" hex={`0x${header.data_length.toString(16).toUpperCase().padStart(4, "0")}`} decimal={header.data_length} colorKey="s7comm" />
      <FieldRow name="Function Code" hex={`0x${header.function_code.toString(16).toUpperCase().padStart(2, "0")}`} decimal={header.function_code} description={header.function_code_name} colorKey="s7comm" />
      <FieldRow name="Header Length" decimal={header.header_length} description="S7comm header size" colorKey="s7comm" />
      {header.raw_bytes && (
        <FieldRow name="Raw" description={header.raw_bytes} colorKey="s7comm" />
      )}
    </Section>
  );
}

function ItemTable({ items, type }: { items: ReadItem[] | WriteItem[]; type: "read" | "write" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-purple-800/40 text-left text-purple-400">
            <th className="px-2 py-1 font-semibold">DB/Area</th>
            <th className="px-2 py-1 font-semibold">Area</th>
            <th className="px-2 py-1 font-semibold">Offset</th>
            <th className="px-2 py-1 font-semibold">Type</th>
            <th className="px-2 py-1 font-semibold">Length</th>
            {type === "write" && <th className="px-2 py-1 font-semibold">Data</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const ri = item as ReadItem;
            const wi = item as WriteItem;
            return (
              <tr key={i} className="border-b border-gray-800/50 hover:bg-purple-950/30">
                <td className="px-2 py-1 font-mono text-gray-300">{ri.db_number}</td>
                <td className="px-2 py-1 text-gray-400">{ri.area_name || `0x${ri.area.toString(16).toUpperCase()}`}</td>
                <td className="px-2 py-1 font-mono text-gray-300">{ri.offset}{ri.bit_offset ? `.${ri.bit_offset}` : ""}</td>
                <td className="px-2 py-1 text-gray-400">{ri.type_name || `0x${ri.type.toString(16).toUpperCase()}`}</td>
                <td className="px-2 py-1 font-mono text-gray-300">{ri.length}</td>
                {type === "write" && (
                  <td className="px-2 py-1 font-mono text-yellow-400/80 text-[10px]">{wi.data_hex || "-"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ParametersLayer({ parameters }: { parameters: S7CommParameters }) {
  let content: React.ReactNode = null;

  if (parameters.setup_comm) {
    const sc = parameters.setup_comm;
    content = (
      <div className="space-y-1">
        {Object.entries(sc).map(([key, value]) => (
          <FieldRow key={key} name={key} decimal={value} colorKey="parameters" />
        ))}
      </div>
    );
  } else if (parameters.read_items.length > 0) {
    content = <ItemTable items={parameters.read_items} type="read" />;
  } else if (parameters.write_items.length > 0) {
    content = <ItemTable items={parameters.write_items} type="write" />;
  } else {
    content = <span className="text-xs text-gray-500 italic">No parameters</span>;
  }

  return (
    <Section title="Parameters" icon={Settings} colorKey="parameters" defaultOpen={true}>
      {content}
      {parameters.raw_bytes && (
        <FieldRow name="Raw" description={parameters.raw_bytes} colorKey="parameters" />
      )}
    </Section>
  );
}

function DataLayer({ data }: { data: S7CommData }) {
  return (
    <Section title="Data" icon={Database} colorKey="data" defaultOpen={true}>
      {data.error_code !== 0 && (
        <div className="mb-2 rounded border border-rose-700/50 bg-rose-950/40 px-2 py-1 text-xs text-rose-400">
          Error Code: 0x{data.error_code.toString(16).toUpperCase().padStart(2, "0")}
          {data.error_name && ` — ${data.error_name}`}
        </div>
      )}
      {data.items.length > 0 ? (
        <div className="space-y-2">
          {data.items.map((item: DataItem) => (
            <div key={item.index} className="rounded border border-rose-800/30 bg-rose-950/20 p-2">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs text-gray-400">Item {item.index}</span>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    item.return_code === 0xff
                      ? "bg-green-900/60 text-green-400 border border-green-700/40"
                      : "bg-red-900/60 text-red-400 border border-red-700/40"
                  }`}
                >
                  {item.return_code_name}
                </span>
                {item.transport_size_name && (
                  <span className="text-[10px] text-gray-500">{item.transport_size_name}</span>
                )}
              </div>
              {item.data && (
                <div className="font-mono text-[11px] text-yellow-400/70 break-all">{item.data}</div>
              )}
              {item.data_values && item.data_values.length > 0 && (
                <div className="mt-1 text-[10px] text-gray-500">
                  Values: [{item.data_values.join(", ")}]
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <span className="text-xs text-gray-500 italic">No data items</span>
      )}
      {data.raw_bytes && (
        <div className="mt-2">
          <FieldRow name="Raw" description={data.raw_bytes} colorKey="data" />
        </div>
      )}
    </Section>
  );
}

export default function ParseResultView({ result, recordId }: ParseResultProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportCsv = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const csv = await exportCsv({
        parse_result: result as unknown as Record<string, unknown>,
        record_id: recordId,
        include_headers: true,
      });
      downloadCsv(csv, `s7comm_data_${Date.now()}.csv`);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(false);
    }
  };

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-gray-600">
        <span className="text-sm">No parse result</span>
      </div>
    );
  }

  const hasDataItems = result.data && result.data.items && result.data.items.length > 0;

  if (result.error) {
    return (
      <div className="rounded-lg border border-red-800/60 bg-red-950/40 p-4">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="h-5 w-5" />
          <span className="font-semibold">Parse Error</span>
        </div>
        <p className="mt-2 text-sm text-red-300">{result.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {(result.protocol_headers_length > 0 || result.iso_tsap_header_length > 0 || result.s7_header_length > 0) && (
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">Protocol Stack Summary</span>
          </div>
        )}
        {hasDataItems && (
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-md bg-cyan-900/40 px-2.5 py-1 text-xs font-medium text-cyan-400 border border-cyan-800/50 hover:bg-cyan-800/50 disabled:opacity-50 transition-colors"
          >
            <Download size={12} />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        )}
      </div>

      {(result.protocol_headers_length > 0 || result.iso_tsap_header_length > 0 || result.s7_header_length > 0) && (
        <div className="rounded-lg border border-gray-700/50 bg-gray-900/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Layers size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-300">Protocol Stack Summary</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {result.iso_tsap_header_length > 0 && (
              <div className="flex items-center justify-between rounded bg-blue-950/30 px-2 py-1">
                <span className="text-gray-400">ISO-TSAP Header</span>
                <span className="font-mono text-blue-400">{result.iso_tsap_header_length} bytes</span>
              </div>
            )}
            {result.s7_header_length > 0 && (
              <div className="flex items-center justify-between rounded bg-cyan-950/30 px-2 py-1">
                <span className="text-gray-400">S7 Header</span>
                <span className="font-mono text-cyan-400">{result.s7_header_length} bytes</span>
              </div>
            )}
            {result.protocol_headers_length > 0 && (
              <div className="col-span-2 flex items-center justify-between rounded bg-emerald-950/30 px-2 py-1">
                <span className="text-gray-300 font-medium">Total Protocol Headers</span>
                <span className="font-mono text-emerald-400 font-semibold">{result.protocol_headers_length} bytes</span>
              </div>
            )}
            {result.total_length > 0 && (
              <div className="col-span-2 flex items-center justify-between rounded bg-gray-800/50 px-2 py-1">
                <span className="text-gray-400">Total Packet Length</span>
                <span className="font-mono text-gray-300">{result.total_length} bytes</span>
              </div>
            )}
          </div>
        </div>
      )}
      {result.tpkt && <TPKTLayer header={result.tpkt} />}
      {result.cotp && <COTPLayer header={result.cotp} />}
      {result.s7comm && <S7CommLayer header={result.s7comm} />}
      {result.parameters && <ParametersLayer parameters={result.parameters} />}
      {result.data && <DataLayer data={result.data} />}
    </div>
  );
}
