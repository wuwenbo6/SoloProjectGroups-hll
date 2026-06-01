import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '@/store/simulation'
import { geodeticToECI } from '@/utils/orbit'

const ORBIT_SCALE = 0.001
const TERMINAL_COLOR = '#ff4466'

function GroundTerminalMarker({
  terminal,
  simulationTime,
  connectedSatellite,
}: {
  key?: string | number
  terminal: { id: string; name: string; latitude: number; longitude: number; connectedSatelliteId: string | null }
  simulationTime: number
  connectedSatellite?: { position: { x: number; y: number; z: number } }
}) {
  const markerRef = useRef<THREE.Mesh>(null)
  const pulseRef = useRef<THREE.Mesh>(null)

  const eciPos = useMemo(
    () => geodeticToECI(terminal.latitude, terminal.longitude, 0, simulationTime),
    [terminal.latitude, terminal.longitude, simulationTime],
  )

  const scaledPos = useMemo(
    () => [eciPos.x * ORBIT_SCALE, eciPos.y * ORBIT_SCALE, eciPos.z * ORBIT_SCALE] as [number, number, number],
    [eciPos.x, eciPos.y, eciPos.z],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (pulseRef.current) {
      const scale = 1 + Math.sin(t * 4) * 0.4
      pulseRef.current.scale.setScalar(scale)
      const mat = pulseRef.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.4 + Math.sin(t * 4) * 0.3
    }
  })

  return (
    <group position={scaledPos}>
      <mesh ref={markerRef}>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshStandardMaterial
          color={TERMINAL_COLOR}
          emissive={TERMINAL_COLOR}
          emissiveIntensity={1.2}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={TERMINAL_COLOR} transparent opacity={0.5} />
      </mesh>
      {connectedSatellite && (
        <DashedConnectionLine
          start={scaledPos}
          end={[
            connectedSatellite.position.x * ORBIT_SCALE,
            connectedSatellite.position.y * ORBIT_SCALE,
            connectedSatellite.position.z * ORBIT_SCALE,
          ]}
        />
      )}
    </group>
  )
}

function DashedConnectionLine({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array([
      start[0], start[1], start[2],
      end[0], end[1], end[2],
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [start[0], start[1], start[2], end[0], end[1], end[2]])

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineDashedMaterial
        color={TERMINAL_COLOR}
        dashSize={0.08}
        gapSize={0.04}
        transparent
        opacity={0.5}
        toneMapped={false}
      />
    </line>
  )
}

export default function GroundTerminals() {
  const groundTerminals = useSimulationStore((s) => s.groundTerminals)
  const satellites = useSimulationStore((s) => s.satellites)
  const simulationTime = useSimulationStore((s) => s.simulationTime)

  const satMap = useMemo(
    () => new Map(satellites.map((s) => [s.id, s])),
    [satellites],
  )

  return (
    <group>
      {groundTerminals.map((terminal) => (
        <GroundTerminalMarker
          key={terminal.id}
          terminal={terminal}
          simulationTime={simulationTime}
          connectedSatellite={terminal.connectedSatelliteId ? satMap.get(terminal.connectedSatelliteId) : undefined}
        />
      ))}
    </group>
  )
}