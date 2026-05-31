import React, { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import * as THREE from 'three';

function Model({ url }) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    if (url) {
      const loader = new STLLoader();
      loader.load(
        url,
        (geo) => {
          geo.computeVertexNormals();
          setGeometry(geo);
        },
        undefined,
        (error) => {
          console.error('加载STL失败:', error);
        }
      );
    }
  }, [url]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color="#e94560" 
        metalness={0.3} 
        roughness={0.4}
        flatShading={false}
      />
    </mesh>
  );
}

function GridFloor() {
  return (
    <gridHelper args={[200, 20, 0x444444, 0x222222]} position={[0, -0.5, 0]} />
  );
}

function ProgressBar({ progress }) {
  return (
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '300px',
      zIndex: 20
    }}>
      <div style={{
        background: 'rgba(0, 0, 0, 0.6)',
        padding: '10px 15px',
        borderRadius: '8px',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{
          fontSize: '13px',
          color: '#fff',
          marginBottom: '8px',
          textAlign: 'center'
        }}>
          正在渲染模型...
        </div>
        <div style={{
          width: '100%',
          height: '6px',
          background: '#1a5276',
          borderRadius: '3px',
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${progress}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #e94560, #f39c12)',
            borderRadius: '3px',
            transition: 'width 0.3s ease'
          }}></div>
        </div>
        <div style={{
          fontSize: '11px',
          color: '#888',
          marginTop: '6px',
          textAlign: 'right'
        }}>
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}

function Viewer({ stlUrl, status, renderProgress }) {
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Canvas
        camera={{ position: [100, 100, 100], fov: 45 }}
        shadows
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0a0a1a']} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[100, 100, 50]}
          intensity={1}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-50, 50, -50]} intensity={0.5} color="#4a90d9" />
        
        <Suspense fallback={null}>
          <Model url={stlUrl} />
          <Environment preset="city" />
        </Suspense>
        
        <GridFloor />
        <ContactShadows
          position={[0, -0.4, 0]}
          opacity={0.5}
          scale={200}
          blur={2}
          far={10}
        />
        
        <OrbitControls
          enableDamping
          dampingFactor={0.05}
          minDistance={20}
          maxDistance={500}
        />
      </Canvas>

      {status === 'loading' && (
        <ProgressBar progress={renderProgress} />
      )}

      {status === 'loading' && !stlUrl && (
        <div className="loading-overlay">
          <div style={{ textAlign: 'center' }}>
            <div className="spinner"></div>
            <div style={{ marginTop: '16px', color: '#fff' }}>正在渲染...</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Viewer;