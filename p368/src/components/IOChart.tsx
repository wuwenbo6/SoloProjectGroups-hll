import { useRef, useEffect } from "react"
import { useSimulatorStore } from "@/store/simulatorStore"
import { BarChart3 } from "lucide-react"

export default function IOChart() {
  const ioHistory = useSimulatorStore((s) => s.ioHistory)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = rect.width + "px"
    canvas.style.height = rect.height + "px"

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const w = rect.width
    const h = rect.height
    const pad = { top: 20, right: 12, bottom: 24, left: 48 }
    const chartW = w - pad.left - pad.right
    const chartH = h - pad.top - pad.bottom

    ctx.clearRect(0, 0, w, h)

    ctx.strokeStyle = "#1e293b"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(pad.left, y)
      ctx.lineTo(pad.left + chartW, y)
      ctx.stroke()
    }

    if (ioHistory.length < 2) {
      ctx.fillStyle = "#64748b"
      ctx.font = "12px JetBrains Mono, monospace"
      ctx.textAlign = "center"
      ctx.fillText("Waiting for data...", w / 2, h / 2)
      return
    }

    const maxVal = Math.max(
      ...ioHistory.map((d) => Math.max(d.pathA, d.pathB)),
      1000
    )
    const yMax = Math.ceil(maxVal / 10000) * 10000 || 10000

    ctx.fillStyle = "#64748b"
    ctx.font = "10px JetBrains Mono, monospace"
    ctx.textAlign = "right"
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i
      const val = yMax - (yMax / 4) * i
      ctx.fillText((val / 1000).toFixed(0) + "K", pad.left - 6, y + 3)
    }

    ctx.fillStyle = "#475569"
    ctx.font = "9px JetBrains Mono, monospace"
    ctx.textAlign = "center"
    ctx.fillText("IOPS", pad.left + chartW / 2, h - 4)

    const drawLine = (
      data: number[],
      color: string,
      fillColor: string
    ) => {
      if (data.length < 2) return
      const step = chartW / (data.length - 1)

      ctx.beginPath()
      ctx.moveTo(pad.left, pad.top + chartH - (data[0] / yMax) * chartH)
      for (let i = 1; i < data.length; i++) {
        const x = pad.left + i * step
        const y = pad.top + chartH - (data[i] / yMax) * chartH
        ctx.lineTo(x, y)
      }
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.stroke()

      ctx.lineTo(pad.left + (data.length - 1) * step, pad.top + chartH)
      ctx.lineTo(pad.left, pad.top + chartH)
      ctx.closePath()
      ctx.fillStyle = fillColor
      ctx.fill()
    }

    const pathAData = ioHistory.map((d) => d.pathA)
    const pathBData = ioHistory.map((d) => d.pathB)

    drawLine(pathBData, "#3b82f6", "rgba(59,130,246,0.08)")
    drawLine(pathAData, "#00f0ff", "rgba(0,240,255,0.08)")
  }, [ioHistory])

  return (
    <div className="rounded-xl border border-cyber-border bg-cyber-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyber-cyan" />
          <h2 className="font-mono font-semibold text-sm tracking-wide text-slate-200">
            IO THROUGHPUT
          </h2>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-cyber-cyan rounded" />
            <span className="text-cyber-muted">Path A</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-blue-500 rounded" />
            <span className="text-cyber-muted">Path B</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="w-full h-48">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  )
}
