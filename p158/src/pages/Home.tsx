import { useState, useCallback } from 'react';
import { Radio, Github, Info } from 'lucide-react';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useIRIGBDecoder } from '@/hooks/useIRIGBDecoder';
import { AudioControl } from '@/components/AudioControl';
import { WaveformDisplay } from '@/components/WaveformDisplay';
import { TimeDisplay } from '@/components/TimeDisplay';
import { AccuracyPanel } from '@/components/AccuracyPanel';
import { RawDataPanel } from '@/components/RawDataPanel';
import { TimeSourceComparison } from '@/components/TimeSourceComparison';
import { LTCOutput } from '@/components/LTCOutput';
import { useAppStore } from '@/store/useAppStore';

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const { resetDecoder, resetAccuracy, audio } = useAppStore();

  const { processAudioData } = useIRIGBDecoder({
    threshold: 0.3,
    useTestSignal: false,
  });

  const { toggleCapture, isRecording } = useAudioCapture({
    bufferSize: 2048,
    onAudioData: processAudioData,
  });

  const handleToggle = useCallback(async () => {
    if (isRecording) {
      resetDecoder();
      resetAccuracy();
    }
    setIsLoading(true);
    await toggleCapture(audio.deviceId || undefined);
    setIsLoading(false);
  }, [isRecording, toggleCapture, resetDecoder, resetAccuracy, audio.deviceId]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800">
      <header className="border-b border-gray-700/50 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Radio className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">IRIG-B 时间码解码器</h1>
                <p className="text-sm text-gray-400">麦克风音频信号实时解码</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://en.wikipedia.org/wiki/IRIG_timecode"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
                title="IRIG-B 维基百科"
              >
                <Info className="w-5 h-5" />
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700/50"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-6">
            <AudioControl onToggle={handleToggle} isRecording={isRecording} isLoading={isLoading} />
            <TimeDisplay />
            <LTCOutput />
          </div>

          <div className="lg:col-span-8 space-y-6">
            <WaveformDisplay />
            <AccuracyPanel />
            <TimeSourceComparison />
            <RawDataPanel />
          </div>
        </div>

        <div className="mt-8 bg-gray-800/30 rounded-xl p-6 border border-gray-700/50">
          <h3 className="text-lg font-semibold text-white mb-4">使用说明</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-medium">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">
                  1
                </span>
                连接设备
              </div>
              <p className="text-gray-400">
                将IRIG-B信号源通过音频线连接到电脑的麦克风/线路输入接口
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-medium">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">
                  2
                </span>
                选择设备
              </div>
              <p className="text-gray-400">
                从下拉列表中选择对应的音频输入设备，确保信号强度适中
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-blue-400 font-medium">
                <span className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center text-xs">
                  3
                </span>
                开始解码
              </div>
              <p className="text-gray-400">
                点击开始采集按钮，系统将自动检测并解码IRIG-B时间码信号
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-200">
              <p className="font-medium mb-1">注意事项</p>
              <ul className="space-y-1 text-yellow-200/80">
                <li>• 本应用仅支持IRIG-B直流电平(DC)格式，脉冲宽度编码</li>
                <li>• 确保输入信号电平在麦克风可接受范围内，避免过载</li>
                <li>• 时间偏差参考值基于本地系统时间，仅供参考</li>
                <li>• 建议使用屏蔽音频线缆以减少干扰</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-700/50 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <p className="text-center text-gray-500 text-sm">
            IRIG-B Timecode Decoder | 纯前端Web应用 | 所有处理均在浏览器本地完成
          </p>
        </div>
      </footer>
    </div>
  );
}
