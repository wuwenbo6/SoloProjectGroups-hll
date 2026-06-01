import { Toolbar } from './components/Toolbar';
import { SeriesPanel } from './components/SeriesPanel';
import { DicomCanvas } from './components/DicomCanvas';
import { RoiPanel } from './components/RoiPanel';
import { StatusBar } from './components/StatusBar';

export default function App() {
  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a1628] text-white overflow-hidden">
      <Toolbar />
      <div className="flex-1 flex overflow-hidden">
        <SeriesPanel />
        <DicomCanvas />
        <RoiPanel />
      </div>
      <StatusBar />
    </div>
  );
}
