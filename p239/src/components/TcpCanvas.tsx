import { useEffect, useRef, useCallback } from 'react'
import { useTcpStore } from '@/store/useTcpStore'
import {
  GRAPH_NODES,
  GRAPH_EDGES,
  NODE_COLORS,
  type TcpState,
  type GraphEdge,
} from '@/utils/tcpGraph'

interface Particle {
  x: number
  y: number
  progress: number
  size: number
  speed: number
  opacity: number
}

const NODE_RADIUS = 34
const PARTICLE_COUNT = 8

export default function TcpCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const activeEdgeRef = useRef<GraphEdge | null>(null)
  const pulsePhaseRef = useRef(0)
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const currentState = useTcpStore((s) => s.currentState)
  const transitioning = useTcpStore((s) => s.transitioning)
  const transitionFrom = useTcpStore((s) => s.transitionFrom)
  const transitionTo = useTcpStore((s) => s.transitionTo)
  const setHoveredNode = useTcpStore((s) => s.setHoveredNode)

  const getNodeColor = (state: TcpState, isCurrent: boolean) => {
    const node = GRAPH_NODES.find((n) => n.id === state)
    if (!node) return NODE_COLORS.client
    if (isCurrent) {
      return {
        fill: '#0e1a29',
        border: '#00e5ff',
        glow: 'rgba(0, 229, 255, 0.8)',
      }
    }
    return NODE_COLORS[node.type]
  }

  const drawArrowhead = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
  ) => {
    const size = 8
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-size, -size * 0.6)
    ctx.lineTo(-size, size * 0.6)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }

  const getBezierPoints = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    from: TcpState,
    to: TcpState,
    isSelfLoop: boolean,
  ) => {
    if (isSelfLoop) {
      const loopRadius = 35
      return {
        cp1x: x1 - loopRadius * 1.5,
        cp1y: y1 - loopRadius * 1.8,
        cp2x: x1 + loopRadius * 1.5,
        cp2y: y1 - loopRadius * 1.8,
        endX: x1,
        endY: y1 - NODE_RADIUS * 0.3,
        startX: x1,
        startY: y1 - NODE_RADIUS * 0.3,
      }
    }

    const dx = x2 - x1
    const dy = y2 - y1
    const dist = Math.sqrt(dx * dx + dy * dy)

    const startOffset = NODE_RADIUS + 4
    const endOffset = NODE_RADIUS + 8
    const startX = x1 + (dx / dist) * startOffset
    const startY = y1 + (dy / dist) * startOffset
    const endX = x2 - (dx / dist) * endOffset
    const endY = y2 - (dy / dist) * endOffset

    const midX = (startX + endX) / 2
    const midY = (startY + endY) / 2

    const perpX = -dy / dist
    const perpY = dx / dist
    const curveAmount = dist * 0.18

    const sameEdge = GRAPH_EDGES.some(
      (e) => e.to === from && e.from === to && e.from !== e.to,
    )
    const finalCurve = sameEdge ? curveAmount * -1 : curveAmount

    return {
      cp1x: midX + perpX * finalCurve - dx * 0.08,
      cp1y: midY + perpY * finalCurve - dy * 0.08,
      cp2x: midX + perpX * finalCurve + dx * 0.08,
      cp2y: midY + perpY * finalCurve + dy * 0.08,
      startX,
      startY,
      endX,
      endY,
    }
  }

  const getPointOnBezier = (
    t: number,
    x1: number,
    y1: number,
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x2: number,
    y2: number,
  ) => {
    const mt = 1 - t
    const x =
      mt * mt * mt * x1 + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * x2
    const y =
      mt * mt * mt * y1 + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * y2
    return { x, y }
  }

  const getBezierTangent = (
    t: number,
    x1: number,
    y1: number,
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x2: number,
    y2: number,
  ) => {
    const mt = 1 - t
    const dx =
      3 * mt * mt * (cp1x - x1) + 6 * mt * t * (cp2x - cp1x) + 3 * t * t * (x2 - cp2x)
    const dy =
      3 * mt * mt * (cp1y - y1) + 6 * mt * t * (cp2y - cp1y) + 3 * t * t * (y2 - cp2y)
    return Math.atan2(dy, dx)
  }

  const drawBackground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7)
    gradient.addColorStop(0, '#0f1825')
    gradient.addColorStop(1, '#0a0e17')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    ctx.strokeStyle = 'rgba(0, 229, 255, 0.03)'
    ctx.lineWidth = 1
    const gridSize = 40
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
  }

  const drawEdge = (
    ctx: CanvasRenderingContext2D,
    edge: GraphEdge,
    isActive: boolean,
    w: number,
    h: number,
  ) => {
    const fromPos = nodePositionsRef.current.get(edge.from)
    const toPos = nodePositionsRef.current.get(edge.to)
    if (!fromPos || !toPos) return

    const isSelfLoop = edge.from === edge.to
    const x1 = fromPos.x
    const y1 = fromPos.y
    const x2 = toPos.x
    const y2 = toPos.y

    const bezier = getBezierPoints(x1, y1, x2, y2, edge.from, edge.to, isSelfLoop)

    if (isActive) {
      ctx.save()
      ctx.shadowBlur = 20
      ctx.shadowColor = '#00e5ff'
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.8)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(bezier.startX, bezier.startY)
      if (isSelfLoop) {
        ctx.bezierCurveTo(bezier.cp1x, bezier.cp1y, bezier.cp2x, bezier.cp2y, x2, y2)
      } else {
        ctx.bezierCurveTo(bezier.cp1x, bezier.cp1y, bezier.cp2x, bezier.cp2y, bezier.endX, bezier.endY)
      }
      ctx.stroke()
      ctx.restore()

      const angle = getBezierTangent(
        0.95,
        bezier.startX,
        bezier.startY,
        bezier.cp1x,
        bezier.cp1y,
        bezier.cp2x,
        bezier.cp2y,
        isSelfLoop ? x2 : bezier.endX,
        isSelfLoop ? y2 : bezier.endY,
      )
      drawArrowhead(
        ctx,
        isSelfLoop ? x2 : bezier.endX,
        isSelfLoop ? y2 : bezier.endY,
        angle,
        '#00e5ff',
      )
    } else {
      ctx.save()
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(bezier.startX, bezier.startY)
      if (isSelfLoop) {
        ctx.bezierCurveTo(bezier.cp1x, bezier.cp1y, bezier.cp2x, bezier.cp2y, x2, y2)
      } else {
        ctx.bezierCurveTo(bezier.cp1x, bezier.cp1y, bezier.cp2x, bezier.cp2y, bezier.endX, bezier.endY)
      }
      ctx.stroke()
      ctx.restore()

      if (!isSelfLoop) {
        const angle = getBezierTangent(
          0.95,
          bezier.startX,
          bezier.startY,
          bezier.cp1x,
          bezier.cp1y,
          bezier.cp2x,
          bezier.cp2y,
          bezier.endX,
          bezier.endY,
        )
        drawArrowhead(
          ctx,
          bezier.endX,
          bezier.endY,
          angle,
          'rgba(148, 163, 184, 0.5)',
        )
      }
    }

    if (!isSelfLoop) {
      const labelPos = getPointOnBezier(
        0.5,
        bezier.startX,
        bezier.startY,
        bezier.cp1x,
        bezier.cp1y,
        bezier.cp2x,
        bezier.cp2y,
        bezier.endX,
        bezier.endY,
      )
      ctx.save()
      ctx.font = '11px JetBrains Mono, monospace'
      ctx.fillStyle = isActive ? '#00e5ff' : 'rgba(148, 163, 184, 0.6)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      const padding = 6
      const metrics = ctx.measureText(edge.label)
      const textW = metrics.width + padding * 2
      const textH = 18

      ctx.fillStyle = isActive ? 'rgba(0, 20, 40, 0.9)' : 'rgba(10, 14, 23, 0.8)'
      ctx.fillRect(labelPos.x - textW / 2, labelPos.y - textH / 2, textW, textH)

      ctx.fillStyle = isActive ? '#00e5ff' : 'rgba(148, 163, 184, 0.7)'
      ctx.fillText(edge.label, labelPos.x, labelPos.y)
      ctx.restore()
    }
  }

  const drawNode = (
    ctx: CanvasRenderingContext2D,
    nodeId: TcpState,
    x: number,
    y: number,
    isCurrent: boolean,
    pulse: number,
  ) => {
    const colors = getNodeColor(nodeId, isCurrent)
    const radius = NODE_RADIUS

    if (isCurrent) {
      for (let i = 3; i >= 0; i--) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(x, y, radius + 8 + i * 6 + Math.sin(pulse + i) * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(0, 229, 255, ${0.06 - i * 0.012})`
        ctx.fill()
        ctx.restore()
      }

      ctx.save()
      ctx.shadowBlur = 25
      ctx.shadowColor = colors.glow
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = colors.fill
      ctx.fill()
      ctx.strokeStyle = colors.border
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.save()
      ctx.shadowBlur = 8
      ctx.shadowColor = colors.glow
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = colors.fill
      ctx.fill()
      ctx.strokeStyle = colors.border
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.75
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.font = 'bold 11px JetBrains Mono, monospace'
    ctx.fillStyle = isCurrent ? '#ffffff' : '#e2e8f0'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const lines = nodeId.split('_')
    const lineHeight = 13
    const startY = y - ((lines.length - 1) * lineHeight) / 2

    lines.forEach((line, i) => {
      ctx.fillText(line, x, startY + i * lineHeight)
    })
    ctx.restore()
  }

  const initParticles = (edge: GraphEdge, w: number, h: number) => {
    const fromPos = nodePositionsRef.current.get(edge.from)
    const toPos = nodePositionsRef.current.get(edge.to)
    if (!fromPos || !toPos) return

    const isSelfLoop = edge.from === edge.to
    const bezier = getBezierPoints(
      fromPos.x,
      fromPos.y,
      toPos.x,
      toPos.y,
      edge.from,
      edge.to,
      isSelfLoop,
    )

    particlesRef.current = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlesRef.current.push({
        x: 0,
        y: 0,
        progress: i * (-0.1),
        size: 3 + Math.random() * 3,
        speed: 0.012 + Math.random() * 0.008,
        opacity: 0.8 - i * 0.08,
      })
    }
    activeEdgeRef.current = edge
  }

  const updateParticles = (w: number, h: number) => {
    if (!activeEdgeRef.current) return

    const edge = activeEdgeRef.current
    const fromPos = nodePositionsRef.current.get(edge.from)
    const toPos = nodePositionsRef.current.get(edge.to)
    if (!fromPos || !toPos) return

    const isSelfLoop = edge.from === edge.to
    const bezier = getBezierPoints(
      fromPos.x,
      fromPos.y,
      toPos.x,
      toPos.y,
      edge.from,
      edge.to,
      isSelfLoop,
    )

    particlesRef.current = particlesRef.current.filter((p) => p.progress < 1.3)

    particlesRef.current.forEach((p) => {
      p.progress += p.speed
      const t = Math.max(0, Math.min(1, p.progress))
      const pos = getPointOnBezier(
        t,
        bezier.startX,
        bezier.startY,
        bezier.cp1x,
        bezier.cp1y,
        bezier.cp2x,
        bezier.cp2y,
        isSelfLoop ? toPos.x : bezier.endX,
        isSelfLoop ? toPos.y : bezier.endY,
      )
      p.x = pos.x
      p.y = pos.y

      if (p.progress > 1) {
        p.opacity = Math.max(0, p.opacity - 0.05)
      }
    })
  }

  const drawParticles = (ctx: CanvasRenderingContext2D) => {
    particlesRef.current.forEach((p) => {
      if (p.progress < 0 || p.progress > 1.2) return

      ctx.save()
      ctx.shadowBlur = 15
      ctx.shadowColor = '#00e5ff'
      ctx.globalAlpha = p.opacity
      ctx.fillStyle = '#00e5ff'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      ctx.save()
      ctx.globalAlpha = p.opacity * 0.5
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    })
  }

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    drawBackground(ctx, w, h)

    GRAPH_NODES.forEach((node) => {
      nodePositionsRef.current.set(node.id, {
        x: node.x * w,
        y: node.y * h,
      })
    })

    pulsePhaseRef.current += 0.05

    if (transitioning && transitionFrom && transitionTo) {
      const activeEdge = GRAPH_EDGES.find(
        (e) => e.from === transitionFrom && e.to === transitionTo,
      )
      if (activeEdge && !activeEdgeRef.current) {
        initParticles(activeEdge, w, h)
      }
    }

    if (!transitioning) {
      activeEdgeRef.current = null
      particlesRef.current = []
    }

    GRAPH_EDGES.forEach((edge) => {
      const isActive =
        transitioning && edge.from === transitionFrom && edge.to === transitionTo
      drawEdge(ctx, edge, isActive, w, h)
    })

    updateParticles(w, h)
    drawParticles(ctx)

    GRAPH_NODES.forEach((node) => {
      const pos = nodePositionsRef.current.get(node.id)
      if (!pos) return
      const isCurrent = node.id === currentState
      drawNode(ctx, node.id, pos.x, pos.y, isCurrent, pulsePhaseRef.current)
    })

    animationRef.current = requestAnimationFrame(render)
  }, [currentState, transitioning, transitionFrom, transitionTo])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      let hovered: string | null = null
      GRAPH_NODES.forEach((node) => {
        const pos = nodePositionsRef.current.get(node.id)
        if (!pos) return
        const dx = mx - pos.x
        const dy = my - pos.y
        if (Math.sqrt(dx * dx + dy * dy) < NODE_RADIUS) {
          hovered = node.id
        }
      })
      setHoveredNode(hovered)
    },
    [setHoveredNode],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove)
    }
    return () => {
      if (canvas) {
        canvas.removeEventListener('mousemove', handleMouseMove)
      }
    }
  }, [handleMouseMove])

  useEffect(() => {
    animationRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animationRef.current)
  }, [render])

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ touchAction: 'none' }}
      />
    </div>
  )
}
