package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"rdma-sim/rdma"

	"github.com/gorilla/websocket"
)

type Server struct {
	Sim  *rdma.Simulator
	Port int

	wsClients map[*websocket.Conn]struct{}
	wsMu      sync.RWMutex
	wsEvents  chan rdma.SimEvent
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewServer(sim *rdma.Simulator, port int) *Server {
	s := &Server{
		Sim:       sim,
		Port:      port,
		wsClients: make(map[*websocket.Conn]struct{}),
		wsEvents:  make(chan rdma.SimEvent, 256),
	}
	sim.OnEvent = func(ev rdma.SimEvent) {
		select {
		case s.wsEvents <- ev:
		default:
		}
	}
	go s.broadcastLoop()
	return s
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/snapshot", s.handleSnapshot)
	mux.HandleFunc("/api/pd", s.handleCreatePD)
	mux.HandleFunc("/api/cq", s.handleCreateCQ)
	mux.HandleFunc("/api/qp", s.handleCreateQP)
	mux.HandleFunc("/api/qp/modify", s.handleModifyQP)
	mux.HandleFunc("/api/qp/post-send", s.handlePostSend)
	mux.HandleFunc("/api/qp/post-recv", s.handlePostRecv)
	mux.HandleFunc("/api/qp/connect", s.handleConnectQP)
	mux.HandleFunc("/api/cq/poll", s.handlePollCQ)
	mux.HandleFunc("/api/mr/register", s.handleRegisterMR)
	mux.HandleFunc("/api/mr/read", s.handleReadMR)
	mux.HandleFunc("/api/qp/retry", s.handleRetryQP)
	mux.HandleFunc("/api/demo", s.handleDemo)
	mux.HandleFunc("/api/demo-rnr", s.handleRNRDemo)
	mux.HandleFunc("/api/demo-atomic", s.handleAtomicDemo)
	mux.HandleFunc("/ws", s.handleWS)
	mux.HandleFunc("/", s.handleFrontend)

	addr := fmt.Sprintf(":%d", s.Port)
	fmt.Printf("RDMA Simulator server listening on %s\n", addr)
	return http.ListenAndServe(addr, mux)
}

func (s *Server) handleSnapshot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.Sim.Snapshot())
}

func (s *Server) handleCreatePD(w http.ResponseWriter, r *http.Request) {
	pd := s.Sim.CreatePD()
	writeJSON(w, map[string]uint32{"pd_id": pd.ID})
}

func (s *Server) handleCreateCQ(w http.ResponseWriter, r *http.Request) {
	size := uint32(64)
	if v := r.URL.Query().Get("size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			size = uint32(n)
		}
	}
	cq := s.Sim.CreateCQ(size)
	writeJSON(w, map[string]uint32{"cq_id": cq.ID})
}

