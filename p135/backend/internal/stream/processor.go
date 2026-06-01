package stream

import (
	"sort"
	"sync"
	"time"

	"sflow-analyzer/internal/sflow"
	"sflow-analyzer/pkg/types"
)

type windowBucket struct {
	startTime time.Time
	ipPairs   map[types.IPPairKey]*types.IPPairStats
	apps      map[types.AppKey]*types.AppStats
	totalBytes uint64
	totalPackets uint32
}

type Processor struct {
	mu              sync.RWMutex
	windows         []*windowBucket
	windowDuration  time.Duration
	maxWindows      int
	topN            int
	asnFilter       uint32
	outputChan      chan types.TopNResult
	flowChan        <-chan types.FlowRecord
	receiver        *sflow.Receiver
	running         bool
	wg              sync.WaitGroup
	lastTopN        types.TopNResult
	lastUpdateTime  time.Time
}

func NewProcessor(flowChan <-chan types.FlowRecord, receiver *sflow.Receiver, windowDuration time.Duration, maxWindows int, topN int) *Processor {
	return &Processor{
		windows:        make([]*windowBucket, 0, maxWindows),
		windowDuration: windowDuration,
		maxWindows:     maxWindows,
		topN:           topN,
		outputChan:     make(chan types.TopNResult, 100),
		flowChan:       flowChan,
		receiver:       receiver,
	}
}

func (p *Processor) SetASNFilter(asn uint32) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.asnFilter = asn
}

func (p *Processor) GetASNFilter() uint32 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.asnFilter
}

func (p *Processor) Start() {
	p.running = true
	p.wg.Add(2)
	go p.processLoop()
	go p.aggregationLoop()
}

func (p *Processor) Stop() {
	p.running = false
	p.wg.Wait()
	close(p.outputChan)
}

func (p *Processor) OutputChannel() <-chan types.TopNResult {
	return p.outputChan
}

func (p *Processor) GetCurrentTopN() types.TopNResult {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.lastTopN
}

func (p *Processor) GetLastUpdateTime() time.Time {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.lastUpdateTime
}

func (p *Processor) GetTotalStats() (uint64, uint32) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	var totalBytes uint64
	var totalPackets uint32

	for _, w := range p.windows {
		totalBytes += w.totalBytes
		totalPackets += w.totalPackets
	}

	return totalBytes, totalPackets
}

func (p *Processor) processLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(p.windowDuration)
	defer ticker.Stop()

	for p.running {
		select {
		case record, ok := <-p.flowChan:
			if !ok {
				return
			}
			p.processRecord(record)
		case <-ticker.C:
			p.rotateWindow()
		}
	}
}

func (p *Processor) processRecord(record types.FlowRecord) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.asnFilter != 0 {
		if record.SrcASN != p.asnFilter && record.DstASN != p.asnFilter {
			return
		}
	}

	if len(p.windows) == 0 {
		p.windows = append(p.windows, p.newBucket())
	}

	currentBucket := p.windows[len(p.windows)-1]

	ipKey := types.IPPairKey{
		SrcIP: record.SrcIP,
		DstIP: record.DstIP,
	}

	if stats, ok := currentBucket.ipPairs[ipKey]; ok {
		stats.Bytes += record.Bytes
		stats.Packets += record.Packets
	} else {
		currentBucket.ipPairs[ipKey] = &types.IPPairStats{
			SrcIP:   record.SrcIP,
			DstIP:   record.DstIP,
			Bytes:   record.Bytes,
			Packets: record.Packets,
			SrcASN:  record.SrcASN,
			DstASN:  record.DstASN,
		}
	}

	appKey := types.AppKey{
		Port:     record.DstPort,
		Protocol: record.Protocol,
	}

	if stats, ok := currentBucket.apps[appKey]; ok {
		stats.Bytes += record.Bytes
		stats.Packets += record.Packets
	} else {
		currentBucket.apps[appKey] = &types.AppStats{
			Port:        record.DstPort,
			Protocol:    record.Protocol,
			ProtocolStr: record.ProtocolStr,
			Bytes:       record.Bytes,
			Packets:     record.Packets,
			AppName:     sflow.PortToAppName(record.DstPort, record.Protocol),
		}
	}

	currentBucket.totalBytes += record.Bytes
	currentBucket.totalPackets += record.Packets
}

func (p *Processor) aggregationLoop() {
	defer p.wg.Done()

	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for p.running {
		<-ticker.C
		topN := p.computeTopN()

		p.mu.Lock()
		p.lastTopN = topN
		p.lastUpdateTime = time.Now()
		p.mu.Unlock()

		select {
		case p.outputChan <- topN:
		default:
		}
	}
}

func (p *Processor) computeTopN() types.TopNResult {
	p.mu.RLock()
	defer p.mu.RUnlock()

	ipPairMap := make(map[types.IPPairKey]*types.IPPairStats)
	appMap := make(map[types.AppKey]*types.AppStats)

	for _, window := range p.windows {
		for key, stats := range window.ipPairs {
			if aggregated, ok := ipPairMap[key]; ok {
				aggregated.Bytes += stats.Bytes
				aggregated.Packets += stats.Packets
			} else {
				copyStats := *stats
				ipPairMap[key] = &copyStats
			}
		}

		for key, stats := range window.apps {
			if aggregated, ok := appMap[key]; ok {
				aggregated.Bytes += stats.Bytes
				aggregated.Packets += stats.Packets
			} else {
				copyStats := *stats
				appMap[key] = &copyStats
			}
		}
	}

	ipPairs := make([]types.IPPairStats, 0, len(ipPairMap))
	for _, stats := range ipPairMap {
		ipPairs = append(ipPairs, *stats)
	}

	sort.Slice(ipPairs, func(i, j int) bool {
		return ipPairs[i].Bytes > ipPairs[j].Bytes
	})

	if len(ipPairs) > p.topN {
		ipPairs = ipPairs[:p.topN]
	}

	apps := make([]types.AppStats, 0, len(appMap))
	for _, stats := range appMap {
		apps = append(apps, *stats)
	}

	sort.Slice(apps, func(i, j int) bool {
		return apps[i].Bytes > apps[j].Bytes
	})

	if len(apps) > p.topN {
		apps = apps[:p.topN]
	}

	return types.TopNResult{
		IPPairs: ipPairs,
		Apps:    apps,
	}
}

func (p *Processor) newBucket() *windowBucket {
	return &windowBucket{
		startTime: time.Now(),
		ipPairs:   make(map[types.IPPairKey]*types.IPPairStats),
		apps:      make(map[types.AppKey]*types.AppStats),
	}
}

func (p *Processor) rotateWindow() {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.windows = append(p.windows, p.newBucket())

	if len(p.windows) > p.maxWindows {
		p.windows = p.windows[1:]
	}
}

func (p *Processor) GetWindowCount() int {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return len(p.windows)
}

func (p *Processor) GetFlowRate() float64 {
	stats := p.receiver.GetStats()
	if stats.LastPacketTime.IsZero() {
		return 0
	}

	duration := time.Since(stats.LastPacketTime).Seconds()
	if duration < 1 {
		duration = 1
	}

	return float64(stats.RecordsParsed) / duration
}
