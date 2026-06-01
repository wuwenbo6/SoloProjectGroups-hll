import { ArrowRight, ArrowLeft } from "lucide-react";
import type { ZRTPMessage } from "@/types/zrtp";

const typeColors: Record<string, string> = {
  Hello: "text-cyber-blue",
  HelloACK: "text-cyber-muted",
  Commit: "text-yellow-400",
  DHPart1: "text-purple-400",
  DHPart2: "text-pink-400",
  Confirm1: "text-cyber-accent",
  Confirm2: "text-cyber-accent",
  Error: "text-red-500",
  SASRelay: "text-cyan-400",
  GoClear: "text-yellow-500",
  GoClearACK: "text-green-400",
};

const senderColors: Record<string, string> = {
  alice: "bg-cyber-blue",
  bob: "bg-cyber-orange",
  mitm: "bg-red-500",
  system: "bg-cyber-accent",
};

interface Props {
  messages: ZRTPMessage[];
}

export default function SequenceDiagram({ messages }: Props) {
  return (
    <div className="cyber-card p-5 h-full">
      <h2 className="font-display text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-cyber-accent rounded-full" />
        消息时序
      </h2>

      <div className="relative">
        <div className="flex justify-between mb-3 pb-2 border-b border-cyber-border">
          <span className="text-xs font-mono text-cyber-blue flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyber-blue" />
            Alice
          </span>
          <span className="text-xs font-mono text-cyber-orange flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyber-orange" />
            Bob
          </span>
        </div>

        <div className="space-y-0">
          {messages.map((msg, i) => {
            const isAlice = msg.from === "alice";
            const isBob = msg.from === "bob";
            const isMitm = msg.from === "mitm";
            const isError = msg.type === "Error";

            return (
              <div
                key={i}
                className={`animate-slide-in ${
                  isError ? "bg-red-500/5 -mx-1 px-1 rounded" : ""
                }`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-center gap-2 py-1.5 group">
                  <span className="text-[10px] font-mono text-cyber-muted w-6 shrink-0">
                    {msg.step}
                  </span>

                  <div
                    className={`flex-1 flex items-center ${
                      isAlice ? "flex-row" : isBob ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    {isMitm ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                        <div className="flex-1 mx-1 relative">
                          <div className="border-t-2 border-dashed border-red-500/40" />
                          <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
                            <ArrowRight className="w-3 h-3 text-red-500" />
                          </div>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                      </>
                    ) : (
                      <>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            senderColors[msg.from]
                          }`}
                        />
                        <div className="flex-1 mx-1 relative">
                          <div className="border-t border-dashed border-cyber-border group-hover:border-cyber-muted transition-colors" />
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 ${
                              isAlice ? "right-0" : "left-0"
                            }`}
                          >
                            {isAlice ? (
                              <ArrowRight className="w-3 h-3 text-cyber-muted" />
                            ) : (
                              <ArrowLeft className="w-3 h-3 text-cyber-muted" />
                            )}
                          </div>
                        </div>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            senderColors[msg.to as keyof typeof senderColors] ||
                            senderColors[isAlice ? "bob" : "alice"]
                          }`}
                        />
                      </>
                    )}
                  </div>

                  <span
                    className={`text-xs font-mono font-semibold ${
                      typeColors[msg.type] || "text-cyber-muted"
                    }`}
                  >
                    {msg.type}
                  </span>
                </div>

                <div className="ml-8 mb-1.5">
                  <p
                    className={`text-[11px] leading-tight ${
                      isError ? "text-red-400" : "text-cyber-muted"
                    } ${isMitm ? "font-semibold" : ""}`}
                  >
                    {msg.description}
                  </p>
                </div>
              </div>
            );
          })}

          {messages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-xs text-cyber-muted font-mono">等待协商开始...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
