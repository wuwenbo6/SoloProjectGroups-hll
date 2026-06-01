package pfc

import (
	"fmt"
	"sync"
	"time"
)

const (
	MaxPriority         = 8
	DefaultQueueCap     = 100
	PauseThreshold      = 70
	ResumeThreshold     = 30
	DefaultTickMs       = 100
	QuantaTime          = 512
	PauseQuanta         = 1000
	QuantaPerMs         = 1000
	DeadlockPauseCount  = 3
	DeadlockWindowTicks = 50
	StormPriorityCount  = 4
)

type PauseFrame struct {
	Priority   int       `json:"priority"`
	PauseTime  uint16    `json:"pause_time"`
	SenderID   string    `json:"sender_id"`
	ReceiverID string    `json:"receiver_id"`
	Timestamp  time.Time `json:"timestamp"`
}

type DeadlockAlert struct {
	Type       string    `json:"type"`
	Severity   string    `json:"severity"`
	Message    string    `json:"message"`
	ReceiverID string    `json:"receiver_id"`
	Priority   int       `json:"priority"`
	Tick       int64     `json:"tick"`
	Timestamp  time.Time `json:"timestamp"`
}

type QueueStats struct {
	Length      int  `json:"length"`
	Capacity    int  `json:"capacity"`
	IsPaused    bool `json:"is_paused"`
	PauseCount  int  `json:"pause_count"`
	ResumeCount int  `json:"resume_count"`
	Dropped     int  `json:"dropped"`
}

type Receiver struct {
	mu           sync.Mutex
	ID           string
	Queues       [MaxPriority]*PriorityQueue
	PauseFrameCh chan PauseFrame
}

type PriorityQueue struct {
	Priority    int
	packets     int
	capacity    int
	isPaused    bool
	pauseCount  int
	resumeCount int
	dropped     int
	pauseUntil  time.Time
}

func NewPriorityQueue(priority, capacity int) *PriorityQueue {
	return &PriorityQueue{
		Priority: priority,
		capacity: capacity,
	}
}

func (q *PriorityQueue) Enqueue(count int) int {
	q.packets += count
	overflow := 0
	if q.packets > q.capacity {
		overflow = q.packets - q.capacity
		q.dropped += overflow
		q.packets = q.capacity
	}
	return overflow
}

func (q *PriorityQueue) Dequeue(count int) int {
	if q.isPaused {
		return 0
	}
	actual := count
	if q.packets < actual {
		actual = q.packets
	}
	q.packets -= actual
	return actual
}

func (q *PriorityQueue) Stats() QueueStats {
	return QueueStats{
		Length:      q.packets,
		Capacity:    q.capacity,
		IsPaused:    q.isPaused,
		PauseCount:  q.pauseCount,
		ResumeCount: q.resumeCount,
		Dropped:     q.dropped,
	}
}

func NewReceiver(id string, queueCap int) *Receiver {
	r := &Receiver{
		ID:           id,
		PauseFrameCh: make(chan PauseFrame, 64),
	}
	for i := 0; i < MaxPriority; i++ {
		r.Queues[i] = NewPriorityQueue(i, queueCap)
	}
	return r
}

func (r *Receiver) CheckAndPause() []PauseFrame {
	r.mu.Lock()
	defer r.mu.Unlock()

	var frames []PauseFrame
	for i := 0; i < MaxPriority; i++ {
		q := r.Queues[i]
		if q.packets >= PauseThreshold && !q.isPaused {
			q.isPaused = true
			q.pauseCount++
			q.pauseUntil = time.Now().Add(quantaToDuration(PauseQuanta))
			frames = append(frames, PauseFrame{
				Priority:   i,
				PauseTime:  PauseQuanta,
				SenderID:   "sender-0",
				ReceiverID: r.ID,
				Timestamp:  time.Now(),
			})
		}
	}
	return frames
}

func (r *Receiver) CheckAndResume() {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	for i := 0; i < MaxPriority; i++ {
		q := r.Queues[i]
		if q.isPaused && q.packets <= ResumeThreshold && now.After(q.pauseUntil) {
			q.isPaused = false
			q.resumeCount++
		}
	}
}

func (r *Receiver) Stats() map[string]QueueStats {
	r.mu.Lock()
	defer r.mu.Unlock()

	stats := make(map[string]QueueStats)
	for i := 0; i < MaxPriority; i++ {
		stats[queueKey(i)] = r.Queues[i].Stats()
	}
	return stats
}

func queueKey(priority int) string {
	return "p" + string(rune('0'+priority))
}

type Sender struct {
	mu     sync.Mutex
	ID     string
	paused [MaxPriority]bool
}

func NewSender(id string) *Sender {
	return &Sender{ID: id}
}

