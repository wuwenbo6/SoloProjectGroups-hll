import { useMemo } from 'react'
import * as THREE from 'three'

const EARTH_RADIUS = 6.371
const ATMOSPHERE_RADIUS = 6.6

const earthVertexShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const earthFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vPosition;
  void main() {
    float lat = asin(clamp(vNormal.y, -1.0, 1.0));
    float lon = atan(vNormal.z, vNormal.x);
    float pattern = 0.0;
    pattern += step(0.85, sin(lat * 15.0)) * 0.15;
    pattern += step(0.85, sin(lon * 20.0 + sin(lat * 8.0) * 3.0)) * 0.1;
    float noise = fract(sin(dot(vNormal.xy * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 color = mix(vec3(0.02, 0.08, 0.2), vec3(0.05, 0.15, 0.35), pattern + noise * 0.05);
    gl_FragColor = vec4(color, 1.0);
  }
`

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`

const atmosphereFragmentShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float intensity = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.5);
    gl_FragColor = vec4(0.3, 0.6, 1.0, intensity * 0.6);
  }
`

export default function Earth() {
  const earthMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertexShader,
        fragmentShader: earthFragmentShader,
      }),
    [],
  )

  const atmosphereMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  )

  return (
    <group>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <primitive object={earthMaterial} attach="material" />
      </mesh>
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS + 0.005, 48, 48]} />
        <meshBasicMaterial color="#1a3a6e" wireframe transparent opacity={0.15} />
      </mesh>
      <mesh>
        <sphereGeometry args={[ATMOSPHERE_RADIUS, 64, 64]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
    </group>
  )
}