func (s *Server) handleCreateQP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PDID   uint32 `json:"pd_id"`
		SendCQ uint32 `json:"send_cq_id"`
		RecvCQ uint32 `json:"recv_cq_id"`
		MaxWR  int    `json:"max_wr"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.MaxWR <= 0 {
		req.MaxWR = 16
	}

	pd := s.Sim.GetPD(req.PDID)
	sendCQ := s.Sim.GetCQ(req.SendCQ)
	recvCQ := s.Sim.GetCQ(req.RecvCQ)

	if pd == nil || sendCQ == nil || recvCQ == nil {
		http.Error(w, "invalid pd/cq id", http.StatusBadRequest)
		return
	}

	qp := s.Sim.CreateQP(pd, sendCQ, recvCQ, req.MaxWR)
	writeJSON(w, map[string]uint32{"qpn": qp.QPN})
}

func (s *Server) handleModifyQP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		QPN   uint32 `json:"qpn"`
		State string `json:"state"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var state rdma.QPState
	switch req.State {
	case "RESET":
		state = rdma.QPReset
	case "INIT":
		state = rdma.QPInit
	case "RTR":
		state = rdma.QPRTR
	case "RTS":
		state = rdma.QPRTS
	case "ERROR":
		state = rdma.QPError
	default:
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}
	if err := s.Sim.ModifyQP(req.QPN, state); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handlePostSend(w http.ResponseWriter, r *http.Request) {
	var req struct {
		QPN      uint32           `json:"qpn"`
		Opcode   string           `json:"opcode"`
		SGEs     []rdma.SGE       `json:"sges"`
		RemoteMR *rdma.MRHandle   `json:"remote_mr,omitempty"`
		Atomic   *rdma.AtomicArgs `json:"atomic,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var opcode rdma.WROpcode
	switch req.Opcode {
	case "SEND":
		opcode = rdma.WRSend
	case "RDMA_WRITE":
		opcode = rdma.WRRDMAWrite
	case "RDMA_READ":
		opcode = rdma.WRRDMARead
	case "CMP_SWAP":
		opcode = rdma.WRCmpSwap
	default:
		http.Error(w, "invalid opcode", http.StatusBadRequest)
		return
	}
	if err := s.Sim.PostSend(req.QPN, opcode, req.SGEs, req.RemoteMR, req.Atomic); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handlePostRecv(w http.ResponseWriter, r *http.Request) {
	var req struct {
		QPN  uint32     `json:"qpn"`
		SGEs []rdma.SGE `json:"sges"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.Sim.PostRecv(req.QPN, req.SGEs); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handleConnectQP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		QPN       uint32 `json:"qpn"`
		RemoteQPN uint32 `json:"remote_qpn"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := s.Sim.ConnectQP(req.QPN, req.RemoteQPN); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *Server) handlePollCQ(w http.ResponseWriter, r *http.Request) {
	cqIDStr := r.URL.Query().Get("cq_id")
	if cqIDStr == "" {
		http.Error(w, "cq_id required", http.StatusBadRequest)
		return
	}
	cqID, err := strconv.ParseUint(cqIDStr, 10, 32)
	if err != nil {
		http.Error(w, "invalid cq_id", http.StatusBadRequest)
		return
	}
	wcs := s.Sim.PollCQ(uint32(cqID))
	if wcs == nil {
		writeJSON(w, []interface{}{})
		return
	}
	type wcOut struct {
		WRID   uint64    `json:"wr_id"`
		Status string    `json:"status"`
		Opcode string    `json:"opcode"`
		Length uint32    `json:"length"`
		QPN    uint32    `json:"qpn"`
		Ts     time.Time `json:"ts"`
	}
	out := make([]wcOut, len(wcs))
	for i, wc := range wcs {
		out[i] = wcOut{
			WRID:   wc.WRID,
			Status: wc.Status.String(),
			Opcode: wc.Opcode.String(),
			Length: wc.Length,
			QPN:    wc.QPN,
			Ts:     wc.Ts,
		}
	}
	writeJSON(w, out)
}

func (s *Server) handleRegisterMR(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PDID   uint32 `json:"pd_id"`
		Addr   uint64 `json:"addr"`
		Length int    `json:"length"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Length <= 0 {
		req.Length = 4096
	}
	mr, err := s.Sim.RegisterMR(req.PDID, req.Addr, req.Length)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]uint32{"lkey": mr.LKey, "rkey": mr.RKey})
}

