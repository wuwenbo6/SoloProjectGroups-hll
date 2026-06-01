import { useRef, useEffect, useCallback } from "react"
import { useTopologyStore } from "@/stores/topology"
import type { Device, Link, DeviceRole, Capabilities } from "@/types"

const NODE_W = 140
const NODE_H = 70
const GRID_SPACING = 40

interface NodePos {
  x: number
  y: number
  vx: number
  vy: number
  pinned: boolean
}

interface Transform {
  x: number
  y: number
  scale: number
}

interface DragState {
  type: "node" | "pan" | "none"
  nodeId: string | null
  startX: number
  startY: number
  startTransformX: number
  startTransformY: number
  startNodeX: number
  startNodeY: number
}

const ROLE_STYLES: Record<DeviceRole, {
  gradient: [string, string]
  borderColor: string
  glowColor: string
  icon: string
  label: string
}> = {
  router: {
    gradient: ["#1a3a2e", "#0f2a1e"],
    borderColor: "#22c55e",
    glowColor: "#22c55e",
    icon: "⬡",
    label: "Router",
  },
  switch: {
    gradient: ["#1e2748", "#151b35"],
    borderColor: "#00d4ff",
    glowColor: "#00d4ff",
    icon: "⬢",
    label: "Switch",
  },
  wlan: {
    gradient: ["#2a1a3e", "#1e0f2e"],
    borderColor: "#c084fc",
    glowColor: "#c084fc",
    icon: "◎",
    label: "WLAN",
  },
  station: {
    gradient: ["#2a2a1a", "#1e1e0f"],
    borderColor: "#facc15",
    glowColor: "#facc15",
    icon: "◆",
    label: "Station",
  },
  other: {
    gradient: ["#2a1a1a", "#1e0f0f"],
    borderColor: "#f87171",
    glowColor: "#f87171",
    icon: "◇",
    label: "Other",
  },
}

function inferRole(cap: Capabilities | undefined): DeviceRole {
  if (!cap || (!cap.available?.length && !cap.enabled?.length)) {
    return "switch"
  }
  const enabled = cap.enabled || []
  const available = cap.available || []
  if (enabled.includes("Router") && enabled.includes("Bridge")) return "router"
  if (enabled.includes("Router")) return "router"
  if (enabled.includes("WLAN")) return "wlan"
  if (enabled.includes("Bridge")) return "switch"
  if (enabled.includes("Station") || available.includes("Station")) return "station"
  if (available.includes("Router")) return "router"
  if (available.includes("Bridge")) return "switch"
  return "other"
}

function initPositionsFR(devices: Device[], w: number, h: number): Map<string, NodePos> {
  const m = new Map<string, NodePos>()
  const padX = 120
  const padY = 100
  for (let i = 0; i < devices.length; i++) {
    const angle = (2 * Math.PI * i) / devices.length
    const rx = (w / 2 - padX) * 0.6
    const ry = (h / 2 - padY) * 0.6
    m.set(devices[i].id, {
      x: w / 2 + rx * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: h / 2 + ry * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
      pinned: false,
    })
  }
  return m
}