func (s *Sender) ApplyPauseFrame(frame PauseFrame) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if frame.Priority >= 0 && frame.Priority < MaxPriority {
		s.paused[frame.Priority] = true
		quanta := frame.PauseTime
		duration := quantaToDuration(int(quanta))
		time.AfterFunc(duration, func() {
			s.mu.Lock()
			defer s.mu.Unlock()
			s.paused[frame.Priority] = false
		})
	}
}

func (s *Sender) IsPaused(priority int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if priority >= 0 && priority < MaxPriority {
		return s.paused[priority]
	}
	return false
}

type Snapshot struct {
	Tick       int64                            `json:"tick"`
	Timestamp  time.Time                        `json:"timestamp"`
	Receivers  map[string]map[string]QueueStats `json:"receivers"`
	Sender     map[string]bool                  `json:"sender_paused"`
	PauseCount map[string]int                   `json:"pause_count"`
	Alerts     []DeadlockAlert                  `json:"alerts"`
}

type Simulator struct {
	mu           sync.Mutex
	Tick         int64
	TickMs       int
	Receivers    []*Receiver
	Senders      []*Sender
	SnapshotCh   chan Snapshot
	stopCh       chan struct{}
	pauseCh      chan bool
	paused       bool
	History      []Snapshot
	MaxHistory   int
	pauseHistory map[string][]int64
	LastAlerts   []DeadlockAlert
}

func NewSimulator(numReceivers, queueCap, tickMs int) *Simulator {
	sim := &Simulator{
		TickMs:       tickMs,
		SnapshotCh:   make(chan Snapshot, 128),
		stopCh:       make(chan struct{}),
		pauseCh:      make(chan bool, 8),
		MaxHistory:   300,
		pauseHistory: make(map[string][]int64),
	}
	for i := 0; i < numReceivers; i++ {
		sim.Receivers = append(sim.Receivers, NewReceiver("receiver-"+string(rune('0'+i)), queueCap))
		for p := 0; p < MaxPriority; p++ {
			key := "receiver-" + string(rune('0'+i)) + "-p" + string(rune('0'+p))
			sim.pauseHistory[key] = make([]int64, 0)
		}
	}
	for i := 0; i < 1; i++ {
		sim.Senders = append(sim.Senders, NewSender("sender-"+string(rune('0'+i))))
	}
	return sim
}

func (sim *Simulator) Start() {
	ticker := time.NewTicker(time.Duration(sim.TickMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-sim.stopCh:
			return
		case p := <-sim.pauseCh:
			sim.mu.Lock()
			sim.paused = p
			sim.mu.Unlock()
		case <-ticker.C:
			sim.mu.Lock()
			if sim.paused {
				sim.mu.Unlock()
				continue
			}
			sim.mu.Unlock()
			sim.tick()
		}
	}
}

func (sim *Simulator) Stop() {
	close(sim.stopCh)
}

func (sim *Simulator) SetPaused(p bool) {
	sim.pauseCh <- p
}

func (sim *Simulator) IsPaused() bool {
	sim.mu.Lock()
	defer sim.mu.Unlock()
	return sim.paused
}

func (sim *Simulator) tick() {
	sim.mu.Lock()
	defer sim.mu.Unlock()

	sim.Tick++

	for _, r := range sim.Receivers {
		for i := 0; i < MaxPriority; i++ {
			q := r.Queues[i]
			arrival := arrivalRate(i, sim.Tick)
			q.Enqueue(arrival)
			if !q.isPaused {
				q.Dequeue(departureRate(i, sim.Tick))
			}
		}
	}

	sim.LastAlerts = sim.LastAlerts[:0]

	for _, r := range sim.Receivers {
		frames := r.CheckAndPause()
		for _, f := range frames {
			key := f.ReceiverID + "-p" + string(rune('0'+f.Priority))
			sim.pauseHistory[key] = append(sim.pauseHistory[key], sim.Tick)
			if len(sim.pauseHistory[key]) > DeadlockWindowTicks {
				sim.pauseHistory[key] = sim.pauseHistory[key][len(sim.pauseHistory[key])-DeadlockWindowTicks:]
			}
			for _, s := range sim.Senders {
				s.ApplyPauseFrame(f)
			}
		}
		r.CheckAndResume()
	}

	sim.detectDeadlock()

	snap := sim.buildSnapshot()
	sim.History = append(sim.History, snap)
	if len(sim.History) > sim.MaxHistory {
		sim.History = sim.History[len(sim.History)-sim.MaxHistory:]
	}

	select {
	case sim.SnapshotCh <- snap:
	default:
	}
}