func (s *Server) handleReadMR(w http.ResponseWriter, r *http.Request) {
	var req struct {
		PDID   uint32 `json:"pd_id"`
		LKey   uint32 `json:"lkey"`
		Offset uint64 `json:"offset"`
		Length uint32 `json:"length"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	data, err := s.Sim.ReadMR(req.PDID, req.LKey, req.Offset, req.Length)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, map[string]string{"data": fmt.Sprintf("%x", data)})
}

func (s *Server) handleRetryQP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		QPN uint32 `json:"qpn"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	qp := s.Sim.GetQP(req.QPN)
	if qp == nil {
		http.Error(w, "qp not found", http.StatusBadRequest)
		return
	}
	s.Sim.ProcessRetries(qp)
	writeJSON(w, map[string]string{"status": "retries processed"})
}

func (s *Server) handleRNRDemo(w http.ResponseWriter, r *http.Request) {
	go s.runRNRDemo()
	writeJSON(w, map[string]string{"status": "RNR demo started"})
}

func (s *Server) runRNRDemo() {
	pd1 := s.Sim.CreatePD()
	pd2 := s.Sim.CreatePD()
	sendCQ1 := s.Sim.CreateCQ(64)
	recvCQ1 := s.Sim.CreateCQ(64)
	sendCQ2 := s.Sim.CreateCQ(64)
	recvCQ2 := s.Sim.CreateCQ(64)

	qp1 := s.Sim.CreateQP(pd1, sendCQ1, recvCQ1, 16)
	qp2 := s.Sim.CreateQP(pd2, sendCQ2, recvCQ2, 16)

	mr1 := pd1.RegisterMemory(0x10000, make([]byte, 4096))
	for i := range mr1.Data {
		mr1.Data[i] = byte(i % 256)
	}
	mr2 := pd2.RegisterMemory(0x20000, make([]byte, 4096))

	s.Sim.ModifyQP(qp1.QPN, rdma.QPInit)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPInit)

	qp1.SetRemoteQPN(qp2.QPN)
	qp2.SetRemoteQPN(qp1.QPN)

	s.Sim.ModifyQP(qp1.QPN, rdma.QPRTR)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPRTR)
	s.Sim.ModifyQP(qp1.QPN, rdma.QPRTS)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPRTS)

	s.Sim.PostSend(qp1.QPN, rdma.WRSend, []rdma.SGE{
		{Addr: 0x10000, Length: 128, LKey: mr1.LKey},
	}, nil, nil)

	time.Sleep(400 * time.Millisecond)
	s.Sim.PostSend(qp1.QPN, rdma.WRSend, []rdma.SGE{
		{Addr: 0x10080, Length: 64, LKey: mr1.LKey},
	}, nil, nil)

	time.Sleep(400 * time.Millisecond)
	s.Sim.PostRecv(qp2.QPN, []rdma.SGE{
		{Addr: 0x20000, Length: 128, LKey: mr2.LKey},
	})

	s.Sim.ProcessRetries(qp1)

	time.Sleep(300 * time.Millisecond)
	s.Sim.ProcessRetries(qp1)

	time.Sleep(300 * time.Millisecond)
	s.Sim.ProcessRetries(qp1)
}

func (s *Server) handleAtomicDemo(w http.ResponseWriter, r *http.Request) {
	go s.runAtomicDemo()
	writeJSON(w, map[string]string{"status": "atomic demo started"})
}

func (s *Server) runAtomicDemo() {
	pd := s.Sim.CreatePD()
	sendCQ := s.Sim.CreateCQ(64)
	recvCQ := s.Sim.CreateCQ(64)
	qp := s.Sim.CreateQP(pd, sendCQ, recvCQ, 16)

	mr := pd.RegisterMemory(0x10000, make([]byte, 4096))

	s.Sim.ModifyQP(qp.QPN, rdma.QPInit)
	s.Sim.ModifyQP(qp.QPN, rdma.QPRTR)
	s.Sim.ModifyQP(qp.QPN, rdma.QPRTS)

	s.Sim.PostSend(qp.QPN, rdma.WRCmpSwap, []rdma.SGE{}, nil, &rdma.AtomicArgs{
		RemoteAddr: 0x10000,
		RKey:       mr.RKey,
		Compare:    0,
		Swap:       0xFFFFFFFFFFFFFFFF,
	})

	time.Sleep(300 * time.Millisecond)

	s.Sim.PostSend(qp.QPN, rdma.WRCmpSwap, []rdma.SGE{}, nil, &rdma.AtomicArgs{
		RemoteAddr: 0x10000,
		RKey:       mr.RKey,
		Compare:    0xFFFFFFFFFFFFFFFF,
		Swap:       0x12345678,
	})

	time.Sleep(300 * time.Millisecond)

	s.Sim.PostSend(qp.QPN, rdma.WRCmpSwap, []rdma.SGE{}, nil, &rdma.AtomicArgs{
		RemoteAddr: 0x10000,
		RKey:       mr.RKey,
		Compare:    0x12345678,
		Swap:       0,
	})
}

