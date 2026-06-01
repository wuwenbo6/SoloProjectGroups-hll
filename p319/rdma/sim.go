package rdma

import (
	"sync"
	"sync/atomic"
	"time"
)

type Simulator struct {
	PDs map[uint32]*ProtectionDomain
	QPs map[uint32]*QP
	CQs map[uint32]*CQ

	nextPD atomic.Uint32
	nextQP atomic.Uint32
	nextCQ atomic.Uint32
	nextWR atomic.Uint64

	mu sync.RWMutex

	OnEvent func(event SimEvent)
}

type SimEvent struct {
	Type      string      `json:"type"`
	Timestamp time.Time   `json:"timestamp"`
	QPN       uint32      `json:"qpn,omitempty"`
	Detail    string      `json:"detail,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

func NewSimulator() *Simulator {
	s := &Simulator{
		PDs: make(map[uint32]*ProtectionDomain),
		QPs: make(map[uint32]*QP),
		CQs: make(map[uint32]*CQ),
	}
	s.nextQP.Store(1)
	s.nextPD.Store(1)
	s.nextCQ.Store(1)
	s.nextWR.Store(1)
	return s
}

func (s *Simulator) CreatePD() *ProtectionDomain {
	id := s.nextPD.Add(1) - 1
	pd := NewProtectionDomain(id)
	s.mu.Lock()
	s.PDs[id] = pd
	s.mu.Unlock()
	s.emit("PD_CREATED", 0, "PD#"+utoa(uint64(id)))
	return pd
}

func (s *Simulator) CreateCQ(size uint32) *CQ {
	id := s.nextCQ.Add(1) - 1
	cq := NewCQ(id, size)
	s.mu.Lock()
	s.CQs[id] = cq
	s.mu.Unlock()
	s.emit("CQ_CREATED", 0, "CQ#"+utoa(uint64(id)))
	return cq
}

func (s *Simulator) CreateQP(pd *ProtectionDomain, sendCQ, recvCQ *CQ, maxWR int) *QP {
	qpn := s.nextQP.Add(1) - 1
	qp := NewQP(qpn, pd, sendCQ, recvCQ, maxWR)
	s.mu.Lock()
	s.QPs[qpn] = qp
	s.mu.Unlock()
	s.emit("QP_CREATED", qpn, "QP#"+utoa(uint64(qpn)))
	return qp
}

func (s *Simulator) ModifyQP(qpn uint32, state QPState) error {
	qp := s.GetQP(qpn)
	if qp == nil {
		return ErrWRNotFound
	}
	err := qp.Modify(state)
	if err != nil {
		return err
	}
	s.emit("QP_MODIFIED", qpn, state.String())
	return nil
}

func (s *Simulator) PostSend(qpn uint32, opcode WROpcode, sges []SGE, remoteMR *MRHandle, atomic *AtomicArgs) error {
	qp := s.GetQP(qpn)
	if qp == nil {
		return ErrWRNotFound
	}
	wrID := s.nextWR.Add(1) - 1
	wr := &WR{
		ID:       wrID,
		Opcode:   opcode,
		SGE:      sges,
		RemoteMR: remoteMR,
		Atomic:   atomic,
	}
	err := qp.PostSend(wr)
	if err != nil {
		return err
	}
	qp.ProcessSQ()
	s.processPendingSends(qp)
	s.emit("POST_SEND", qpn, "WR#"+utoa(wrID)+" "+opcode.String())
	return nil
}

func (s *Simulator) PostRecv(qpn uint32, sges []SGE) error {
	qp := s.GetQP(qpn)
	if qp == nil {
		return ErrWRNotFound
	}
	wrID := s.nextWR.Add(1) - 1
	wr := &WR{
		ID:     wrID,
		Opcode: WRRecv,
		SGE:    sges,
	}
	err := qp.PostRecv(wr)
	if err != nil {
		return err
	}
	s.emit("POST_RECV", qpn, "WR#"+utoa(wrID))
	return nil
}

func (s *Simulator) PollCQ(cqID uint32) []*WC {
	s.mu.RLock()
	cq, ok := s.CQs[cqID]
	s.mu.RUnlock()
	if !ok {
		return nil
	}
	return cq.Poll()
}

func (s *Simulator) GetQP(qpn uint32) *QP {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.QPs[qpn]
}

func (s *Simulator) processPendingSends(qp *QP) {
	qp.mu.Lock()
	pending := qp.PendingSend
	qp.PendingSend = nil
	qp.mu.Unlock()

	for _, wr := range pending {
		s.trySendWR(qp, wr)
	}

	s.ProcessRetries(qp)
}

func (s *Simulator) trySendWR(qp *QP, wr *WR) {
	var remoteQP *QP
	s.mu.RLock()
	for _, q := range s.QPs {
		if q.QPN == qp.RemoteQPN {
			remoteQP = q
			break
		}
	}
	s.mu.RUnlock()

	if remoteQP == nil {
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCLocalError,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		s.emit("SEND_ERROR", qp.QPN, "WR#"+utoa(wr.ID)+" no remote QP")
		return
	}

	var data []byte
	for _, sge := range wr.SGE {
		pd := qp.PD
		pd.mu.Lock()
		localMR, ok := pd.MRs[sge.LKey]
		pd.mu.Unlock()
		if ok {
			buf, _ := localMR.Read(sge.Addr-localMR.Addr, sge.Length)
			data = append(data, buf...)
		}
	}

	success := remoteQP.ProcessRQ(data)

	if success {
		totalLen := uint32(0)
		for _, sge := range wr.SGE {
			totalLen += sge.Length
		}
		qp.Stats.AddSendBytes(uint64(totalLen))
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCSuccess,
			Opcode: wr.Opcode,
			Length: totalLen,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		qp.addEventLockedExternal("SEND_COMPLETE", "WR#"+utoa(wr.ID)+" len="+utoa(uint64(totalLen)))
		s.emit("SEND_COMPLETE", qp.QPN, "WR#"+utoa(wr.ID)+" len="+utoa(uint64(totalLen)))
		s.emit("DATA_DELIVERED", remoteQP.QPN, "from QP#"+utoa(uint64(qp.QPN))+" len="+utoa(uint64(len(data))))
	} else {
		qp.Stats.AddRNR()
		qp.SendCQ.Push(&WC{
			WRID:   wr.ID,
			Status: WCRNR,
			Opcode: wr.Opcode,
			QPN:    qp.QPN,
			Ts:     time.Now(),
		})
		wr.RetryCount++
		qp.addEventLockedExternal("SEND_RNR", "WR#"+utoa(wr.ID)+" retry="+utoa(uint64(wr.RetryCount))+"/"+utoa(uint64(qp.MaxRetry)))
		s.emit("SEND_RNR", qp.QPN, "WR#"+utoa(wr.ID)+" retry="+utoa(uint64(wr.RetryCount))+"/"+utoa(uint64(qp.MaxRetry)))

		if wr.RetryCount < qp.MaxRetry {
			qp.Stats.AddRetry()
			qp.mu.Lock()
			qp.RetryQueue = append(qp.RetryQueue, wr)
			qp.mu.Unlock()
			qp.SendCQ.Push(&WC{
				WRID:   wr.ID,
				Status: WCRetry,
				Opcode: wr.Opcode,
				QPN:    qp.QPN,
				Ts:     time.Now(),
			})
			s.emit("SEND_RETRY_SCHEDULED", qp.QPN, "WR#"+utoa(wr.ID)+" will retry")
		} else {
			qp.Stats.AddSendError()
			qp.SendCQ.Push(&WC{
				WRID:   wr.ID,
				Status: WCRemoteError,
				Opcode: wr.Opcode,
				QPN:    qp.QPN,
				Ts:     time.Now(),
			})
			qp.addEventLockedExternal("SEND_FAILED", "WR#"+utoa(wr.ID)+" max retries exceeded")
			s.emit("SEND_FAILED", qp.QPN, "WR#"+utoa(wr.ID)+" max retries exceeded")
		}
	}
}

func (s *Simulator) ProcessRetries(qp *QP) {
	qp.mu.Lock()
	retries := qp.RetryQueue
	qp.RetryQueue = nil
	qp.mu.Unlock()

	for _, wr := range retries {
		s.emit("SEND_RETRY_ATTEMPT", qp.QPN, "WR#"+utoa(wr.ID)+" attempt "+utoa(uint64(wr.RetryCount)))
		s.trySendWR(qp, wr)
	}
}

func (s *Simulator) Snapshot() *SimSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	qps := make([]QPSnapshot, 0, len(s.QPs))
	for _, qp := range s.QPs {
		qps = append(qps, qp.Snapshot())
	}

	cqs := make([]CQSnapshot, 0, len(s.CQs))
	for _, cq := range s.CQs {
		cq.mu.Lock()
		wcs := make([]WCSnapshot, 0)
		for i := cq.Head; i != cq.Tail; i = (i + 1) % cq.Size {
			if wc := cq.Ring[i]; wc != nil {
				wcs = append(wcs, WCSnapshot{
					WRID:   wc.WRID,
					Status: wc.Status.String(),
					Opcode: wc.Opcode.String(),
					Length: wc.Length,
					QPN:    wc.QPN,
					Ts:     wc.Ts,
				})
			}
		}
		cqs = append(cqs, CQSnapshot{
			ID:    cq.ID,
			Count: cq.Count,
			WCs:   wcs,
		})
		cq.mu.Unlock()
	}

	pds := make([]PDSnapshot, 0, len(s.PDs))
	for _, pd := range s.PDs {
		pd.mu.Lock()
		mrs := make([]MRSnapshot, 0, len(pd.MRs))
		for _, mr := range pd.MRs {
			mrs = append(mrs, MRSnapshot{
				Addr:   mr.Addr,
				Length: mr.Length,
				LKey:   mr.LKey,
				RKey:   mr.RKey,
			})
		}
		pds = append(pds, PDSnapshot{
			ID:  pd.ID,
			MRs: mrs,
		})
		pd.mu.Unlock()
	}

	return &SimSnapshot{
		QPs: qps,
		CQs: cqs,
		PDs: pds,
	}
}

type SimSnapshot struct {
	QPs []QPSnapshot `json:"qps"`
	CQs []CQSnapshot `json:"cqs"`
	PDs []PDSnapshot `json:"pds"`
}

type CQSnapshot struct {
	ID    uint32       `json:"id"`
	Count uint32       `json:"count"`
	WCs   []WCSnapshot `json:"wcs"`
}

type WCSnapshot struct {
	WRID   uint64    `json:"wr_id"`
	Status string    `json:"status"`
	Opcode string    `json:"opcode"`
	Length uint32    `json:"length"`
	QPN    uint32    `json:"qpn"`
	Ts     time.Time `json:"ts"`
}

type PDSnapshot struct {
	ID  uint32       `json:"id"`
	MRs []MRSnapshot `json:"mrs"`
}

type MRSnapshot struct {
	Addr   uint64 `json:"addr"`
	Length uint64 `json:"length"`
	LKey   uint32 `json:"lkey"`
	RKey   uint32 `json:"rkey"`
}

func (s *Simulator) GetPD(id uint32) *ProtectionDomain {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.PDs[id]
}

func (s *Simulator) GetCQ(id uint32) *CQ {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.CQs[id]
}

func (s *Simulator) ConnectQP(qpn, remoteQPN uint32) error {
	qp := s.GetQP(qpn)
	if qp == nil {
		return ErrWRNotFound
	}
	qp.SetRemoteQPN(remoteQPN)
	return nil
}

func (s *Simulator) RegisterMR(pdID uint32, addr uint64, length int) (*MR, error) {
	pd := s.GetPD(pdID)
	if pd == nil {
		return nil, ErrWRNotFound
	}
	mr := pd.RegisterMemory(addr, make([]byte, length))
	return mr, nil
}

func (s *Simulator) ReadMR(pdID, lkey uint32, offset uint64, length uint32) ([]byte, error) {
	pd := s.GetPD(pdID)
	if pd == nil {
		return nil, ErrWRNotFound
	}
	mr := pd.GetMR(lkey)
	if mr == nil {
		return nil, ErrWRNotFound
	}
	return mr.Read(offset, length)
}

func (s *Simulator) emit(typ string, qpn uint32, detail string) {
	if s.OnEvent != nil {
		s.OnEvent(SimEvent{
			Type:      typ,
			Timestamp: time.Now(),
			QPN:       qpn,
			Detail:    detail,
		})
	}
}
