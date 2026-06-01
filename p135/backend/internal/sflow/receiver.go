package sflow

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"sflow-analyzer/pkg/types"
)

const (
	DefaultRecvBufferSize = 32 * 1024 * 1024 // 32MB
	ChannelCapacity       = 100000
	ParseWorkerCount      = 4
)

type Receiver struct {
	conn         *net.UDPConn
	parser       *Parser
	ch           chan types.FlowRecord
	rawPacketCh  chan []byte
	stats        *ReceiverStats
	statsMu      sync.Mutex
	running      bool
	wg           sync.WaitGroup
	kernelStats  *KernelUDPStats
	lastKernelCheck time.Time
	dropAlarmThreshold float64 // 丢包率告警阈值，默认1%
}

type KernelUDPStats struct {
	InDatagrams  uint64
	NoPorts      uint64
	InErrors     uint64
	OutDatagrams uint64
	RcvbufErrors uint64
	SndbufErrors uint64
	InCsumErrors uint64
	IgnoredMulti uint64
}

type ReceiverStats struct {
	PacketsReceived    uint64
	PacketsDropped     uint64
	RecordsParsed      uint64
	BytesReceived      uint64
	LastPacketTime     time.Time
	Errors             uint64
	KernelDrops        uint64
	EstimatedLostBytes uint64
	DropRate           float64
	CompensatedBytes   uint64
}

func NewReceiver() *Receiver {
	return &Receiver{
		parser:            NewParser(),
		ch:                make(chan types.FlowRecord, ChannelCapacity),
		rawPacketCh:       make(chan []byte, ChannelCapacity),
		stats:             &ReceiverStats{},
		kernelStats:       &KernelUDPStats{},
		dropAlarmThreshold: 1.0,
	}
}

func (r *Receiver) Start(address string) error {
	udpAddr, err := net.ResolveUDPAddr("udp", address)
	if err != nil {
		return fmt.Errorf("resolve UDP address: %w", err)
	}

	r.conn, err = net.ListenUDP("udp", udpAddr)
	if err != nil {
		return fmt.Errorf("listen UDP: %w", err)
	}

	if err := r.setSocketBuffer(); err != nil {
		log.Printf("Warning: failed to set socket buffer: %v", err)
	}

	r.running = true

	r.wg.Add(1)
	go r.receiveLoop()

	for i := 0; i < ParseWorkerCount; i++ {
		r.wg.Add(1)
		go r.parseWorker(i)
	}

	r.wg.Add(1)
	go r.kernelStatsMonitor()

	log.Printf("sFlow receiver started on %s", address)
	log.Printf("  Receive buffer: %d MB", DefaultRecvBufferSize/1024/1024)
	log.Printf("  Channel capacity: %d", ChannelCapacity)
	log.Printf("  Parse workers: %d", ParseWorkerCount)
	return nil
}

func (r *Receiver) Stop() {
	r.running = false
	if r.conn != nil {
		r.conn.Close()
	}
	r.wg.Wait()
	close(r.rawPacketCh)
	close(r.ch)
}

func (r *Receiver) FlowChannel() <-chan types.FlowRecord {
	return r.ch
}

func (r *Receiver) GetStats() ReceiverStats {
	r.statsMu.Lock()
	defer r.statsMu.Unlock()
	return *r.stats
}

func (r *Receiver) ResetStats() {
	r.statsMu.Lock()
	defer r.statsMu.Unlock()
	r.stats = &ReceiverStats{}
}

func (r *Receiver) SetDropAlarmThreshold(threshold float64) {
	r.statsMu.Lock()
	defer r.statsMu.Unlock()
	r.dropAlarmThreshold = threshold
}

func (r *Receiver) setSocketBuffer() error {
	rawConn, err := r.conn.SyscallConn()
	if err != nil {
		return fmt.Errorf("get raw conn: %w", err)
	}

	var setErr error
	err = rawConn.Control(func(fd uintptr) {
		setErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_RCVBUF, DefaultRecvBufferSize)
		if setErr != nil {
			return
		}
		setErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_RCVBUFFORCE, DefaultRecvBufferSize)
	})
	if err != nil {
		return err
	}
	return setErr
}

