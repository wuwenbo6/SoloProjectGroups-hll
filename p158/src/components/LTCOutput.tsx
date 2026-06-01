import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import {
  generateLTCFromDate,
  generateLTCWAV,
  downloadWAV,
  ltcPlayer,
  formatSMPTETime,
  parseSMPTEFromDate,
  FRAME_RATE_CONFIG,
  FrameRate,
} from '../utils/smpteLtc';

export function LTCOutput() {
  const {
    ltc,
    decodedTime,
    setLTCPlaying,
    setLTCFrameRate,
    setLTCVolume,
    setLTCLoop,
    setLTCDuration,
    setLTCTime,
  } = useAppStore();

  const [currentSMPTETime, setCurrentSMPTETime] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const updateTime = () => {
      const now = decodedTime
        ? new Date(decodedTime.timestamp)
        : new Date();
      const smpteTime = parseSMPTEFromDate(now, ltc.frameRate);
      setCurrentSMPTETime(formatSMPTETime(smpteTime, ltc.frameRate));
      setLTCTime(smpteTime);
    };

    updateTime();
    const interval = setInterval(updateTime, 40);
    return () => clearInterval(interval);
  }, [decodedTime, ltc.frameRate, setLTCTime]);

  const handlePlay = useCallback(async () => {
    if (ltc.isPlaying) {
      ltcPlayer.stop();
      setLTCPlaying(false);
      return;
    }

    setIsGenerating(true);
    try {
      const now = decodedTime
        ? new Date(decodedTime.timestamp)
        : new Date();

      const samples = generateLTCFromDate(
        now,
        ltc.frameRate,
        48000,
        ltc.durationSeconds
      );

      ltcPlayer.setVolume(ltc.volume);
      await ltcPlayer.play(samples, 48000, ltc.isLoop);
      setLTCPlaying(true);
    } catch (e) {
      console.error('LTC播放失败:', e);
    } finally {
      setIsGenerating(false);
    }
  }, [decodedTime, ltc.frameRate, ltc.isLoop, ltc.volume, ltc.durationSeconds, ltc.isPlaying, setLTCPlaying]);

  const handleDownload = useCallback(() => {
    setIsGenerating(true);
    try {
      const now = decodedTime
        ? new Date(decodedTime.timestamp)
        : new Date();

      const samples = generateLTCFromDate(
        now,
        ltc.frameRate,
        48000,
        ltc.durationSeconds
      );

      const wavBuffer = generateLTCWAV(samples, 48000);
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadWAV(wavBuffer, `ltc_${ltc.frameRate}fps_${timestamp}.wav`);
    } catch (e) {
      console.error('LTC生成失败:', e);
    } finally {
      setIsGenerating(false);
    }
  }, [decodedTime, ltc.frameRate, ltc.durationSeconds]);

  useEffect(() => {
    return () => {
      ltcPlayer.stop();
    };
  }, []);

  const frameRateOptions: { value: FrameRate; label: string }[] = [
    { value: '24', label: '24 fps (电影)' },
    { value: '25', label: '25 fps (PAL)' },
    { value: '30', label: '30 fps (NTSC)' },
    { value: '30drop', label: '30 fps (Drop Frame)' },
  ];

  const durationOptions = [1, 5, 10, 30, 60];

  return (
    <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-6 border border-gray-700">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <span className="text-2xl">🎬</span>
        SMPTE LTC 时间码输出
      </h3>

      <div className="space-y-6">
        <div className="bg-gray-900/50 rounded-lg p-6 text-center">
          <p className="text-xs text-gray-400 mb-2">SMPTE 时间码</p>
          <p className="text-4xl font-mono font-bold text-green-400 tracking-wider">
            {currentSMPTETime}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            {decodedTime ? '基于IRIG-B解码时间' : '基于系统时间'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">帧速率</label>
            <select
              value={ltc.frameRate}
              onChange={(e) => setLTCFrameRate(e.target.value as FrameRate)}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {frameRateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">时长</label>
            <select
              value={ltc.durationSeconds}
              onChange={(e) => setLTCDuration(Number(e.target.value))}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {durationOptions.map((d) => (
                <option key={d} value={d}>
                  {d} 秒
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-gray-400">音量</label>
            <span className="text-sm text-gray-500">
              {Math.round(ltc.volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={ltc.volume}
            onChange={(e) => {
              const volume = Number(e.target.value);
              setLTCVolume(volume);
              ltcPlayer.setVolume(volume);
            }}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ltc.isLoop}
              onChange={(e) => setLTCLoop(e.target.checked)}
              className="w-4 h-4 accent-green-500"
            />
            <span className="text-sm text-gray-400">循环播放</span>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handlePlay}
            disabled={isGenerating}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all ${
              ltc.isPlaying
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-green-500 hover:bg-green-600 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-xl">{ltc.isPlaying ? '⏹' : '▶'}</span>
            {ltc.isPlaying ? '停止' : isGenerating ? '生成中...' : '播放'}
          </button>

          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-xl">💾</span>
            {isGenerating ? '生成中...' : '下载WAV'}
          </button>
        </div>

        <div className="bg-gray-900/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-300 mb-2">LTC 技术参数</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">信号类型:</span>
              <span className="text-gray-300">双相标记编码</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">比特率:</span>
              <span className="text-gray-300">2400 bps</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">载波频率:</span>
              <span className="text-gray-300">2.4 kHz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">采样率:</span>
              <span className="text-gray-300">48 kHz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">每帧位数:</span>
              <span className="text-gray-300">
                {FRAME_RATE_CONFIG[ltc.frameRate].bitsPerFrame} bit
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">时间基准:</span>
              <span className="text-gray-300">
                {decodedTime ? 'IRIG-B' : '系统时间'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-xs text-yellow-300 flex items-start gap-2">
            <span>⚠️</span>
            <span>
              浏览器中无法直接访问NTP服务器。系统时间的精度取决于操作系统的时钟同步状态。
              如需更高精度的时间源，请使用IRIG-B解码功能。
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
