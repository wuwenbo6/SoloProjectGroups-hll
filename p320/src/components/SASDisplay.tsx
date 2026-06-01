import {
  CheckCircle2,
  XCircle,
  Fingerprint,
  Phone,
  PhoneOff,
  Lock,
  Unlock,
} from "lucide-react";

interface Props {
  sas: string;
  bobSas: string;
  match: boolean;
  mediaEstablished: boolean;
  visible: boolean;
}

export default function SASDisplay({
  sas,
  bobSas,
  match,
  mediaEstablished,
  visible,
}: Props) {
  if (!visible) {
    return (
      <div className="cyber-card p-6 text-center">
        <Fingerprint className="w-8 h-8 text-cyber-muted/30 mx-auto mb-2" />
        <p className="text-xs text-cyber-muted font-mono">等待 SAS 计算...</p>
      </div>
    );
  }

  const aliceDigits = sas.split("");
  const bobDigits = bobSas.split("");

  return (
    <div
      className={`cyber-card p-6 ${
        match
          ? "animate-border-glow border-cyber-accent/40"
          : "border-red-500/40 bg-red-500/5"
      }`}
    >
      <p className="text-xs font-mono text-cyber-muted uppercase tracking-widest mb-4 text-center">
        短认证字符串 / Short Authentication String
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="text-center">
          <p className="text-xs font-mono text-cyber-blue mb-2">Alice SAS</p>
          <div className="flex items-center justify-center gap-2">
            {aliceDigits.map((d, i) => (
              <div
                key={`alice-${i}`}
                className="animate-slide-in"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <span
                  className={`inline-flex items-center justify-center w-12 h-14
                       text-2xl font-display font-bold rounded-lg
                       border-2 ${
                         match
                           ? "text-cyber-blue border-cyber-blue/50 bg-cyber-blue/5"
                           : "text-red-400 border-red-500/50 bg-red-500/5"
                       }`}
                >
                  {d}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center py-4">
          {match ? (
            <div className="animate-fade-in">
              <CheckCircle2 className="w-10 h-10 text-cyber-accent mx-auto mb-2" />
              <p className="text-sm font-display text-cyber-accent font-semibold">
                SAS 匹配
              </p>
              <p className="text-xs text-cyber-muted mt-1">
                验证通过，无中间人攻击
              </p>
            </div>
          ) : (
            <div className="animate-fade-in">
              <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2 animate-pulse" />
              <p className="text-sm font-display text-red-400 font-semibold">
                SAS 不匹配
              </p>
              <p className="text-xs text-red-400/80 mt-1">
                检测到中间人攻击！
              </p>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs font-mono text-cyber-orange mb-2">Bob SAS</p>
          <div className="flex items-center justify-center gap-2">
            {bobDigits.map((d, i) => (
              <div
                key={`bob-${i}`}
                className="animate-slide-in"
                style={{ animationDelay: `${i * 100 + 200}ms` }}
              >
                <span
                  className={`inline-flex items-center justify-center w-12 h-14
                       text-2xl font-display font-bold rounded-lg
                       border-2 ${
                         match
                           ? "text-cyber-orange border-cyber-orange/50 bg-cyber-orange/5"
                           : "text-red-400 border-red-500/50 bg-red-500/5"
                       }`}
                >
                  {d}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-cyber-border/50">
        <div className="flex items-center justify-center gap-4">
          {mediaEstablished ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-cyber-accent/10 border border-cyber-accent/30 rounded-lg">
              <Phone className="w-4 h-4 text-cyber-accent" />
              <Lock className="w-4 h-4 text-cyber-accent" />
              <span className="text-sm font-display text-cyber-accent font-medium">
                安全媒体连接已建立 (SRTP 加密)
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
              <PhoneOff className="w-4 h-4 text-red-400" />
              <Unlock className="w-4 h-4 text-red-400" />
              <span className="text-sm font-display text-red-400 font-medium">
                媒体连接已被拒绝！存在中间人攻击风险
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-cyber-muted mt-4 text-center font-mono">
        双方通过语音比对 SAS，一致则确认无中间人攻击
      </p>
    </div>
  );
}
