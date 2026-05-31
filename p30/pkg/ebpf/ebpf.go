package ebpf

import (
	"context"
	"encoding/binary"
	"fmt"
	"net"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang-14 -cflags "-O2 -g -Wall -Werror" bpf ../../bpf/dbprobe.bpf.c

const (
	MAX_DATA_SIZE = 4096
	MYSQL_PORT    = 3306
	POSTGRES_PORT = 5432

	EVENT_TYPE_KERNEL          = 0
	EVENT_TYPE_UPROBE_SSL_READ = 1
	EVENT_TYPE_UPROBE_SSL_WRITE = 2
	EVENT_TYPE_UPROBE_MYSQL_QUERY = 3
	EVENT_TYPE_UPROBE_PG_QUERY = 4
)

type Event struct {
	Pid         uint32
	Tid         uint32
	Duration    time.Duration
	SrcIP       net.IP
	DstIP       net.IP
	SrcPort     uint16
	DstPort     uint16
	Data        []byte
	DataLen     uint32
	EventType   uint8
	Direction   uint8
	Comm        string
	ReceivedAt  time.Time
}

type ProbeConfig struct {
	EnableKprobes       bool
	EnableUprobeSSL     bool
	EnableUprobeMySQL   bool
	EnableUprobePostgres bool
	MySQLBinaryPath     string
	PostgresBinaryPath  string
	SSLBinaryPath       string
	PID                 int
	RingBufferSize      int
}

func DefaultConfig() ProbeConfig {
	return ProbeConfig{
		EnableKprobes:       true,
		EnableUprobeSSL:     false,
		EnableUprobeMySQL:   false,
		EnableUprobePostgres: false,
		MySQLBinaryPath:     "/usr/sbin/mysqld",
		PostgresBinaryPath:  "/usr/bin/postgres",
		SSLBinaryPath:       "",
		PID:                 -1,
		RingBufferSize:      64 * 1024 * 1024,
	}
}

type Probe struct {
	objs            bpfObjects
	links           []link.Link
	reader          *ringbuf.Reader
	eventChan       chan Event
	lostChan        chan uint64
	stopChan        chan struct{}
	config          ProbeConfig
	stats           Stats
}

type Stats struct {
	EventsReceived uint64
	EventsLost     uint64
	EventsParsed   uint64
}

func NewProbe(config ProbeConfig) (*Probe, error) {
	objs := bpfObjects{}
	if err := loadBpfObjects(&objs, nil); err != nil {
		return nil, fmt.Errorf("loading bpf objects: %w", err)
	}

	var links []link.Link

	if config.EnableKprobes {
		recvLink, err := link.Kprobe("sys_recvfrom", objs.KprobeSysRecvfrom, nil)
		if err != nil {
			objs.Close()
			return nil, fmt.Errorf("attaching recvfrom kprobe: %w", err)
		}
		links = append(links, recvLink)

		recvRetLink, err := link.Kretprobe("sys_recvfrom", objs.KretprobeSysRecvfrom, nil)
		if err != nil {
			for _, l := range links {
				l.Close()
			}
			objs.Close()
			return nil, fmt.Errorf("attaching recvfrom kretprobe: %w", err)
		}
		links = append(links, recvRetLink)

		sendLink, err := link.Kprobe("sys_sendto", objs.KprobeSysSendto, nil)
		if err != nil {
			for _, l := range links {
				l.Close()
			}
			objs.Close()
			return nil, fmt.Errorf("attaching sendto kprobe: %w", err)
		}
		links = append(links, sendLink)
	}

	if config.EnableUprobeSSL && config.SSLBinaryPath != "" {
		sslRead, err := link.Uprobe(config.SSLBinaryPath, "SSL_read", objs.UprobeSslRead, nil)
		if err != nil {
			return nil, fmt.Errorf("attaching SSL_read uprobe: %w", err)
		}
		links = append(links, sslRead)

		sslReadRet, err := link.Uretprobe(config.SSLBinaryPath, "SSL_read", objs.UretprobeSslRead, nil)
		if err != nil {
			return nil, fmt.Errorf("attaching SSL_read uretprobe: %w", err)
		}
		links = append(links, sslReadRet)

		sslWrite, err := link.Uprobe(config.SSLBinaryPath, "SSL_write", objs.UprobeSslWrite, nil)
		if err != nil {
			return nil, fmt.Errorf("attaching SSL_write uprobe: %w", err)
		}
		links = append(links, sslWrite)
	}

	if config.EnableUprobeMySQL {
		mysqlDispatch, err := link.Uprobe(config.MySQLBinaryPath, "dispatch_command", objs.UprobeMysqlDispatch, nil)
		if err != nil {
			return nil, fmt.Errorf("attaching dispatch_command uprobe: %w", err)
		}
		links = append(links, mysqlDispatch)
	}

	if config.EnableUprobePostgres {
		pgSimpleQuery, err := link.Uprobe(config.PostgresBinaryPath, "exec_simple_query", objs.UprobePgSimpleQuery, nil)
		if err != nil {
			return nil, fmt.Errorf("attaching exec_simple_query uprobe: %w", err)
		}
		links = append(links, pgSimpleQuery)
	}

	reader, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		for _, l := range links {
			l.Close()
		}
		objs.Close()
		return nil, fmt.Errorf("creating ringbuf reader: %w", err)
	}

	return &Probe{
		objs:      objs,
		links:     links,
		reader:    reader,
		eventChan: make(chan Event, 10000),
		lostChan:  make(chan uint64, 100),
		stopChan:  make(chan struct{}),
		config:    config,
	}, nil
}

