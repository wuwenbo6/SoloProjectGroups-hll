import { useEffect, useState } from 'react';
import { useConsoleStore, useWebSocketStore } from '../store/consoleStore';
import { getScenes, getArtNetConfig } from '../lib/api';

export function useConsoleInit() {
  const [loaded, setLoaded] = useState(false);
  const connect = useWebSocketStore((s) => s.connect);
  const setScenes = useConsoleStore((s) => s.setScenes);
  const setArtNetConfig = useConsoleStore((s) => s.setArtNetConfig);

  useEffect(() => {
    const init = async () => {
      try {
        const [scenes, config] = await Promise.all([
          getScenes(),
          getArtNetConfig(),
        ]);

        setScenes(scenes);
        if (config) {
          setArtNetConfig(config);
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      } finally {
        setLoaded(true);
      }
    };

    init();
    connect();

    return () => {
      useWebSocketStore.getState().disconnect();
    };
  }, [connect, setScenes, setArtNetConfig]);

  const refreshScenes = async () => {
    const scenes = await getScenes();
    setScenes(scenes);
  };

  return { loaded, refreshScenes };
}
