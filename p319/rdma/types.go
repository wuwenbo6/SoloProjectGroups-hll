package rdma

import (
	"encoding/binary"
	"strconv"
	"sync"
	"time"
)

type QPState int

const (
	QPReset QPState = iota
	QPInit
	QPRTR
	QPRTS
	QPError
)

func (s QPState) String() string {
	switch s {
	case QPReset:
		return "RESET"
	case QPInit:
		return "INIT"
	case QPRTR:
		return "RTR"
	case QPRTS:
		return "RTS"
	case QPError:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

type WROpcode int

const (
	WRSend WROpcode = iota
	WRRecv
	WRRDMAWrite
	WRRDMARead
	WRCmpSwap
)

func (o WROpcode) String() string {
	switch o {
	case WRSend:
		return "SEND"
	case WRRecv:
		return "RECV"
	case WRRDMAWrite:
		return "RDMA_WRITE"
	case WRRDMARead:
		return "RDMA_READ"
	case WRCmpSwap:
		return "CMP_SWAP"
	default:
		return "UNKNOWN"
	}
}

type WCStatus int

const (
	WCSuccess WCStatus = iota
	WCLocalError
	WCRemoteError
	WCFlushed
	WCRNR
	WCRetry
)

func (s WCStatus) String() string {
	switch s {
	case WCSuccess:
		return "SUCCESS"
	case WCLocalError:
		return "LOCAL_ERROR"
	case WCRemoteError:
		return "REMOTE_ERROR"
	case WCFlushed:
		return "FLUSHED"
	case WCRNR:
		return "RNR"
	case WCRetry:
		return "RETRY"
	default:
		return "UNKNOWN"
	}
}

type WR struct {
	ID         uint64
	Opcode     WROpcode
	SGE        []SGE
	RemoteMR   *MRHandle
	Atomic     *AtomicArgs
	SendFlags  uint32
	QPN        uint32
	RetryCount int
}

type SGE struct {
	Addr   uint64
	Length uint32
	LKey   uint32
}

type WC struct {
	WRID   uint64
	Status WCStatus
	Opcode WROpcode
	Length uint32
	QPN    uint32
	Ts     time.Time
}

type MR struct {
	Addr   uint64
	Length uint64
	LKey   uint32
	RKey   uint32
	Data   []byte
	PD     *ProtectionDomain
	mu     sync.RWMutex
}

func (m *MR) Read(offset uint64, length uint32) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if offset+uint64(length) > m.Length {
		return nil, ErrOutOfRange
	}
	buf := make([]byte, length)
	copy(buf, m.Data[offset:offset+uint64(length)])
	return buf, nil
}

func (m *MR) Write(offset uint64, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if offset+uint64(len(data)) > m.Length {
		return ErrOutOfRange
	}
	copy(m.Data[offset:], data)
	return nil
}

func (m *MR) CmpSwap(offset uint64, compare, swap uint64) (uint64, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if offset+8 > m.Length {
		return 0, false
	}
	current := binary.LittleEndian.Uint64(m.Data[offset:])
	if current == compare {
		binary.LittleEndian.PutUint64(m.Data[offset:], swap)
		return swap, true
	}
	return current, false
}

type MRHandle struct {
	Addr uint64
	Len  uint32
	RKey uint32
}

type AtomicArgs struct {
	RemoteAddr uint64
	RKey       uint32
	Compare    uint64
	Swap       uint64
	ResultAddr uint64
	ResultLKey uint32
}

type QPStats struct {
	SendBytes    uint64
	RecvBytes    uint64
	SendPackets  uint64
	RecvPackets  uint64
	SendErrors   uint64
	RecvErrors   uint64
	RNREvents    uint64
	RetryCount   uint64
	WriteBytes   uint64
	ReadBytes    uint64
	AtomicOps    uint64
	LastSendTime time.Time
	LastRecvTime time.Time
	mu           sync.Mutex
}

func (s *QPStats) AddSendBytes(n uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.SendBytes += n
	s.SendPackets++
	s.LastSendTime = time.Now()
}

func (s *QPStats) AddRecvBytes(n uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.RecvBytes += n
	s.RecvPackets++
	s.LastRecvTime = time.Now()
}

func (s *QPStats) AddSendError() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.SendErrors++
}

func (s *QPStats) AddRNR() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.RNREvents++
}

func (s *QPStats) AddRetry() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.RetryCount++
}

func (s *QPStats) AddWriteBytes(n uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.WriteBytes += n
}

func (s *QPStats) AddReadBytes(n uint64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ReadBytes += n
}

