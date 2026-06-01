import { Stars } from '@react-three/drei'

export default function StarField() {
  return (
    <Stars
      radius={200}
      depth={60}
      count={6000}
      factor={5}
      saturation={0}
      fade
      speed={0.5}
    />
  )
}