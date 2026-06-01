import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSimulationStore } from '@/store/simulation'

const ORBIT_SCALE = 0.001
const LINK_COLOR = '#00d4ff'

function LinkLine({ sourcePos, targetPos }: {
  key?: string | number
  sourcePos: { x: number; y: number; z: number }
  targetPos: { x: number; y: number; z: number }
}) {
  const lineRef = useRef<THREE.Line>(null)
  const materialRef = useRef<THREE.LineBasicMaterial>(null)

  const geometry = useMemo(() => {
    const positions = new Float32Array([
      sourcePos.x * ORBIT_SCALE, sourcePos.y * ORBIT_SCALE, sourcePos.z * ORBIT_SCALE,
      targetPos.x * ORBIT_SCALE, targetPos.y * ORBIT_SCALE, targetPos.z * ORBIT_SCALE,
    ])
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [sourcePos.x, sourcePos.y, sourcePos.z, targetPos.x, targetPos.y, targetPos.z])

  useFrame(({ clock }) => {
    if (materialRef.current) {
      const t = clock.getElapsedTime()
      materialRef.current.opacity = 0.5 + Math.sin(t * 2) * 0.3
    }
  })

  return (
    <line ref={lineRef as any}>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial
        ref={materialRef}
        color={LINK_COLOR}
        transparent
        opacity={0.6}
        toneMapped={false}
      />
    </line>
  )
}

export default function Links() {
  const links = useSimulationStore((s: any) => s.links)
  const satellites = useSimulationStore((s: any) => s.satellites)

  const linkData = useMemo(() => {
    const satMap = new Map(satellites.map((s: any) => [s.id, s.position]))
    return links
      .map((link: any) => ({
        id: link.id,
        source: satMap.get(link.sourceId),
        target: satMap.get(link.targetId),
      }))
      .filter((d: any): d is { id: string; source: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } =>
        d.source !== undefined && d.target !== undefined,
      )
  }, [links, satellites])

  return (
    <group>
      {linkData.map((link: any) => (
        <LinkLine key={link.id} sourcePos={link.source} targetPos={link.target} />
      ))}
    </group>
  )
}