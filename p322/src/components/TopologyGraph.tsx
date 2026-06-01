import { useNavigate } from "react-router-dom";
import type { Subnet } from "@/utils/types";

interface TopologyGraphProps {
  subnets: Subnet[];
}

export default function TopologyGraph({ subnets }: TopologyGraphProps) {
  const navigate = useNavigate();
  const centerX = 300;
  const centerY = 200;
  const radius = 140;

  return (
    <div className="backdrop-blur-xl bg-white/[0.03] border border-white/10 rounded-xl p-4">
      <svg viewBox="0 0 600 400" className="w-full h-auto">
        <defs>
          <filter id="topo-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="center-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle cx={centerX} cy={centerY} r="70" fill="url(#center-aura)" />

        {subnets.map((subnet, i) => {
          const angle = (2 * Math.PI * i) / Math.max(subnets.length, 1) - Math.PI / 2;
          const x = centerX + radius * Math.cos(angle);
          const y = centerY + radius * Math.sin(angle);

          return (
            <g key={subnet.id}>
              <line
                x1={centerX}
                y1={centerY}
                x2={x}
                y2={y}
                stroke={subnet.color}
                strokeWidth="1.5"
                strokeDasharray="8 5"
                strokeOpacity="0.4"
                className="animate-dash-flow"
              />
              <g
                onClick={() => navigate(`/subnet/${subnet.id}`)}
                className="cursor-pointer"
              >
                <circle cx={x} cy={y} r="30" fill={subnet.color} opacity="0.08">
                  <animate
                    attributeName="r"
                    values="30;38;30"
                    dur="3s"
                    begin={`${i * 0.5}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.08;0.2;0.08"
                    dur="3s"
                    begin={`${i * 0.5}s`}
                    repeatCount="indefinite"
                  />
                </circle>
                <circle
                  cx={x}
                  cy={y}
                  r="26"
                  fill="#0d1117"
                  stroke={subnet.color}
                  strokeWidth="2"
                  filter="url(#topo-glow)"
                />
                <text
                  x={x}
                  y={y - 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize="9"
                  fontFamily="DM Sans, sans-serif"
                  fontWeight="600"
                >
                  {subnet.name.length > 8
                    ? subnet.name.slice(0, 7) + "…"
                    : subnet.name}
                </text>
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  fill={subnet.color}
                  fontSize="8"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {subnet.serviceCount} svc
                </text>
              </g>
            </g>
          );
        })}

        <circle cx={centerX} cy={centerY} r="38" fill="#00d4ff" opacity="0.04">
          <animate
            attributeName="r"
            values="38;48;38"
            dur="2.5s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.04;0.12;0.04"
            dur="2.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          cx={centerX}
          cy={centerY}
          r="36"
          fill="#0d1117"
          stroke="#00d4ff"
          strokeWidth="2.5"
          filter="url(#topo-glow)"
        />
        <text
          x={centerX}
          y={centerY - 5}
          textAnchor="middle"
          fill="#00d4ff"
          fontSize="11"
          fontFamily="DM Sans, sans-serif"
          fontWeight="700"
        >
          Reflector
        </text>
        <text
          x={centerX}
          y={centerY + 10}
          textAnchor="middle"
          fill="#64748b"
          fontSize="8"
          fontFamily="JetBrains Mono, monospace"
        >
          {subnets.length} subnet{subnets.length !== 1 ? "s" : ""}
        </text>
      </svg>
    </div>
  );
}