function fruchtermanReingoldStep(
  pos: Map<string, NodePos>,
  links: Link[],
  area: number,
  temperature: number
): number {
  const ids = Array.from(pos.keys())
  const n = ids.length
  if (n === 0) return 0

  const k = Math.sqrt(area / n)
  const kSq = k * k

  const disp = new Map<string, { dx: number; dy: number }>()
  for (const id of ids) disp.set(id, { dx: 0, dy: 0 })

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const vi = pos.get(ids[i])!
      const vj = pos.get(ids[j])!
      let dx = vi.x - vj.x
      let dy = vi.y - vj.y
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
      const force = kSq / dist
      const fx = (dx / dist) * force
      const fy = (dy / dist) * force
      disp.get(ids[i])!.dx += fx
      disp.get(ids[i])!.dy += fy
      disp.get(ids[j])!.dx -= fx
      disp.get(ids[j])!.dy -= fy
    }
  }

  for (const link of links) {
    const vi = pos.get(link.sourceDeviceId)
    const vj = pos.get(link.targetDeviceId)
    if (!vi || !vj) continue
    let dx = vi.x - vj.x
    let dy = vi.y - vj.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01
    const force = (dist * dist) / k
    const fx = (dx / dist) * force
    const fy = (dy / dist) * force
    disp.get(link.sourceDeviceId)!.dx -= fx
    disp.get(link.sourceDeviceId)!.dy -= fy
    disp.get(link.targetDeviceId)!.dx += fx
    disp.get(link.targetDeviceId)!.dy += fy
  }

  let maxDisp = 0
  for (const id of ids) {
    const v = pos.get(id)!
    if (v.pinned) continue
    const d = disp.get(id)!
    const dist = Math.sqrt(d.dx * d.dx + d.dy * d.dy) || 0.01
    const capped = Math.min(dist, temperature)
    const nx = v.x + (d.dx / dist) * capped
    const ny = v.y + (d.dy / dist) * capped
    const pad = 80
    v.x = Math.max(pad, Math.min(area / Math.sqrt(n) * 2 - pad, nx))
    v.y = Math.max(pad, Math.min(area / Math.sqrt(n) * 2 - pad, ny))
    maxDisp = Math.max(maxDisp, capped)
  }

  return maxDisp
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, tf: Transform) {
  ctx.fillStyle = "#0a0e27"
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = "#1a2040"
  const step = GRID_SPACING * tf.scale
  if (step < 8) return
  const offX = tf.x % step
  const offY = tf.y % step
  for (let x = offX; x < w; x += step) {
    for (let y = offY; y < h; y += step) {
      ctx.beginPath()
      ctx.arc(x, y, 1, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function toScreen(x: number, y: number, tf: Transform) {
  return { sx: x * tf.scale + tf.x, sy: y * tf.scale + tf.y }
}

function toWorld(sx: number, sy: number, tf: Transform) {
  return { x: (sx - tf.x) / tf.scale, y: (sy - tf.y) / tf.scale }
}

function drawLink(
  ctx: CanvasRenderingContext2D,
  link: Link,
  pos: Map<string, NodePos>,
  tf: Transform,
  dashOffset: number,
  devices: Device[]
) {
  const sp = pos.get(link.sourceDeviceId)
  const tp = pos.get(link.targetDeviceId)
  if (!sp || !tp) return
  const s = toScreen(sp.x, sp.y, tf)
  const t = toScreen(tp.x, tp.y, tf)
  const mx = (s.sx + t.sx) / 2
  const my = (s.sy + t.sy) / 2
  const dx = t.sx - s.sx
  const dy = t.sy - s.sy
  const cx = mx - dy * 0.08
  const cy = my + dx * 0.08

  ctx.beginPath()
  ctx.moveTo(s.sx, s.sy)
  ctx.quadraticCurveTo(cx, cy, t.sx, t.sy)
  ctx.strokeStyle = "rgba(0, 212, 255, 0.3)"
  ctx.lineWidth = 2
  ctx.setLineDash([8, 6])
  ctx.lineDashOffset = -dashOffset
  ctx.stroke()
  ctx.setLineDash([])

  const srcDev = devices.find((d) => d.id === link.sourceDeviceId)
  const tgtDev = devices.find((d) => d.id === link.targetDeviceId)
  ctx.font = "10px 'JetBrains Mono', monospace"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  if (srcDev) {
    const port = srcDev.ports.find((p) => p.id === link.sourcePortId)
    if (port) {
      const lx = s.sx + (t.sx - s.sx) * 0.15
      const ly = s.sy + (t.sy - s.sy) * 0.15 - 8
      ctx.fillStyle = "rgba(0, 212, 255, 0.5)"
      ctx.fillText(port.id, lx, ly)
    }
  }
  if (tgtDev) {
    const port = tgtDev.ports.find((p) => p.id === link.targetPortId)
    if (port) {
      const lx = s.sx + (t.sx - s.sx) * 0.85
      const ly = s.sy + (t.sy - s.sy) * 0.85 + 8
      ctx.fillStyle = "rgba(0, 212, 255, 0.5)"
      ctx.fillText(port.id, lx, ly)
    }
  }
  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"
}

function drawNode(
  ctx: CanvasRenderingContext2D,
  device: Device,
  sp: { sx: number; sy: number },
  selected: boolean,
  tf: Transform
) {
  const role = inferRole(device.capabilities)
  const style = ROLE_STYLES[role]
  const w = NODE_W * tf.scale
  const h = NODE_H * tf.scale
  const x = sp.sx - w / 2
  const y = sp.sy - h / 2
  const r = 8 * tf.scale

  if (device.status === "online") {
    ctx.shadowColor = selected ? "#ffffff" : style.glowColor
    ctx.shadowBlur = selected ? 24 : 12
  }

  const grad = ctx.createLinearGradient(x, y, x, y + h)
  grad.addColorStop(0, style.gradient[0])
  grad.addColorStop(1, style.gradient[1])
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  if (selected) {
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2.5
  } else {
    ctx.strokeStyle = style.borderColor + "88"
    ctx.lineWidth = 1.5
  }
  ctx.stroke()
  ctx.shadowColor = "transparent"
  ctx.shadowBlur = 0

  const dotR = 4 * tf.scale
  ctx.beginPath()
  ctx.arc(x + w - dotR * 2.5, y + dotR * 2.5, dotR, 0, Math.PI * 2)
  ctx.fillStyle = device.status === "online" ? "#4ade80" : "#ef4444"
  ctx.fill()

  const iconSize = Math.max(10, 14 * tf.scale)
  ctx.font = `${iconSize}px sans-serif`
  ctx.fillStyle = style.borderColor
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  ctx.fillText(style.icon, x + 6 * tf.scale, sp.sy - 6 * tf.scale)

  const nameSize = Math.max(10, 12 * tf.scale)
  ctx.font = `bold ${nameSize}px 'Noto Sans SC', sans-serif`
  ctx.fillStyle = "#ffffff"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const maxTextW = w - 36 * tf.scale
  let name = device.systemName || device.id.slice(0, 12)
  while (ctx.measureText(name).width > maxTextW && name.length > 3) {
    name = name.slice(0, -4) + "..."
  }
  ctx.fillText(name, sp.sx + 6 * tf.scale, sp.sy - 6 * tf.scale)

  const roleSize = Math.max(7, 9 * tf.scale)
  ctx.font = `${roleSize}px 'JetBrains Mono', monospace`
  ctx.fillStyle = style.borderColor
  let roleLabel = style.label
  const cap = device.capabilities
  if (cap?.enabled?.length) {
    const capStr = cap.enabled.join("+")
    if (ctx.measureText(capStr).width < maxTextW) roleLabel = capStr
  }
  ctx.fillText(roleLabel, sp.sx + 6 * tf.scale, sp.sy + 10 * tf.scale)

  const idSize = Math.max(7, 8 * tf.scale)
  ctx.font = `${idSize}px 'JetBrains Mono', monospace`
  ctx.fillStyle = "#6666aa"
  let cid = device.chassisId
  while (ctx.measureText(cid).width > maxTextW && cid.length > 3) {
    cid = cid.slice(0, -4) + "..."
  }
  ctx.fillText(cid, sp.sx + 6 * tf.scale, sp.sy + 22 * tf.scale)

  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"
}

function drawLegend(ctx: CanvasRenderingContext2D, w: number) {
  const roles: DeviceRole[] = ["router", "switch", "wlan", "station", "other"]
  const lx = w - 180
  const ly = 52

  ctx.fillStyle = "rgba(10, 14, 39, 0.85)"
  ctx.strokeStyle = "#2a3050"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(lx - 12, ly - 12, 180, roles.length * 22 + 12, 6)
  ctx.fill()
  ctx.stroke()

  ctx.font = "10px 'Noto Sans SC', sans-serif"
  ctx.textAlign = "left"
  ctx.textBaseline = "middle"
  for (let i = 0; i < roles.length; i++) {
    const style = ROLE_STYLES[roles[i]]
    const cy = ly + i * 22 + 4
    ctx.fillStyle = style.borderColor
    ctx.font = "14px sans-serif"
    ctx.fillText(style.icon, lx, cy)
    ctx.fillStyle = "#ccccdd"
    ctx.font = "11px 'Noto Sans SC', sans-serif"
    ctx.fillText(style.label, lx + 20, cy)
  }
  ctx.textAlign = "start"
  ctx.textBaseline = "alphabetic"
}

function hitTest(
  mx: number,
  my: number,
  pos: Map<string, NodePos>,
  tf: Transform
): string | null {
  for (const [id, p] of pos) {
    const s = toScreen(p.x, p.y, tf)
    const hw = (NODE_W * tf.scale) / 2
    const hh = (NODE_H * tf.scale) / 2
    if (mx >= s.sx - hw && mx <= s.sx + hw && my >= s.sy - hh && my <= s.sy + hh) {
      return id
    }
  }
  return null
}

export default function TopologyCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const posRef = useRef<Map<string, NodePos>>(new Map())
  const tfRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const dragRef = useRef<DragState>({
    type: "none", nodeId: null, startX: 0, startY: 0,
    startTransformX: 0, startTransformY: 0, startNodeX: 0, startNodeY: 0,
  })
  const dashRef = useRef(0)
  const animRef = useRef(0)
  const tempRef = useRef(300)
  const layoutInitRef = useRef(false)
  const topology = useTopologyStore((s) => s.topology)
  const selectedDeviceId = useTopologyStore((s) => s.selectedDeviceId)
  const selectDevice = useTopologyStore((s) => s.selectDevice)

  const devices = topology?.devices || []
  const links = topology?.links || []

  const computeLayout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || devices.length === 0) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    const existing = posRef.current
    const newIds = new Set(devices.map((d) => d.id))
    let changed = false
    for (const id of newIds) {
      if (!existing.has(id)) changed = true
    }
    for (const id of existing.keys()) {
      if (!newIds.has(id)) changed = true
    }
    if (!changed && layoutInitRef.current) return

    const newPos = initPositionsFR(devices, w, h)
    for (const [id, p] of existing) {
      if (newPos.has(id)) {
        const np = newPos.get(id)!
        np.x = p.x
        np.y = p.y
        np.pinned = p.pinned
      }
    }

    const area = w * h
    const initTemp = Math.min(w, h) / 2
    tempRef.current = initTemp
    const coolingFactor = 0.92
    let temp = initTemp
    for (let i = 0; i < 200; i++) {
      fruchtermanReingoldStep(newPos, links, area, temp)
      temp *= coolingFactor
    }
    tempRef.current = temp

    for (const [id, p] of existing) {
      if (newPos.has(id) && p.pinned) {
        const np = newPos.get(id)!
        np.x = p.x
        np.y = p.y
        np.pinned = true
      }
    }

    posRef.current = newPos
    layoutInitRef.current = true

    if (tfRef.current.x === 0 && tfRef.current.y === 0) {
      const xs = Array.from(newPos.values()).map((p) => p.x)
      const ys = Array.from(newPos.values()).map((p) => p.y)
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2
      tfRef.current.x = w / 2 - cx
      tfRef.current.y = h / 2 - cy
    }
  }, [devices, links])

  useEffect(() => {
    computeLayout()
  }, [computeLayout])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")!
    let running = true
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    let tick = 0

    const render = () => {
      if (!running) return
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const tf = tfRef.current
      const pos = posRef.current

      tick++
      if (tick % 3 === 0 && tempRef.current > 0.5) {
        const area = w * h
        fruchtermanReingoldStep(pos, links, area, tempRef.current)
        tempRef.current *= 0.98
      }

      dashRef.current += 0.5
      drawGrid(ctx, w, h, tf)

      for (const link of links) {
        drawLink(ctx, link, pos, tf, dashRef.current, devices)
      }
      for (const device of devices) {
        const p = pos.get(device.id)
        if (!p) continue
        const s = toScreen(p.x, p.y, tf)
        drawNode(ctx, device, s, device.id === selectedDeviceId, tf)
      }

      drawLegend(ctx, w)

      animRef.current = requestAnimationFrame(render)
    }
    animRef.current = requestAnimationFrame(render)
    return () => {
      running = false
      cancelAnimationFrame(animRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [devices, links, selectedDeviceId])

  const getMousePos = useCallback((e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { mx: e.clientX - r.left, my: e.clientY - r.top }
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const { mx, my } = getMousePos(e)
    const tf = tfRef.current
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      dragRef.current = {
        type: "pan", nodeId: null, startX: mx, startY: my,
        startTransformX: tf.x, startTransformY: tf.y, startNodeX: 0, startNodeY: 0,
      }
      return
    }
    const hit = hitTest(mx, my, posRef.current, tf)
    if (hit) {
      const p = posRef.current.get(hit)!
      p.pinned = true
      dragRef.current = {
        type: "node", nodeId: hit, startX: mx, startY: my,
        startTransformX: tf.x, startTransformY: tf.y, startNodeX: p.x, startNodeY: p.y,
      }
    } else {
      selectDevice(null)
      dragRef.current = {
        type: "pan", nodeId: null, startX: mx, startY: my,
        startTransformX: tf.x, startTransformY: tf.y, startNodeX: 0, startNodeY: 0,
      }
    }
  }, [getMousePos, selectDevice])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const drag = dragRef.current
    if (drag.type === "none") return
    const { mx, my } = getMousePos(e)
    const tf = tfRef.current
    if (drag.type === "pan") {
      tf.x = drag.startTransformX + (mx - drag.startX)
      tf.y = drag.startTransformY + (my - drag.startY)
    } else if (drag.type === "node" && drag.nodeId) {
      const w = toWorld(mx, my, tf)
      const pos = posRef.current
      const p = pos.get(drag.nodeId)
      if (p) {
        p.x = w.x
        p.y = w.y
      }
    }
  }, [getMousePos])

  const onMouseUp = useCallback(() => {
    if (dragRef.current.type === "node" && dragRef.current.nodeId) {
      const p = posRef.current.get(dragRef.current.nodeId)
      if (p) p.pinned = false
    }
    dragRef.current = {
      type: "none", nodeId: null, startX: 0, startY: 0,
      startTransformX: 0, startTransformY: 0, startNodeX: 0, startNodeY: 0,
    }
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const { mx, my } = getMousePos(e)
    const tf = tfRef.current
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.min(3, Math.max(0.2, tf.scale * delta))
    const ratio = newScale / tf.scale
    tf.x = mx - (mx - tf.x) * ratio
    tf.y = my - (my - tf.y) * ratio
    tf.scale = newScale
  }, [getMousePos])

  const onClick = useCallback((e: React.MouseEvent) => {
    if (dragRef.current.type !== "none") return
    const { mx, my } = getMousePos(e)
    const hit = hitTest(mx, my, posRef.current, tfRef.current)
    if (hit) selectDevice(hit)
  }, [getMousePos, selectDevice])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onClick}
      onWheel={onWheel}
    />
  )
}
