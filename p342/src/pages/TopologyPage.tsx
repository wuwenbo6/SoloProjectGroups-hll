import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import G6 from "@antv/g6";
import type { Graph, INode, IG6GraphEvent } from "@antv/g6";
import { RefreshCw, LogOut, ZoomIn, ZoomOut, Maximize2, Filter, Plus, Shield, Download } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import NodeDetail from "@/components/NodeDetail";
import CreateLUNDialog from "@/components/CreateLUNDialog";
import CreateMaskingViewDialog from "@/components/CreateMaskingViewDialog";
import type { TopologyNode } from "@/types";

const nodeColors: Record<string, string> = {
  system: "#00d4ff",
  pool: "#22c55e",
  volume: "#a855f7",
  masking_view: "#ff6b35",
  initiator: "#eab308",
  port: "#ec4899",
};

const nodeSizes: Record<string, number> = {
  system: 60,
  pool: 50,
  volume: 40,
  masking_view: 45,
  initiator: 30,
  port: 30,
};

const edgeStyles: Record<string, { color: string; lineWidth: number; lineDash?: number[] }> = {
  contains: { color: "#00d4ff", lineWidth: 2 },
  allocates: { color: "#22c55e", lineWidth: 2, lineDash: [6, 3] },
  exposes: { color: "#ff6b35", lineWidth: 2 },
  maps_to: { color: "#a855f7", lineWidth: 1.5, lineDash: [4, 4] },
  uses: { color: "#eab308", lineWidth: 1.5 },
};

const typeLabels: Record<string, string> = {
  system: "System",
  pool: "Pool",
  volume: "Volume",
  masking_view: "Masking View",
  initiator: "Initiator",
  port: "Port",
};

