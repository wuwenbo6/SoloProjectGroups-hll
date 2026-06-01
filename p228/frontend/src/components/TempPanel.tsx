import { Thermometer, AlertTriangle, AlertCircle } from 'lucide-react';
import type { TempSensor } from '@/types';

interface TempPanelProps {
  sensors: TempSensor[];
}

export function TempPanel({ sensors }: TempPanelProps) {
  const getStatus = (sensor: TempSensor) => {
    if (sensor.critical !== undefined && sensor.current >= sensor.critical) {
      return 'critical';
    }
    if (sensor.warning !== undefined && sensor.current >= sensor.warning) {
      return 'warning';
    }
    return 'normal';
  };

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'bg-danger';
      case 'warning':
        return 'bg-warning';
      default:
        return 'bg-success';
    }
  };

  const getTextColor = (status: string) => {
    switch (status) {
      case 'critical':
        return 'text-danger';
      case 'warning':
        return 'text-warning';
      default:
        return 'text-success';
    }
  };

  return (
    <div className="bg-dark-100 rounded-2xl p-5 border border-dark-300">
      <div className="flex items-center gap-2 mb-4">
        <Thermometer className="w-5 h-5 text-primary-400" />
        <h3 className="text-lg font-semibold text-white">温度监控</h3>
      </div>

      <div className="space-y-4">
        {sensors.map((sensor) => {
          const status = getStatus(sensor);
          const maxTemp = sensor.max || 60;
          const minTemp = sensor.min || 0;
          const progress = ((sensor.current - minTemp) / (maxTemp - minTemp)) * 100;

          return (
            <div key={sensor.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dark-500">{sensor.name}</span>
                <div className="flex items-center gap-2">
                  {status === 'critical' && (
                    <AlertCircle className="w-4 h-4 text-danger animate-blink" />
                  )}
                  {status === 'warning' && (
                    <AlertTriangle className="w-4 h-4 text-warning animate-blink" />
                  )}
                  <span
                    className={`font-mono font-bold text-lg ${getTextColor(status)} ${
                      status !== 'normal' ? 'animate-blink' : ''
                    }`}
                  >
                    {sensor.current.toFixed(1)}°C
                  </span>
                </div>
              </div>

              <div className="relative h-2 bg-dark-300 rounded-full overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${getProgressColor(
                    status
                  )}`}
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
                {sensor.warning !== undefined && (
                  <div
                    className="absolute top-0 h-full w-0.5 bg-warning/50"
                    style={{
                      left: `${((sensor.warning - minTemp) / (maxTemp - minTemp)) * 100}%`,
                    }}
                  />
                )}
                {sensor.critical !== undefined && (
                  <div
                    className="absolute top-0 h-full w-0.5 bg-danger/50"
                    style={{
                      left: `${((sensor.critical - minTemp) / (maxTemp - minTemp)) * 100}%`,
                    }}
                  />
                )}
              </div>

              <div className="flex justify-between text-xs text-dark-400">
                <span>{minTemp}°C</span>
                <span>{maxTemp}°C</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
