import { useState, useEffect, useRef } from 'react';
import { Play, Pause, SkipBack, SkipForward, Clock } from 'lucide-react';
import { useMapStore } from '@/store/mapStore';

export function TimelineController() {
  const { selectedRegion, selectedYear, setSelectedYear, isPlaying, setIsPlaying } = useMapStore();
  const [years, setYears] = useState<number[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (selectedRegion) {
      setYears(selectedRegion.availableYears.sort((a, b) => a - b));
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (isPlaying && years.length > 0) {
      intervalRef.current = setInterval(() => {
        setSelectedYear((prev) => {
          const currentIndex = years.indexOf(prev);
          if (currentIndex === years.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return years[currentIndex + 1];
        });
      }, 1500);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, years, setSelectedYear, setIsPlaying]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const yearIndex = parseInt(e.target.value);
    setSelectedYear(years[yearIndex]);
    setIsPlaying(false);
  };

  const handleSkipBack = () => {
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex > 0) {
      setSelectedYear(years[currentIndex - 1]);
      setIsPlaying(false);
    }
  };

  const handleSkipForward = () => {
    const currentIndex = years.indexOf(selectedYear);
    if (currentIndex < years.length - 1) {
      setSelectedYear(years[currentIndex + 1]);
      setIsPlaying(false);
    }
  };

  const currentIndex = years.indexOf(selectedYear);
  const progress = years.length > 1 ? (currentIndex / (years.length - 1)) * 100 : 0;

  if (years.length === 0) {
    return null;
  }

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            <span className="text-2xl font-bold text-gray-800">{selectedYear}年</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkipBack}
              disabled={currentIndex === 0}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <SkipBack className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors shadow-lg"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            <button
              onClick={handleSkipForward}
              disabled={currentIndex === years.length - 1}
              className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <SkipForward className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="relative">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={years.length - 1}
            value={currentIndex}
            onChange={handleSliderChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>

        <div className="flex justify-between mt-3">
          {years.map((year, index) => (
            <button
              key={year}
              onClick={() => {
                setSelectedYear(year);
                setIsPlaying(false);
              }}
              className={`text-xs font-medium transition-colors ${
                year === selectedYear
                  ? 'text-blue-600 scale-110'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