export default function TopologyPage() {
  const navigate = useNavigate();
  const { connected, topologyData, loading, pools, volumes, fetchTopology, fetchAll, exportXML } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(["system", "pool", "volume", "masking_view", "initiator", "port"])
  );
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateLUN, setShowCreateLUN] = useState(false);
  const [showCreateMV, setShowCreateMV] = useState(false);

  useEffect(() => {
    if (!connected) {
      navigate("/");
    }
  }, [connected, navigate]);

  useEffect(() => {
    if (connected) {
      fetchAll();
    }
  }, [connected, fetchAll]);

  const transformData = useCallback(() => {
    if (!topologyData) return { nodes: [], edges: [] };

    const filteredNodes = topologyData.nodes.filter((n) => visibleTypes.has(n.type));
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = topologyData.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    const g6Nodes = filteredNodes.map((node) => {
      const color = nodeColors[node.type] || "#00d4ff";
      const size = nodeSizes[node.type] || 40;
      return {
        id: node.id,
        label: node.label,
        type: "circle",
        size,
        style: {
          fill: `${color}20`,
          stroke: color,
          lineWidth: 2,
          shadowColor: `${color}60`,
          shadowBlur: 20,
          cursor: "pointer",
        },
        labelCfg: {
          style: {
            fill: "#e2e8f0",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          },
          position: "bottom" as const,
          offset: 12,
        },
        nodeType: node.type,
        nodeStatus: node.status,
        rawNode: node,
      };
    });

    const g6Edges = filteredEdges.map((edge) => {
      const style = edgeStyles[edge.relation] || edgeStyles.contains;
      return {
        source: edge.source,
        target: edge.target,
        type: edge.relation === "contains" ? "cubic" : edge.relation === "allocates" ? "line" : "quadratic",
        style: {
          stroke: style.color,
          lineWidth: style.lineWidth,
          lineDash: style.lineDash,
          endArrow: {
            path: G6.Arrow.triangle(6, 8, 0),
            fill: style.color,
          },
          opacity: 0.7,
        },
      };
    });

    return { nodes: g6Nodes, edges: g6Edges };
  }, [topologyData, visibleTypes]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    if (!graphRef.current) {
      const graph = new G6.Graph({
        container,
        width,
        height,
        fitView: true,
        fitViewPadding: 60,
        animate: true,
        layout: {
          type: "force",
          preventOverlap: true,
          nodeSize: 80,
          nodeSpacing: 40,
          linkDistance: (d: { source: { model: { nodeType: string } }; target: { model: { nodeType: string } } }) => {
            const srcType = d.source?.model?.nodeType;
            const tgtType = d.target?.model?.nodeType;
            if (srcType === "system" || tgtType === "system") return 200;
            return 150;
          },
          nodeStrength: -300,
          edgeStrength: 0.1,
          collideStrength: 0.8,
          alphaDecay: 0.04,
        },
        defaultNode: {
          type: "circle",
          size: 40,
          style: {
            lineWidth: 2,
          },
        },
        defaultEdge: {
          style: {
            opacity: 0.7,
          },
        },
        modes: {
          default: ["drag-canvas", "zoom-canvas", "drag-node"],
        },
      });

      graph.on("node:click", (evt: { item: { getModel: () => { rawNode: TopologyNode } } }) => {
        const model = evt.item.getModel();
        if (model.rawNode) {
          setSelectedNode(model.rawNode);
        }
      });

      graph.on("canvas:click", () => {
        setSelectedNode(null);
      });

      graphRef.current = graph;
    }

    const data = transformData();
    if (data.nodes.length > 0) {
      graphRef.current.data(data);
      graphRef.current.render();
    } else {
      graphRef.current.clear();
    }

    const handleResize = () => {
      if (graphRef.current && containerRef.current) {
        graphRef.current.changeSize(
          containerRef.current.offsetWidth,
          containerRef.current.offsetHeight
        );
      }
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [transformData]);

  useEffect(() => {
    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
        graphRef.current = null;
      }
    };
  }, []);

  const handleRefresh = () => {
    fetchTopology();
  };

  const handleZoomIn = () => {
    if (graphRef.current) {
      const zoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(Math.min(zoom * 1.2, 5));
    }
  };

  const handleZoomOut = () => {
    if (graphRef.current) {
      const zoom = graphRef.current.getZoom();
      graphRef.current.zoomTo(Math.max(zoom / 1.2, 0.1));
    }
  };

  const handleFitView = () => {
    if (graphRef.current) {
      graphRef.current.fitView(60);
    }
  };

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--bg-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="font-outfit text-sm font-semibold text-[var(--text-primary)]">
            Storage Topology
          </h2>
          {loading && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateLUN(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-3 py-1.5 font-outfit text-xs text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20 hover:shadow-[0_0_12px_var(--accent-glow)]"
          >
            <Plus className="h-3.5 w-3.5" />
            Create LUN
          </button>
          <button
            onClick={() => setShowCreateMV(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[#ff6b35]/40 bg-[#ff6b35]/10 px-3 py-1.5 font-outfit text-xs text-[#ff6b35] transition-all hover:bg-[#ff6b35]/20 hover:shadow-[0_0_12px_#ff6b3560]"
          >
            <Shield className="h-3.5 w-3.5" />
            Create View
          </button>
          <button
            onClick={exportXML}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Download className="h-3.5 w-3.5" />
            Export XML
          </button>
          <div className="h-5 w-px bg-[var(--border)]" />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 font-outfit text-xs text-[var(--text-secondary)] transition-colors hover:border-red-500 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2">
          {Object.entries(typeLabels).map(([type, label]) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-outfit text-xs transition-all ${
                visibleTypes.has(type)
                  ? "border-current bg-current/10"
                  : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)]/40 line-through"
              }`}
              style={
                visibleTypes.has(type)
                  ? { color: nodeColors[type], borderColor: nodeColors[type] }
                  : {}
              }
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: visibleTypes.has(type) ? nodeColors[type] : "currentColor" }}
              />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="relative flex-1">
        <div ref={containerRef} className="h-full w-full" />

        {!topologyData?.nodes.length && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-outfit text-sm text-[var(--text-secondary)]">
              No topology data available
            </p>
          </div>
        )}

        <div className="absolute bottom-4 left-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/90 p-3 backdrop-blur-sm">
          <p className="mb-2 font-outfit text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Legend
          </p>
          <div className="space-y-1.5">
            {Object.entries(typeLabels).map(([type, label]) => (
              <div key={type} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: nodeColors[type],
                    boxShadow: `0 0 6px ${nodeColors[type]}60`,
                  }}
                />
                <span className="font-mono text-[10px] text-[var(--text-secondary)]">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-4 right-4 flex flex-col gap-1.5">
          <button
            onClick={handleZoomIn}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/90 text-[var(--text-secondary)] backdrop-blur-sm transition-colors hover:text-[var(--accent)]"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/90 text-[var(--text-secondary)] backdrop-blur-sm transition-colors hover:text-[var(--accent)]"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            onClick={handleFitView}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/90 text-[var(--text-secondary)] backdrop-blur-sm transition-colors hover:text-[var(--accent)]"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />

      {showCreateLUN && (
        <CreateLUNDialog pools={pools} onClose={() => setShowCreateLUN(false)} />
      )}
      {showCreateMV && (
        <CreateMaskingViewDialog volumes={volumes} onClose={() => setShowCreateMV(false)} />
      )}
    </div>
  );
}