func (sim *Simulator) detectDeadlock() {
	windowStart := sim.Tick - DeadlockWindowTicks

	for _, r := range sim.Receivers {
		pausedCount := 0
		for p := 0; p < MaxPriority; p++ {
			key := r.ID + "-p" + string(rune('0'+p))
			history := sim.pauseHistory[key]
			recentPauses := 0
			for _, t := range history {
				if t >= windowStart {
					recentPauses++
				}
			}
			if r.Queues[p].isPaused {
				pausedCount++
			}
			if recentPauses >= DeadlockPauseCount {
				sim.LastAlerts = append(sim.LastAlerts, DeadlockAlert{
					Type:       "frequent_pause",
					Severity:   "warning",
					Message:    fmt.Sprintf("频繁暂停: %s P%d 在 %d tick 内暂停 %d 次", r.ID, p, DeadlockWindowTicks, recentPauses),
					ReceiverID: r.ID,
					Priority:   p,
					Tick:       sim.Tick,
					Timestamp:  time.Now(),
				})
			}
		}
		if pausedCount >= StormPriorityCount {
			sim.LastAlerts = append(sim.LastAlerts, DeadlockAlert{
				Type:       "pfc_storm",
				Severity:   "critical",
				Message:    fmt.Sprintf("PFC风暴/死锁风险: %s 有 %d 个优先级同时暂停", r.ID, pausedCount),
				ReceiverID: r.ID,
				Priority:   -1,
				Tick:       sim.Tick,
				Timestamp:  time.Now(),
			})
		}
	}
}

func (sim *Simulator) buildSnapshot() Snapshot {
	receivers := make(map[string]map[string]QueueStats)
	pauseCount := make(map[string]int)
	for _, r := range sim.Receivers {
		stats := r.Stats()
		receivers[r.ID] = stats
		totalPauses := 0
		for i := 0; i < MaxPriority; i++ {
			totalPauses += stats[queueKey(i)].PauseCount
		}
		pauseCount[r.ID] = totalPauses
	}

	senderPaused := make(map[string]bool)
	for _, s := range sim.Senders {
		for i := 0; i < MaxPriority; i++ {
			senderPaused[queueKey(i)] = s.IsPaused(i)
		}
	}

	return Snapshot{
		Tick:       sim.Tick,
		Timestamp:  time.Now(),
		Receivers:  receivers,
		Sender:     senderPaused,
		PauseCount: pauseCount,
		Alerts:     append([]DeadlockAlert{}, sim.LastAlerts...),
	}
}

func arrivalRate(priority int, tick int64) int {
	base := []int{12, 10, 9, 8, 7, 6, 5, 4}
	if priority < 0 || priority >= MaxPriority {
		return 0
	}
	rate := base[priority]
	if tick%7 == 0 {
		rate += 3
	}
	if tick%13 == 0 {
		rate += 5
	}
	if tick%23 == 0 {
		rate += 8
	}
	return rate
}

func departureRate(priority int, tick int64) int {
	base := []int{8, 7, 6, 6, 5, 5, 4, 3}
	if priority < 0 || priority >= MaxPriority {
		return 0
	}
	return base[priority]
}

func quantaToDuration(quanta int) time.Duration {
	ms := float64(quanta) / float64(QuantaPerMs)
	return time.Duration(ms * float64(time.Millisecond))
}

type StatsExport struct {
	CurrentTick int64           `json:"current_tick"`
	Timestamp   time.Time       `json:"timestamp"`
	Receivers   []ReceiverStats `json:"receivers"`
	Sender      []SenderStats   `json:"senders"`
	Alerts      []DeadlockAlert `json:"active_alerts"`
}

type ReceiverStats struct {
	ID         string                `json:"id"`
	Queues     map[string]QueueStats `json:"queues"`
	TotalPause int                   `json:"total_pauses"`
}

type SenderStats struct {
	ID     string          `json:"id"`
	Paused map[string]bool `json:"paused_by_priority"`
}

func (sim *Simulator) ExportStats() StatsExport {
	sim.mu.Lock()
	defer sim.mu.Unlock()

	var receivers []ReceiverStats
	for _, r := range sim.Receivers {
		stats := r.Stats()
		totalPauses := 0
		for p := 0; p < MaxPriority; p++ {
			totalPauses += stats[queueKey(p)].PauseCount
		}
		receivers = append(receivers, ReceiverStats{
			ID:         r.ID,
			Queues:     stats,
			TotalPause: totalPauses,
		})
	}

	var senders []SenderStats
	for _, s := range sim.Senders {
		paused := make(map[string]bool)
		for p := 0; p < MaxPriority; p++ {
			paused[queueKey(p)] = s.IsPaused(p)
		}
		senders = append(senders, SenderStats{
			ID:     s.ID,
			Paused: paused,
		})
	}

	return StatsExport{
		CurrentTick: sim.Tick,
		Timestamp:   time.Now(),
		Receivers:   receivers,
		Sender:      senders,
		Alerts:      append([]DeadlockAlert{}, sim.LastAlerts...),
	}
}