func (s *QPStats) AddAtomicOp() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.AtomicOps++
}

func (s *QPStats) Snapshot() QPStatsSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return QPStatsSnapshot{
		SendBytes:    s.SendBytes,
		RecvBytes:    s.RecvBytes,
		SendPackets:  s.SendPackets,
		RecvPackets:  s.RecvPackets,
		SendErrors:   s.SendErrors,
		RecvErrors:   s.RecvErrors,
		RNREvents:    s.RNREvents,
		RetryCount:   s.RetryCount,
		WriteBytes:   s.WriteBytes,
		ReadBytes:    s.ReadBytes,
		AtomicOps:    s.AtomicOps,
		LastSendTime: s.LastSendTime,
		LastRecvTime: s.LastRecvTime,
	}
}

type QPStatsSnapshot struct {
	SendBytes    uint64    `json:"send_bytes"`
	RecvBytes    uint64    `json:"recv_bytes"`
	SendPackets  uint64    `json:"send_packets"`
	RecvPackets  uint64    `json:"recv_packets"`
	SendErrors   uint64    `json:"send_errors"`
	RecvErrors   uint64    `json:"recv_errors"`
	RNREvents    uint64    `json:"rnr_events"`
	RetryCount   uint64    `json:"retry_count"`
	WriteBytes   uint64    `json:"write_bytes"`
	ReadBytes    uint64    `json:"read_bytes"`
	AtomicOps    uint64    `json:"atomic_ops"`
	LastSendTime time.Time `json:"last_send_time"`
	LastRecvTime time.Time `json:"last_recv_time"`
}

type ProtectionDomain struct {
	ID    uint32
	MRs   map[uint32]*MR
	NextL uint32
	NextR uint32
	mu    sync.Mutex
}

func NewProtectionDomain(id uint32) *ProtectionDomain {
	return &ProtectionDomain{
		ID:    id,
		MRs:   make(map[uint32]*MR),
		NextL: 1,
		NextR: 1,
	}
}

func (pd *ProtectionDomain) RegisterMemory(addr uint64, data []byte) *MR {
	pd.mu.Lock()
	defer pd.mu.Unlock()
	lkey := pd.NextL
	rkey := pd.NextR
	pd.NextL++
	pd.NextR++
	mr := &MR{
		Addr:   addr,
		Length: uint64(len(data)),
		LKey:   lkey,
		RKey:   rkey,
		Data:   data,
		PD:     pd,
	}
	pd.MRs[lkey] = mr
	return mr
}

func (pd *ProtectionDomain) GetMR(lkey uint32) *MR {
	pd.mu.Lock()
	defer pd.mu.Unlock()
	return pd.MRs[lkey]
}

type CQ struct {
	ID     uint32
	Size   uint32
	Ring   []*WC
	Head   uint32
	Tail   uint32
	Count  uint32
	mu     sync.Mutex
	Notify chan struct{}
}

func NewCQ(id, size uint32) *CQ {
	return &CQ{
		ID:     id,
		Size:   size,
		Ring:   make([]*WC, size),
		Notify: make(chan struct{}, 1),
	}
}

func (cq *CQ) Push(wc *WC) {
	cq.mu.Lock()
	defer cq.mu.Unlock()
	if cq.Count >= cq.Size {
		return
	}
	cq.Ring[cq.Tail] = wc
	cq.Tail = (cq.Tail + 1) % cq.Size
	cq.Count++
	select {
	case cq.Notify <- struct{}{}:
	default:
	}
}

func (cq *CQ) Poll() []*WC {
	cq.mu.Lock()
	defer cq.mu.Unlock()
	var results []*WC
	for cq.Count > 0 {
		wc := cq.Ring[cq.Head]
		cq.Ring[cq.Head] = nil
		cq.Head = (cq.Head + 1) % cq.Size
		cq.Count--
		results = append(results, wc)
	}
	return results
}

type QP struct {
	QPN    uint32
	State  QPState
	PD     *ProtectionDomain
	SendCQ *CQ
	RecvCQ *CQ

	SQ     []*WR
	SQHead int
	SQTail int
	RQ     []*WR
	RQHead int
	RQTail int
	MaxWR  int

	PendingSend []*WR
	PendingRecv []*WR
	RetryQueue  []*WR
	MaxRetry    int

	RemoteQPN uint32
	RemoteMR  *MRHandle

	Events []QPEvent
	Stats  *QPStats

	mu sync.Mutex
}

func (qp *QP) SetRemoteQPN(qpn uint32) {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	qp.RemoteQPN = qpn
}

