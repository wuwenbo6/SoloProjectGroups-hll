import { useState, useEffect } from 'react';
import { Search, Download } from 'lucide-react';
import { VideoPlayer } from '../components/VideoPlayer.js';
import { Timeline } from '../components/Timeline.js';
import { EventModal } from '../components/EventModal.js';
import { SmartSearch } from '../components/SmartSearch.js';
import { ExportDialog } from '../components/ExportDialog.js';
import { useCameraStore } from '../store/cameraStore.js';
import { api } from '../utils/api.js';
import { formatDateTime, formatDuration, formatFileSize } from '../utils/format.js';
import type { Recording, Event as EventType, TimeRange } from '../../shared/types.js';

export function Playback() {
  const {
    recordings,
    events,
    currentRecording,
    currentTime,
    isPlaying,
    zoomLevel,
    setRecordings,
    setEvents,
    setCurrentRecording,
    setCurrentTime,
    setIsPlaying,
    setZoomLevel,
  } = useCameraStore();

  const [showEventModal, setShowEventModal] = useState(false);
  const [showSmartSearch, setShowSmartSearch] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [eventTimestamp, setEventTimestamp] = useState(0);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const recordingsData = await api.getRecordings() as Recording[];
      const eventsData = await api.getEvents() as EventType[];
      
      setRecordings(recordingsData);
      setEvents(eventsData);

      if (recordingsData.length > 0 && !currentRecording) {
        setCurrentRecording(recordingsData[0]);
        setCurrentTime(recordingsData[0].startTime);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  }

  const timelineStart = recordings.length > 0 
    ? Math.min(...recordings.map(r => r.startTime))
    : Date.now() - 3600000;
  
  const timelineEnd = recordings.length > 0
    ? Math.max(...recordings.map(r => r.endTime || r.startTime + r.duration))
    : Date.now();

  function handleAddEvent(timestamp: number) {
    setEventTimestamp(timestamp);
    setShowEventModal(true);
  }

  async function handleSubmitEvent(data: { type: 'motion' | 'alert' | 'custom'; title: string; description: string }) {
    if (!currentRecording) return;
    
    try {
      await api.createEvent({
        recordingId: currentRecording.id,
        timestamp: eventTimestamp,
        ...data,
      });
      loadData();
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  }

  function handleEventClick(event: EventType) {
    setCurrentTime(event.timestamp);
  }

  function handleRecordingSelect(recording: Recording) {
    setCurrentRecording(recording);
    setCurrentTime(recording.startTime);
  }

  function handleTimeRangeSelect(range: TimeRange) {
    const midTime = (range.start + range.end) / 2;
    setCurrentTime(midTime);
    setShowSmartSearch(false);
  }

  function handleSearchEventSelect(event: EventType) {
    setCurrentTime(event.timestamp);
    setShowSmartSearch(false);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">录像回放</h1>
          <p className="text-slate-400 mt-1">通过时间轴回放历史录像</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSmartSearch(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl hover:bg-cyan-500/30 transition-colors"
          >
            <Search size={16} />
            <span className="text-sm font-medium">智能检索</span>
          </button>
          {currentRecording && (
            <button
              onClick={() => setShowExportDialog(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-xl hover:bg-green-500/30 transition-colors"
            >
              <Download size={16} />
              <span className="text-sm font-medium">导出</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {recordings.map((recording) => (
          <div
            key={recording.id}
            onClick={() => handleRecordingSelect(recording)}
            className={`p-4 rounded-xl cursor-pointer transition-all ${
              currentRecording?.id === recording.id
                ? 'bg-cyan-500/20 border border-cyan-500/50'
                : 'bg-slate-800/50 border border-slate-700 hover:border-slate-600'
            }`}
          >
            <div className="aspect-video bg-slate-900 rounded-lg mb-3 overflow-hidden">
              <img
                src={`https://picsum.photos/seed/${recording.id}/320/180`}
                alt="Recording"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-sm font-medium text-white truncate">
              {formatDateTime(recording.startTime)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {formatDuration(recording.duration)} · {formatFileSize(recording.fileSize)}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              分段 {recording.segmentDuration / 60000}分钟
            </div>
          </div>
        ))}
      </div>

      <VideoPlayer
        recording={currentRecording}
        videoUrl={currentRecording ? api.getRecordingVideoUrl(currentRecording.id) : ''}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onTimeUpdate={setCurrentTime}
        onPlayingChange={setIsPlaying}
        onAddEvent={handleAddEvent}
      />

      <Timeline
        recordings={recordings}
        events={events}
        currentTime={currentTime}
        startTime={timelineStart}
        endTime={timelineEnd}
        zoomLevel={zoomLevel}
        onTimeChange={setCurrentTime}
        onZoomChange={setZoomLevel}
        onEventClick={handleEventClick}
      />

      <EventModal
        isOpen={showEventModal}
        onClose={() => setShowEventModal(false)}
        onSubmit={handleSubmitEvent}
        timestamp={eventTimestamp}
      />

      <SmartSearch
        isOpen={showSmartSearch}
        onClose={() => setShowSmartSearch(false)}
        onEventSelect={handleSearchEventSelect}
        onTimeRangeSelect={handleTimeRangeSelect}
      />

      {currentRecording && (
        <ExportDialog
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          recording={currentRecording}
        />
      )}
    </div>
  );
}
