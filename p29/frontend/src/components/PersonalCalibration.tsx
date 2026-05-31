import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PersonalCalibrator } from '../utils/personalCalibration';
import { LipLandmarks } from '../types';

interface PersonalCalibrationProps {
  lipLandmarks: LipLandmarks | null;
  isDetecting: boolean;
}

export const PersonalCalibration: React.FC<PersonalCalibrationProps> = ({
  lipLandmarks,
  isDetecting
}) => {
  const [calibrator] = useState(() => new PersonalCalibrator());
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [currentConsonantIndex, setCurrentConsonantIndex] = useState(0);
  const [sampleCount, setSampleCount] = useState(0);
  const [hasProfile, setHasProfile] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [metrics, setMetrics] = useState<{
    mouthOpenness: number;
    lipWidth: number;
    aspectRatio: number;
  } | null>(null);

  const sampleIntervalRef = useRef<number>();

  useEffect(() => {
    setHasProfile(calibrator.hasProfile());
  }, [calibrator]);

  useEffect(() => {
    if (lipLandmarks) {
      const m = calibrator.calculateLipMetrics(lipLandmarks);
      setMetrics(m);
    }
  }, [lipLandmarks, calibrator]);

  const targetConsonants = calibrator.getTargetConsonants();
  const currentConsonant = targetConsonants[currentConsonantIndex];
  const currentSampleCount = calibrator.getSampleCountForConsonant(currentConsonant);
  const samplesNeeded = 5;

  const startCalibration = () => {
    calibrator.startCalibration();
    setIsCalibrating(true);
    setCurrentConsonantIndex(0);
    setSampleCount(0);
    setHasProfile(false);
  };

  const collectSample = useCallback(() => {
    if (!lipLandmarks || !isCalibrating) return;
    
    calibrator.addSample(currentConsonant, lipLandmarks);
    setSampleCount(prev => prev + 1);
  }, [lipLandmarks, isCalibrating, currentConsonant, calibrator]);

  useEffect(() => {
    if (isCalibrating && isDetecting && lipLandmarks) {
      const interval = window.setInterval(() => {
        if (currentSampleCount < samplesNeeded) {
          collectSample();
        }
      }, 500);

      return () => clearInterval(interval);
    }
  }, [isCalibrating, isDetecting, lipLandmarks, currentSampleCount, collectSample]);

  const nextConsonant = () => {
    if (currentConsonantIndex < targetConsonants.length - 1) {
      setCurrentConsonantIndex(prev => prev + 1);
      setSampleCount(0);
    } else {
      finishCalibration();
    }
  };

  const finishCalibration = () => {
    calibrator.completeCalibration();
    setIsCalibrating(false);
    setHasProfile(true);
  };

  const resetCalibration = () => {
    calibrator.reset();
    setHasProfile(false);
    setIsCalibrating(false);
    setCurrentConsonantIndex(0);
    setSampleCount(0);
  };

  const profile = calibrator.getProfile();
  const progress = ((currentConsonantIndex * samplesNeeded + currentSampleCount) / (targetConsonants.length * samplesNeeded)) * 100;

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-400"></span>
          个性化校准
        </h3>
        <div className="flex items-center gap-2">
          {hasProfile && (
            <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
              已校准
            </span>
          )}
        </div>
      </div>

      {!isCalibrating && !hasProfile && (
        <div className="space-y-4">
          {showGuide && (
            <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
              <h4 className="text-purple-400 font-medium mb-2">校准说明</h4>
              <p className="text-gray-400 text-sm mb-2">
                通过校准，系统可以适应您独特的口型特征，提高识别准确率。
              </p>
              <ul className="text-gray-500 text-xs space-y-1">
                <li>• 依次读出指定的辅音（b/p/m/f/d/t）</li>
                <li>• 每个辅音采集5个样本</li>
                <li>• 保持自然的发音习惯</li>
                <li>• 校准数据仅保存在本地</li>
              </ul>
            </div>
          )}
          <button
            onClick={startCalibration}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors"
          >
            开始校准
          </button>
        </div>
      )}

      {isCalibrating && (
        <div className="space-y-4">
          <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-2">
              请发出辅音
            </p>
            <div className="text-6xl font-bold text-purple-400 mb-4 animate-pulse">
              {currentConsonant.toUpperCase()}
            </div>
            <p className="text-gray-500 text-sm">
              {currentConsonantIndex + 1} / {targetConsonants.length} · {currentSampleCount} / {samplesNeeded} 样本
            </p>
          </div>

          {metrics && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-700/50 rounded-lg p-2">
                <p className="text-gray-500 text-xs">张口度</p>
                <p className="text-white font-mono text-sm">{metrics.mouthOpenness.toFixed(3)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2">
                <p className="text-gray-500 text-xs">唇宽</p>
                <p className="text-white font-mono text-sm">{metrics.lipWidth.toFixed(3)}</p>
              </div>
              <div className="bg-gray-700/50 rounded-lg p-2">
                <p className="text-gray-500 text-xs">长宽比</p>
                <p className="text-white font-mono text-sm">{metrics.aspectRatio.toFixed(3)}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={nextConsonant}
              disabled={currentSampleCount < samplesNeeded}
              className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {currentConsonantIndex < targetConsonants.length - 1 ? '下一个' : '完成'}
            </button>
            <button
              onClick={() => setIsCalibrating(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {hasProfile && profile && !isCalibrating && (
        <div className="space-y-4">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-400 font-medium">校准已完成</span>
            </div>
            <p className="text-gray-400 text-sm">
              已采集 {profile.samples.length} 个样本，校准时间: {new Date(profile.updatedAt).toLocaleString()}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {Array.from(profile.consonantPatterns.entries()).slice(0, 6).map(([consonant]) => (
              <div key={consonant} className="bg-gray-700/50 rounded-lg p-2 flex items-center justify-between">
                <span className="text-white font-medium">{consonant.toUpperCase()}</span>
                <span className="text-xs text-gray-400">
                  {calibrator.getSampleCountForConsonant(consonant)} 样本
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={resetCalibration}
            className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg font-medium transition-colors"
          >
            重新校准
          </button>
        </div>
      )}
    </div>
  );
};
