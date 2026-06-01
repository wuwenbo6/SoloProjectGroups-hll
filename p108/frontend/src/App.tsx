import { Crystal3DViewer } from './components/Crystal3DViewer';
import { ParameterPanel } from './components/ParameterPanel';
import { EnergyChart } from './components/EnergyChart';

function App() {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-dark">
      <div className="w-80 flex-shrink-0 h-full">
        <ParameterPanel />
      </div>
      
      <div className="flex-1 flex flex-col h-full">
        <div className="flex-1 relative">
          <Crystal3DViewer />
        </div>
        <div className="h-44">
          <EnergyChart />
        </div>
      </div>
    </div>
  );
}

export default App;