func (r *Receiver) receiveLoop() {
	defer r.wg.Done()

	bufPool := sync.Pool{
		New: func() interface{} {
			return make([]byte, MaxDatagramSize)
		},
	}

	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	for r.running {
		buf := bufPool.Get().([]byte)
		n, _, err := r.conn.ReadFromUDP(buf)
		if err != nil {
			bufPool.Put(buf)
			if !r.running {
				return
			}
			r.statsMu.Lock()
			r.stats.Errors++
			r.statsMu.Unlock()
			continue
		}

		r.statsMu.Lock()
		r.stats.PacketsReceived++
		r.stats.BytesReceived += uint64(n)
		r.stats.LastPacketTime = time.Now()
		r.statsMu.Unlock()

		packetCopy := make([]byte, n)
		copy(packetCopy, buf[:n])
		bufPool.Put(buf)

		select {
		case r.rawPacketCh <- packetCopy:
		default:
			r.statsMu.Lock()
			r.stats.PacketsDropped++
			r.statsMu.Unlock()
		}
	}
}

func (r *Receiver) parseWorker(id int) {
	defer r.wg.Done()

	parser := NewParser()

	for packet := range r.rawPacketCh {
		records, err := parser.Parse(packet)
		if err != nil {
			r.statsMu.Lock()
			r.stats.PacketsDropped++
			r.statsMu.Unlock()
			continue
		}

		r.statsMu.Lock()
		avgBytesPerRecord := uint64(0)
		if len(records) > 0 {
			totalBytes := uint64(0)
			for _, rec := range records {
				totalBytes += rec.Bytes
			}
			avgBytesPerRecord = totalBytes / uint64(len(records))
		}
		r.statsMu.Unlock()

		for _, record := range records {
			select {
			case r.ch <- record:
				r.statsMu.Lock()
				r.stats.RecordsParsed++
				r.statsMu.Unlock()
			default:
				r.statsMu.Lock()
				r.stats.PacketsDropped++
				if avgBytesPerRecord > 0 {
					r.stats.EstimatedLostBytes += avgBytesPerRecord
				}
				r.statsMu.Unlock()
			}
		}
	}
}

func (r *Receiver) kernelStatsMonitor() {
	defer r.wg.Done()

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	var prevStats KernelUDPStats

	for r.running {
		<-ticker.C

		currentStats, err := readKernelUDPStats()
		if err != nil {
			continue
		}

		if !r.lastKernelCheck.IsZero() {
			deltaReceived := currentStats.InDatagrams - prevStats.InDatagrams
			deltaDrops := currentStats.RcvbufErrors - prevStats.RcvbufErrors +
				currentStats.InErrors - prevStats.InErrors

			var dropRate float64
			if deltaReceived > 0 {
				dropRate = float64(deltaDrops) / float64(deltaReceived) * 100
			}

			r.statsMu.Lock()
			r.stats.KernelDrops += deltaDrops
			r.stats.DropRate = dropRate

			if dropRate > 0 && r.stats.KernelDrops > 0 {
				avgBytes := r.stats.BytesReceived / r.stats.PacketsReceived
				estimatedLost := uint64(float64(avgBytes) * dropRate / 100)
				r.stats.CompensatedBytes += estimatedLost
			}

			if dropRate > r.dropAlarmThreshold {
				log.Printf("⚠️  ALERT: UDP drop rate %.2f%% exceeds threshold %.2f%% (dropped %d packets in 5s)",
					dropRate, r.dropAlarmThreshold, deltaDrops)
			}
			r.statsMu.Unlock()
		}

		prevStats = *currentStats
		r.lastKernelCheck = time.Now()
	}
}

func (r *Receiver) SendMockFlow(srcIP, dstIP string, srcPort, dstPort uint16, protocol uint8, bytes uint64) {
	record := types.FlowRecord{
		Timestamp:   time.Now(),
		SrcIP:       srcIP,
		DstIP:       dstIP,
		SrcPort:     srcPort,
		DstPort:     dstPort,
		Protocol:    protocol,
		ProtocolStr: protocolToString(protocol),
		Bytes:       bytes,
		Packets:     1,
		SrcASN:      r.parser.asnResolver.Lookup(srcIP),
		DstASN:      r.parser.asnResolver.Lookup(dstIP),
	}

	select {
	case r.ch <- record:
		r.statsMu.Lock()
		r.stats.RecordsParsed++
		r.statsMu.Unlock()
	default:
		log.Println("Channel full, dropping mock flow")
	}
}
