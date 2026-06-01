import { useRef, useEffect } from 'react'
import { Activity, Waves } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'

export function WaveformDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { waveformData } = useDeviceStore()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const centerY = height / 2

    ctx.fillStyle = '#1D2129'
    ctx.fillRect(0, 0, width, height)

    ctx.strokeStyle = '#272E3B'
    ctx.lineWidth = 1
    for (let i = 0; i < width; i += 50) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, height)
      ctx.stroke()
    }
    for (let i = 0; i < height; i += 25) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(width, i)
      ctx.stroke()
    }

    ctx.strokeStyle = '#4E5969'
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()
    ctx.setLineDash([])

    if (waveformData.length > 0) {
      ctx.strokeStyle = '#165DFF'
      ctx.lineWidth = 2
      ctx.beginPath()

      const sliceWidth = width / waveformData.length
      
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * sliceWidth
        const v = waveformData[i]
        const y = centerY + v * centerY * 2

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }

      ctx.stroke()

      ctx.strokeStyle = 'rgba(22, 93, 255, 0.3)'
      ctx.lineWidth = 4
      ctx.beginPath()
      for (let i = 0; i < waveformData.length; i++) {
        const x = i * sliceWidth
        const v = waveformData[i]
        const y = centerY + v * centerY * 2

        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      }
      ctx.stroke()
    }

    ctx.fillStyle = '#4E5969'
    ctx.font = '10px monospace'
    ctx.fillText('1200Hz / 2200Hz FSK', 10, 15)
  }, [waveformData])

  return (
    <div className="bg-dark-800 border border-dark-700 rounded p-4">
      <div className="flex items-center gap-2 mb-3">
        <Waves className="w-5 h-5 text-primary" />
        <h3 className="text-white font-semibold">Waveform Monitor</h3>
        <div className="ml-auto flex items-center gap-2">
          <Activity className={`w-4 h-4 ${waveformData.length > 0 ? 'text-success animate-pulse' : 'text-dark-600'}`} />
          <span className="text-xs text-dark-600">
            {waveformData.length > 0 ? 'Active' : 'No Signal'}
          </span>
        </div>
      </div>
      <div className="bg-dark-900 rounded border border-dark-700 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={120}
          className="w-full"
        />
      </div>
      <div className="flex justify-between mt-2 text-xs text-dark-600">
        <span>Mark: 1200Hz (1)</span>
        <span>Space: 2200Hz (0)</span>
        <span>1200 Baud</span>
      </div>
    </div>
  )
}
