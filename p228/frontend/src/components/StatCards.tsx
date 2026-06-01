import { HardDrive, AlertTriangle, Thermometer, CheckCircle } from 'lucide-react';
import type { SlotStatus, TempSensor } from '@/types';

interface StatCardsProps {
  slots: SlotStatus[];
  temperatures: TempSensor[];
}

export function StatCards({ slots, temperatures }: StatCardsProps) {
  const totalSlots = slots.length;
  const presentSlots = slots.filter((s) => s.present).length;
  const faultSlots = slots.filter((s) => s.fault).length;
  const warningTemps = temperatures.filter(
    (t) => t.warning !== undefined && t.current >= t.warning
  ).length;

  const stats = [
    {
      label: '总槽位数',
      value: totalSlots,
      icon: HardDrive,
      color: 'text-primary-400',
      bgColor: 'bg-primary-500/10',
      borderColor: 'border-primary-500/20',
    },
    {
      label: '在线硬盘',
      value: presentSlots,
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10',
      borderColor: 'border-success/20',
    },
    {
      label: '故障槽位',
      value: faultSlots,
      icon: AlertTriangle,
      color: faultSlots > 0 ? 'text-danger' : 'text-dark-500',
      bgColor: faultSlots > 0 ? 'bg-danger/10' : 'bg-dark-200',
      borderColor: faultSlots > 0 ? 'border-danger/20' : 'border-dark-300',
    },
    {
      label: '温度告警',
      value: warningTemps,
      icon: Thermometer,
      color: warningTemps > 0 ? 'text-warning' : 'text-dark-500',
      bgColor: warningTemps > 0 ? 'bg-warning/10' : 'bg-dark-200',
      borderColor: warningTemps > 0 ? 'border-warning/20' : 'border-dark-300',
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className={`p-5 rounded-xl border ${stat.borderColor} ${stat.bgColor} transition-all duration-300 hover:scale-[1.02]`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-500 mb-1">{stat.label}</p>
                <p className={`text-3xl font-bold font-mono ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                <Icon className={`w-6 h-6 ${stat.color}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
