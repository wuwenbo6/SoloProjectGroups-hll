import type { WSEvent, Subnet } from "@/utils/types";

interface DiscoveryFeedProps {
  events: WSEvent[];
  subnets: Subnet[];
}

export default function DiscoveryFeed({ events, subnets }: DiscoveryFeedProps) {
  const getSubnetName = (id?: string) => {
    if (!id) return "—";
    const subnet = subnets.find((s) => s.id === id);
    return subnet?.name ?? id;
  };

  const formatTime = () => {
    return new Date().toLocaleTimeString("en-US", { hour12: false });
  };

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
        </span>
        <h3 className="font-dm text-sm font-semibold text-white">
          Discovery Feed
        </h3>
      </div>
      <div className="max-h-64 overflow-y-auto font-mono text-[11px]">
        {events.length === 0 && (
          <div className="px-4 py-8 text-center text-gray-600">
            No events yet
          </div>
        )}
        {events.map((event, i) => {
          const isDiscovered = event.type === "service_discovered";
          const isLost = event.type === "service_lost";
          const isTTLExpired = event.type === "ttl_expired";
          return (
            <div
              key={`${event.type}-${event.serviceId ?? ""}-${i}`}
              className={`px-4 py-2 border-b border-white/[0.03] flex items-center gap-2 animate-slide-in-top ${
                i === 0 ? "bg-white/[0.02]" : ""
              }`}
            >
              <span className="text-gray-600 shrink-0 tabular-nums">
                {formatTime()}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider shrink-0 ${
                  isDiscovered
                    ? "bg-green-500/15 text-green-400"
                    : isLost
                    ? "bg-red-500/15 text-red-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {isDiscovered ? "FOUND" : isLost ? "LOST" : "TTL"}
              </span>
              <span className="text-gray-300 truncate">
                {event.service?.name ?? event.serviceId ?? "—"}
              </span>
              {isTTLExpired && (
                <span className="text-amber-500 text-[9px]">requerying...</span>
              )}
              <span className="text-gray-600 ml-auto shrink-0 truncate max-w-[80px]">
                {getSubnetName(event.subnetId)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