type QPEvent struct {
	Type      string
	Timestamp time.Time
	Detail    string
}

func NewQP(qpn uint32, pd *ProtectionDomain, sendCQ, recvCQ *CQ, maxWR int) *QP {
	return &QP{
		QPN:        qpn,
		State:      QPReset,
		PD:         pd,
		SendCQ:     sendCQ,
		RecvCQ:     recvCQ,
		SQ:         make([]*WR, maxWR),
		RQ:         make([]*WR, maxWR),
		MaxWR:      maxWR,
		RetryQueue: make([]*WR, 0),
		MaxRetry:   3,
		Events:     make([]QPEvent, 0),
		Stats:      &QPStats{},
	}
}

func (qp *QP) Modify(state QPState) error {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	if !isValidTransition(qp.State, state) {
		return ErrInvalidTransition
	}
	qp.addEventLocked("STATE_CHANGE", qp.State.String()+"->"+state.String())
	qp.State = state
	if state == QPError {
		qp.flushQueuesLocked()
	}
	return nil
}

func isValidTransition(from, to QPState) bool {
	switch from {
	case QPReset:
		return to == QPInit || to == QPReset
	case QPInit:
		return to == QPRTR || to == QPReset || to == QPError
	case QPRTR:
		return to == QPRTS || to == QPReset || to == QPError
	case QPRTS:
		return to == QPReset || to == QPError
	case QPError:
		return to == QPReset
	default:
		return false
	}
}

func (qp *QP) PostSend(wr *WR) error {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	if qp.State != QPRTS {
		return ErrQPNotReady
	}
	if qp.SQTail-qp.SQHead >= qp.MaxWR {
		return ErrSQFull
	}
	wr.QPN = qp.QPN
	qp.SQ[qp.SQTail%qp.MaxWR] = wr
	qp.SQTail++
	qp.addEventLocked("POST_SEND", "WR#"+utoa(wr.ID))
	return nil
}

func (qp *QP) PostRecv(wr *WR) error {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	if qp.State != QPRTS && qp.State != QPRTR {
		return ErrQPNotReady
	}
	if qp.RQTail-qp.RQHead >= qp.MaxWR {
		return ErrRQFull
	}
	wr.QPN = qp.QPN
	qp.RQ[qp.RQTail%qp.MaxWR] = wr
	qp.RQTail++
	qp.addEventLocked("POST_RECV", "WR#"+utoa(wr.ID))
	return nil
}

func (qp *QP) ProcessSQ() {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	if qp.State != QPRTS {
		return
	}
	for qp.SQHead < qp.SQTail {
		wr := qp.SQ[qp.SQHead%qp.MaxWR]
		qp.SQ[qp.SQHead%qp.MaxWR] = nil
		qp.SQHead++
		qp.processSendWR(wr)
	}
}

func (qp *QP) processSendWR(wr *WR) {
	switch wr.Opcode {
	case WRSend:
		qp.handleSend(wr)
	case WRRDMAWrite:
		qp.handleRDMAWrite(wr)
	case WRRDMARead:
		qp.handleRDMARead(wr)
	case WRCmpSwap:
		qp.handleCmpSwap(wr)
	default:
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
	}
}

func (qp *QP) handleSend(wr *WR) {
	totalLen := uint32(0)
	for _, sge := range wr.SGE {
		totalLen += sge.Length
	}
	qp.addEventLocked("POST_SEND_PROCESS", "WR#"+utoa(wr.ID)+" len="+utoa(uint64(totalLen)))
	qp.PendingSend = append(qp.PendingSend, wr)
}

func (qp *QP) handleCmpSwap(wr *WR) {
	if wr.Atomic == nil {
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		return
	}

	pd := qp.PD
	targetMR := findMRByRKey(pd, wr.Atomic.RKey)
	if targetMR == nil {
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		return
	}

	result, swapped := targetMR.CmpSwap(wr.Atomic.RemoteAddr-targetMR.Addr, wr.Atomic.Compare, wr.Atomic.Swap)

	if wr.Atomic.ResultLKey != 0 {
		localMR := pd.GetMR(wr.Atomic.ResultLKey)
		if localMR != nil {
			resultBytes := make([]byte, 8)
			binary.LittleEndian.PutUint64(resultBytes, result)
			localMR.Write(wr.Atomic.ResultAddr-localMR.Addr, resultBytes)
		}
	}

	qp.Stats.AddAtomicOp()
	qp.SendCQ.Push(&WC{
		WRID:   wr.ID,
		Status: WCSuccess,
		Opcode: wr.Opcode,
		Length: 8,
		QPN:    qp.QPN,
		Ts:     time.Now(),
	})
	detail := "WR#" + utoa(wr.ID)
	if swapped {
		detail += " swapped: 0x" + strconv.FormatUint(wr.Atomic.Compare, 16) + "→0x" + strconv.FormatUint(wr.Atomic.Swap, 16)
	} else {
		detail += " not swapped: expected 0x" + strconv.FormatUint(wr.Atomic.Compare, 16) + ", actual 0x" + strconv.FormatUint(result, 16)
	}
	qp.addEventLocked("CMP_SWAP_COMPLETE", detail)
}