func (p *Probe) Start() {
	go p.pollEvents()
	go p.pollLostEvents()
}

func (p *Probe) Events() <-chan Event {
	return p.eventChan
}

func (p *Probe) LostEvents() <-chan uint64 {
	return p.lostChan
}

func (p *Probe) GetStats() Stats {
	return p.stats
}

func (p *Probe) Stop() {
	close(p.stopChan)
	p.reader.Close()
	for _, l := range p.links {
		l.Close()
	}
	p.objs.Close()
}

func (p *Probe) pollEvents() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		<-p.stopChan
		cancel()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		record, err := p.reader.Read()
		if err != nil {
			if err == ringbuf.ErrClosed {
				return
			}
			continue
		}

		p.stats.EventsReceived++

		if len(record.RawSample) < 28 {
			continue
		}

		event := p.parseEvent(record.RawSample)
		if event.DataLen > 0 {
			p.stats.EventsParsed++
			p.eventChan <- event
		}
	}
}

func (p *Probe) pollLostEvents() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-p.stopChan:
			return
		case <-ticker.C:
			lost := p.readLostEvents()
			if lost > 0 {
				p.stats.EventsLost += lost
				select {
				case p.lostChan <- lost:
				default:
				}
			}
		}
	}
}

func (p *Probe) readLostEvents() uint64 {
	var key uint32 = 0
	var total uint64

	mapInfo := p.objs.LostEvents.Info()
	if mapInfo == nil {
		return 0
	}

	entries := p.objs.LostEvents
	var value uint64
	if err := entries.Lookup(&key, &value); err == nil {
		total = value
	}

	return total
}

func (p *Probe) parseEvent(raw []byte) Event {
	offset := 0
	pid := binary.LittleEndian.Uint32(raw[offset:])
	offset += 4

	tid := binary.LittleEndian.Uint32(raw[offset:])
	offset += 4

	duration := binary.LittleEndian.Uint64(raw[offset:])
	offset += 8

	sport := binary.LittleEndian.Uint16(raw[offset:])
	offset += 2

	dport := binary.LittleEndian.Uint16(raw[offset:])
	offset += 2

	saddr := binary.LittleEndian.Uint32(raw[offset:])
	offset += 4

	daddr := binary.LittleEndian.Uint32(raw[offset:])
	offset += 4

	dataLen := binary.LittleEndian.Uint32(raw[offset:])
	offset += 4

	eventType := raw[offset]
	offset += 1

	direction := raw[offset]
	offset += 1

	comm := string(raw[offset:offset+16])
	offset += 16

	data := make([]byte, MAX_DATA_SIZE)
	dataEnd := offset + int(dataLen)
	if dataEnd > len(raw) {
		dataEnd = len(raw)
	}
	copy(data, raw[offset:dataEnd])

	return Event{
		Pid:        pid,
		Tid:        tid,
		Duration:   time.Duration(duration),
		SrcIP:      intToIP(saddr),
		DstIP:      intToIP(daddr),
		SrcPort:    sport,
		DstPort:    dport,
		Data:       data[:dataLen],
		DataLen:    dataLen,
		EventType:  eventType,
		Direction:  direction,
		Comm:       nullTerminatedString(comm),
		ReceivedAt: time.Now(),
	}
}

func intToIP(ip uint32) net.IP {
	if ip == 0 {
		return nil
	}
	return net.IPv4(
		byte(ip),
		byte(ip>>8),
		byte(ip>>16),
		byte(ip>>24),
	)
}

func nullTerminatedString(s string) string {
	for i, c := range s {
		if c == 0 {
			return s[:i]
		}
	}
	return s
}

func GetLostEventsMap() *ebpf.Map {
	return nil
}
