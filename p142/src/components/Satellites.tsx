import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSimulationStore } from '@/store/simulation'

const ORBIT_SCALE = 0.001
const SAT_COLOR = '#00ff88'

function OrbitRing({ altitude, inclination, raanDeg }: {
  key?: string | number
  altitude: number
  inclination: number
  raanDeg: number
}) {
  const geometry = useMemo(() => {
    const radius = (6371 + altitude) * ORBIT_SCALE
    const segments = 128
    const positions = new Float32Array(segments * 3)
    const raan = (raanDeg * Math.PI) / 180
    const incl = (inclination * Math.PI) / 180

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const x = radius * Math.cos(angle)
      const y = radius * Math.sin(angle)

      const xRot = x * Math.cos(raan) - y * Math.cos(incl) * Math.sin(raan)
      const yRot = x * Math.sin(raan) + y * Math.cos(incl) * Math.cos(raan)
      const zRot = y * Math.sin(incl)

      positions[i * 3] = xRot
      positions[i * 3 + 1] = zRot
      positions[i * 3 + 2] = yRot
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [altitude, inclination, raanDeg])

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color={SAT_COLOR} transparent opacity={0.25} />
    </line>
  )
}

function Satellite({ id, position, name, isSelected }: {
  key?: string | number
  id: string
  position: { x: number; y: number; z: number }
  name: string
  isSelected: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)

  const scaledPos = useMemo(
    () => [position.x * ORBIT_SCALE, position.y * ORBIT_SCALE, position.z * ORBIT_SCALE] as [number, number, number],
    [position.x, position.y, position.z],
  )

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (glowRef.current) {
      const scale = 1 + Math.sin(t * 3) * 0.1
      glowRef.current.scale.setScalar(scale)
    }
  })

  const selectSatellite = useSimulationStore((s: any) => s.selectSatellite)

  return (
    <group position={scaledPos}>
      <mesh
        ref={meshRef}
        onPointerOver={(e: any) => { e.stopPropagation(); setHovered(true) }}
        onPointerOut={() => setHovered(false)}
        onClick={(e: any) => { e.stopPropagation(); selectSatellite(isSelected ? null : id) }}
      >
        <boxGeometry args={[0.04, 0.04, 0.06]} />
        <meshStandardMaterial
          color={SAT_COLOR}
          emissive={SAT_COLOR}
          emissiveIntensity={isSelected ? 2 : 1}
          toneMapped={false}
        />
      </mesh>
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={SAT_COLOR} transparent opacity={isSelected ? 0.4 : 0.2} />
      </mesh>
      {hovered && (
        <Html center distanceFactor={12} position={[0, 0.12, 0]}>
          <div
            style={{
              background: 'rgba(0, 20, 40, 0.85)',
              border: '1px solid rgba(0, 255, 136, 0.5)',
              borderRadius: 4,
              padding: '4px 8px',
              color: '#00ff88',
              fontSize: 11,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {name}
          </div>
        </Html>
      )}
    </group>
  )
}

export default function Satellites() {
  const satellites = useSimulationStore((s: any) => s.satellites)
  const config = useSimulationStore((s: any) => s.config)
  const selectedSatelliteId = useSimulationStore((s: any) => s.selectedSatelliteId)

  const planes = useMemo(() => {
    const map = new Map<number, number>()
    satellites.forEach((sat: any) => {
      if (!map.has(sat.orbitPlane)) {
        map.set(sat.orbitPlane, sat.orbitPlane)
      }
    })
    return Array.from(map.keys())
  }, [satellites])

  return (
    <group>
      {planes.map((plane: number) => (
        <OrbitRing
          key={plane}
          altitude={config.orbitAltitude}
          inclination={config.orbitInclination}
          raanDeg={(plane * 360) / config.planeCount}
        />
      ))}
      {satellites.map((sat: any) => (
        <Satellite
          key={sat.id}
          id={sat.id}
          position={sat.position}
          name={sat.name}
          isSelected={selectedSatelliteId === sat.id}
        />
      ))}
    </group>
  )
}