func (qp *QP) handleRDMAWrite(wr *WR) {
	if wr.RemoteMR == nil {
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		return
	}
	totalLen := uint64(0)
	for _, sge := range wr.SGE {
		pd := qp.PD
		pd.mu.Lock()
		localMR, ok := pd.MRs[sge.LKey]
		pd.mu.Unlock()
		if !ok {
			continue
		}
		data, _ := localMR.Read(sge.Addr-localMR.Addr, sge.Length)
		totalLen += uint64(len(data))
		targetMR := findMRByRKey(pd, wr.RemoteMR.RKey)
		if targetMR != nil {
			targetMR.Write(wr.RemoteMR.Addr-targetMR.Addr, data)
		}
	}
	qp.Stats.AddWriteBytes(totalLen)
	qp.SendCQ.Push(&WC{
		WRID:   wr.ID,
		Status: WCSuccess,
		Opcode: wr.Opcode,
		QPN:    qp.QPN,
		Ts:     time.Now(),
	})
	qp.addEventLocked("RDMA_WRITE_COMPLETE", "WR#"+utoa(wr.ID)+" len="+utoa(totalLen))
}

func (qp *QP) handleRDMARead(wr *WR) {
	if wr.RemoteMR == nil {
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		return
	}
	totalLen := uint64(0)
	targetMR := findMRByRKey(qp.PD, wr.RemoteMR.RKey)
	if targetMR != nil {
		data, _ := targetMR.Read(wr.RemoteMR.Addr-targetMR.Addr, wr.RemoteMR.Len)
		totalLen = uint64(len(data))
		for _, sge := range wr.SGE {
			localMR, ok := qp.PD.MRs[sge.LKey]
			if ok {
				localMR.Write(sge.Addr-localMR.Addr, data[:min(uint32(len(data)), sge.Length)])
			}
		}
	}
	qp.Stats.AddReadBytes(totalLen)
	qp.SendCQ.Push(&WC{
		WRID:   wr.ID,
		Status: WCSuccess,
		Opcode: wr.Opcode,
		Length: wr.RemoteMR.Len,
		QPN:    qp.QPN,
		Ts:     time.Now(),
	})
	qp.addEventLocked("RDMA_READ_COMPLETE", "WR#"+utoa(wr.ID)+" len="+utoa(totalLen))
}

func (qp *QP) ProcessRQ(remoteData []byte) bool {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	if qp.State != QPRTS && qp.State != QPRTR {
		return false
	}
	if qp.RQHead >= qp.RQTail {
		return false
	}
	wr := qp.RQ[qp.RQHead%qp.MaxWR]
	qp.RQ[qp.RQHead%qp.MaxWR] = nil
	qp.RQHead++
	recvLen := 0
	if len(remoteData) > 0 {
		for _, sge := range wr.SGE {
			pd := qp.PD
			pd.mu.Lock()
			localMR, ok := pd.MRs[sge.LKey]
			pd.mu.Unlock()
			if ok {
				writeLen := min(sge.Length, uint32(len(remoteData)))
				localMR.Write(sge.Addr-localMR.Addr, remoteData[:writeLen])
				recvLen += int(writeLen)
				remoteData = remoteData[writeLen:]
			}
		}
	}
	qp.Stats.AddRecvBytes(uint64(recvLen))
	qp.RecvCQ.Push(&WC{
		WRID:   wr.ID,
		Status: WCSuccess,
		Opcode: WRRecv,
		Length: uint32(recvLen),
		QPN:    qp.QPN,
		Ts:     time.Now(),
	})
	qp.addEventLocked("RECV_COMPLETE", "WR#"+utoa(wr.ID)+" len="+utoa(uint64(recvLen)))
	return true
}

