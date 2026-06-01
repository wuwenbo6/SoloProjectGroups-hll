import { useEffect, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { useSimulationStore } from '@/store/simulation'
import {
  calculateSatellitePositionWithRAAN,
  calculateSatelliteVelocity,
  calculateLinksWithHysteresis,
  generateGroundTerminals,
  generateWalkerConstellation,
  findBestSatelliteForTerminal,
} from '@/utils/orbit'
import StarField from './StarField'
import Earth from './Earth'
import Satellites from './Satellites'
import Links from './Links'
import GroundTerminals from './GroundTerminals'

function SimulationLoop() {
  const config = useSimulationStore((s) => s.config)
  const simulationTime = useSimulationStore((s) => s.simulationTime)
  const isPlaying = useSimulationStore((s) => s.isPlaying)
  const setSimulationTime = useSimulationStore((s) => s.setSimulationTime)
  const setSatellites = useSimulationStore((s) => s.setSatellites)
  const setLinks = useSimulationStore((s) => s.setLinks)
  const setGroundTerminals = useSimulationStore((s) => s.setGroundTerminals)
  const constellationRef = useRef(generateWalkerConstellation(config))
  const groundTerminalsRef = useRef(generateGroundTerminals())
  const lastLinkUpdate = useRef(0)

  useEffect(() => {
    constellationRef.current = generateWalkerConstellation(config)
    groundTerminalsRef.current = generateGroundTerminals()
  }, [config.satelliteCount, config.orbitAltitude, config.orbitInclination, config.planeCount])

  useFrame((_, delta) => {
    if (!isPlaying) return

    const newTime = simulationTime + delta * config.timeSpeed * 60
    setSimulationTime(newTime)

    const newSatellites = constellationRef.current.map((sat) => {
      const pos = calculateSatellitePositionWithRAAN(
        sat.altitude,
        sat.inclination,
        sat.raan,
        sat.meanAnomaly,
        newTime,
      )
      const vel = calculateSatelliteVelocity(
        sat.altitude,
        sat.inclination,
        sat.raan,
        sat.meanAnomaly,
        newTime,
      )
      return {
        id: sat.id,
        name: sat.name,
        orbitPlane: sat.orbitPlane,
        position: pos,
        velocity: vel,
      }
    })

    setSatellites(newSatellites)

    if (newTime - lastLinkUpdate.current > 0.2) {
      lastLinkUpdate.current = newTime
      const newLinks = calculateLinksWithHysteresis(newSatellites, config.linkThreshold, newTime)
      setLinks(newLinks)

      const updatedTerminals = groundTerminalsRef.current.map((term) => {
        const previousSat = simulationTime > 0
          ? useSimulationStore.getState().groundTerminals.find(t => t.id === term.id)?.connectedSatelliteId
          : null

        const bestSatId = findBestSatelliteForTerminal(
          { latitude: term.latitude, longitude: term.longitude },
          newSatellites,
          previousSat,
        )

        return {
          id: term.id,
          name: term.name,
          latitude: term.latitude,
          longitude: term.longitude,
          connectedSatelliteId: bestSatId,
        }
      })
      setGroundTerminals(updatedTerminals)
    }
  })

  return null
}

function RouteVisualization() {
  const currentRoute = useSimulationStore((s) => s.currentRoute)
  const satellites = useSimulationStore((s) => s.satellites)
  const routeSourceId = useSimulationStore((s) => s.routeSourceId)
  const routeTargetId = useSimulationStore((s) => s.routeTargetId)

  if (!currentRoute || currentRoute.path.length < 2) return null

  const points: [number, number, number][] = currentRoute.path.map(satId => {
    const sat = satellites.find(s => s.id === satId)
    if (!sat) return [0, 0, 0]
    return [sat.position.x / 1000, sat.position.y / 1000, sat.position.z / 1000]
  })

  return (
    <group>
      <Line
        points={points}
        color="#ffaa00"
        lineWidth={3}
        transparent
        opacity={0.9}
      />
      {currentRoute.path.map((satId, i) => {
        const sat = satellites.find(s => s.id === satId)
        if (!sat) return null
        const isSource = satId === routeSourceId
        const isTarget = satId === routeTargetId
        return (
          <mesh
            key={`route-${satId}`}
            position={[sat.position.x / 1000, sat.position.y / 1000, sat.position.z / 1000]}
          >
            <sphereGeometry args={[isSource || isTarget ? 0.08 : 0.05, 16, 16]} />
            <meshBasicMaterial
              color={isSource ? '#00ff88' : isTarget ? '#ff4466' : '#ffaa00'}
              transparent
              opacity={0.9}
            />
          </mesh>
        )
      })}
    </group>
  )
}

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [14, 8, 14], fov: 50, near: 0.1, far: 500 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#020617']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[20, 10, 10]} intensity={0.8} />
      <SimulationLoop />
      <StarField />
      <Earth />
      <Satellites />
      <Links />
      <GroundTerminals />
      <RouteVisualization />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={8}
        maxDistance={60}
        enablePan
      />
      <EffectComposer>
        <Bloom
          intensity={0.6}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  )
}