import { useSignalStore } from "@/store/signalStore";
import ControlPanel from "@/components/ControlPanel";
import WaveformCanvas from "@/components/WaveformCanvas";
import SpectrumCanvas from "@/components/SpectrumCanvas";
import ConstellationCanvas from "@/components/ConstellationCanvas";
import WaterfallCanvas from "@/components/WaterfallCanvas";
import ResourceGridCanvas from "@/components/ResourceGridCanvas";

export default function Home() {
  const { params, result, waterfallHistory, freqDomainHistory } = useSignalStore();

  return (
    <div className="flex h-screen w-screen bg-[#0a0e1a]">
      <aside className="w-[280px] min-w-[280px] h-full bg-[#0d1225] border-r border-cyan-900/20">
        <ControlPanel />
      </aside>
      <main className="flex-1 p-3 grid grid-cols-2 grid-rows-[auto_auto_auto] gap-3 h-full overflow-y-auto">
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <WaveformCanvas signal={result?.rxSignal ?? null} width={600} height={300} />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <SpectrumCanvas spectrum={result?.spectrum ?? null} width={600} height={300} pilotIndices={result?.pilotIndices} fftSize={params.fftSize} />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <ConstellationCanvas
            symbols={result?.rxSymbols ?? null}
            width={600}
            height={300}
            modulationFormat={result?.modulationFormat ?? params.modulation}
          />
        </div>
        <div className="rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <WaterfallCanvas history={waterfallHistory} width={600} height={300} />
        </div>
        <div className="col-span-2 rounded-lg border border-cyan-900/20 bg-[#0d1225] overflow-hidden">
          <ResourceGridCanvas
            fftSize={params.fftSize}
            numSymbols={params.numSymbols}
            pilotIndices={result?.pilotIndices ?? []}
            freqDomainHistory={freqDomainHistory}
            width={1200}
            height={350}
          />
        </div>
      </main>
    </div>
  );
}
