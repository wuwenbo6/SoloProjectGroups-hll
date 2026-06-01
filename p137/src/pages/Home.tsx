import React, { useState } from 'react';
import Toolbar from '@/components/Toolbar';
import NodePalette from '@/components/NodePalette';
import TopologyEditor from '@/components/TopologyEditor';
import FlowTablePanel from '@/components/FlowTablePanel';
import PathTracePanel from '@/components/PathTracePanel';
import PerformancePanel from '@/components/PerformancePanel';

const Home: React.FC = () => {
  const [showPerformance, setShowPerformance] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 overflow-hidden">
      <Toolbar onTogglePerformance={() => setShowPerformance(!showPerformance)} />
      
      <div className="flex flex-1 overflow-hidden">
        <NodePalette />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopologyEditor />
          <PathTracePanel />
        </div>
        
        <FlowTablePanel />
        <PerformancePanel isOpen={showPerformance} onClose={() => setShowPerformance(false)} />
      </div>
    </div>
  );
};

export default Home;