func (s *Server) handleDemo(w http.ResponseWriter, r *http.Request) {
	go s.runDemo()
	writeJSON(w, map[string]string{"status": "demo started"})
}

func (s *Server) runDemo() {
	pd1 := s.Sim.CreatePD()
	pd2 := s.Sim.CreatePD()
	sendCQ1 := s.Sim.CreateCQ(64)
	recvCQ1 := s.Sim.CreateCQ(64)
	sendCQ2 := s.Sim.CreateCQ(64)
	recvCQ2 := s.Sim.CreateCQ(64)

	qp1 := s.Sim.CreateQP(pd1, sendCQ1, recvCQ1, 16)
	qp2 := s.Sim.CreateQP(pd2, sendCQ2, recvCQ2, 16)

	mr1 := pd1.RegisterMemory(0x10000, make([]byte, 4096))
	for i := range mr1.Data {
		mr1.Data[i] = byte(i % 256)
	}
	mr2 := pd2.RegisterMemory(0x20000, make([]byte, 4096))

	s.Sim.ModifyQP(qp1.QPN, rdma.QPInit)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPInit)

	qp1.SetRemoteQPN(qp2.QPN)
	qp2.SetRemoteQPN(qp1.QPN)

	s.Sim.ModifyQP(qp1.QPN, rdma.QPRTR)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPRTR)
	s.Sim.ModifyQP(qp1.QPN, rdma.QPRTS)
	s.Sim.ModifyQP(qp2.QPN, rdma.QPRTS)

	s.Sim.PostRecv(qp2.QPN, []rdma.SGE{
		{Addr: 0x20000, Length: 128, LKey: mr2.LKey},
	})

	time.Sleep(300 * time.Millisecond)

	s.Sim.PostSend(qp1.QPN, rdma.WRSend, []rdma.SGE{
		{Addr: 0x10000, Length: 128, LKey: mr1.LKey},
	}, nil, nil)

	time.Sleep(300 * time.Millisecond)

	s.Sim.PostRecv(qp2.QPN, []rdma.SGE{
		{Addr: 0x20000, Length: 64, LKey: mr2.LKey},
	})
	time.Sleep(200 * time.Millisecond)

	s.Sim.PostSend(qp1.QPN, rdma.WRRDMAWrite, []rdma.SGE{
		{Addr: 0x10000, Length: 64, LKey: mr1.LKey},
	}, &rdma.MRHandle{Addr: 0x20000, Len: 64, RKey: mr2.RKey}, nil)

	time.Sleep(300 * time.Millisecond)

	s.Sim.PostSend(qp1.QPN, rdma.WRRDMARead, []rdma.SGE{
		{Addr: 0x10000, Length: 64, LKey: mr1.LKey},
	}, &rdma.MRHandle{Addr: 0x20000, Len: 64, RKey: mr2.RKey}, nil)
}

func (s *Server) handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.wsMu.Lock()
	s.wsClients[conn] = struct{}{}
	s.wsMu.Unlock()

	defer func() {
		s.wsMu.Lock()
		delete(s.wsClients, conn)
		s.wsMu.Unlock()
		conn.Close()
	}()

	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (s *Server) broadcastLoop() {
	for ev := range s.wsEvents {
		s.wsMu.RLock()
		clients := make([]*websocket.Conn, 0, len(s.wsClients))
		for c := range s.wsClients {
			clients = append(clients, c)
		}
		s.wsMu.RUnlock()

		data, _ := json.Marshal(ev)
		for _, c := range clients {
			if err := c.WriteMessage(websocket.TextMessage, data); err != nil {
				s.wsMu.Lock()
				delete(s.wsClients, c)
				s.wsMu.Unlock()
				c.Close()
			}
		}
	}
}

func (s *Server) handleFrontend(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, "frontend/index.html")
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}