func (qp *QP) flushQueuesLocked() {
	for i := qp.SQHead; i < qp.SQTail; i++ {
		wr := qp.SQ[i%qp.MaxWR]
		if wr != nil {
			qp.SendCQ.Push(&WC{
				WRID:   wr.ID,
				Status: WCFlushed,
				Opcode: wr.Opcode,
				QPN:    qp.QPN,
				Ts:     time.Now(),
			})
		}
		qp.SQ[i%qp.MaxWR] = nil
	}
	qp.SQHead = qp.SQTail
	for i := qp.RQHead; i < qp.RQTail; i++ {
		wr := qp.RQ[i%qp.MaxWR]
		if wr != nil {
			qp.RecvCQ.Push(&WC{
				WRID:   wr.ID,
				Status: WCFlushed,
				Opcode: wr.Opcode,
				QPN:    qp.QPN,
				Ts:     time.Now(),
			})
		}
		qp.RQ[i%qp.MaxWR] = nil
	}
	qp.RQHead = qp.RQTail
}

func (qp *QP) addEventLocked(typ, detail string) {
	qp.Events = append(qp.Events, QPEvent{
		Type:      typ,
		Timestamp: time.Now(),
		Detail:    detail,
	})
	if len(qp.Events) > 100 {
		qp.Events = qp.Events[len(qp.Events)-100:]
	}
}

func (qp *QP) addEventLockedExternal(typ, detail string) {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	qp.addEventLocked(typ, detail)
}

func (qp *QP) Snapshot() QPSnapshot {
	qp.mu.Lock()
	defer qp.mu.Unlock()
	sq := make([]WRSnapshot, 0)
	for i := qp.SQHead; i < qp.SQTail; i++ {
		if wr := qp.SQ[i%qp.MaxWR]; wr != nil {
			sq = append(sq, wrSnapshot(wr))
		}
	}
	rq := make([]WRSnapshot, 0)
	for i := qp.RQHead; i < qp.RQTail; i++ {
		if wr := qp.RQ[i%qp.MaxWR]; wr != nil {
			rq = append(rq, wrSnapshot(wr))
		}
	}
	retry := make([]WRSnapshot, 0)
	for _, wr := range qp.RetryQueue {
		retry = append(retry, wrSnapshot(wr))
	}
	events := make([]QPEvent, len(qp.Events))
	copy(events, qp.Events)
	return QPSnapshot{
		QPN:        qp.QPN,
		State:      qp.State.String(),
		SQ:         sq,
		RQ:         rq,
		RetryQueue: retry,
		SQDepth:    qp.SQTail - qp.SQHead,
		RQDepth:    qp.RQTail - qp.RQHead,
		RetryDepth: len(qp.RetryQueue),
		RemoteQPN:  qp.RemoteQPN,
		Events:     events,
		Stats:      qp.Stats.Snapshot(),
	}
}

type QPSnapshot struct {
	QPN        uint32          `json:"qpn"`
	State      string          `json:"state"`
	SQ         []WRSnapshot    `json:"sq"`
	RQ         []WRSnapshot    `json:"rq"`
	RetryQueue []WRSnapshot    `json:"retry_queue"`
	SQDepth    int             `json:"sq_depth"`
	RQDepth    int             `json:"rq_depth"`
	RetryDepth int             `json:"retry_depth"`
	RemoteQPN  uint32          `json:"remote_qpn"`
	Events     []QPEvent       `json:"events"`
	Stats      QPStatsSnapshot `json:"stats"`
}

type WRSnapshot struct {
	ID         uint64        `json:"id"`
	Opcode     string        `json:"opcode"`
	SGEs       []SGESnapshot `json:"sges"`
	RetryCount int           `json:"retry_count"`
}

type SGESnapshot struct {
	Addr   uint64 `json:"addr"`
	Length uint32 `json:"length"`
	LKey   uint32 `json:"lkey"`
}

func wrSnapshot(wr *WR) WRSnapshot {
	sges := make([]SGESnapshot, len(wr.SGE))
	for i, sge := range wr.SGE {
		sges[i] = SGESnapshot{Addr: sge.Addr, Length: sge.Length, LKey: sge.LKey}
	}
	return WRSnapshot{ID: wr.ID, Opcode: wr.Opcode.String(), SGEs: sges, RetryCount: wr.RetryCount}
}

func findMRByRKey(pd *ProtectionDomain, rkey uint32) *MR {
	pd.mu.Lock()
	defer pd.mu.Unlock()
	for _, mr := range pd.MRs {
		if mr.RKey == rkey {
			return mr
		}
	}
	return nil
}

func min(a, b uint32) uint32 {
	if a < b {
		return a
	}
	return b
}

func utoa(v uint64) string {
	return strconv.FormatUint(v, 10)
}
