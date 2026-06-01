package mtp2

import (
	"fmt"
	"math/rand"
	"sync"
	"time"
)

const (
	T1Timeout      = 2 * time.Second
	T3Timeout      = 1 * time.Second
	T1MaxRetries   = 5
	T3MaxRetries   = 3
	FSNModulo      = 128
)

type StateMachine struct {
	mu             sync.Mutex
	state          MTP2State
	msgFactory     *MessageFactory
	eventChan      chan<- *SimulatorEvent
	stopChan       chan struct{}
	lssuCount      int
	fisuCount      int
	msuCount       int
	stateDuration  time.Duration
	autoAdvance    bool
	simulateErrors bool

	expectedFSN    int
	syncStatus     SyncStatus
	lastValidBSN   int
	congested      bool

	t1Timer        *time.Timer
	t1Retries      int
	t1Active       bool

	t3Timer        *time.Timer
	t3Retries      int
	t3Active       bool

	totalSent         int
	lostFrames        int
	retransmitted     int
	t1Retransmissions int
	t3Retransmissions int
}

func NewStateMachine(eventChan chan<- *SimulatorEvent) *StateMachine {
	return &StateMachine{
		state:          StateIdle,
		msgFactory:     NewMessageFactory(),
		eventChan:      eventChan,
		stopChan:       make(chan struct{}),
		stateDuration:  5 * time.Second,
		autoAdvance:    true,
		simulateErrors: false,
		expectedFSN:    0,
		syncStatus:     SyncInSync,
		lastValidBSN:   0,
		congested:      false,
		t1Retries:      0,
		t1Active:       false,
		t3Retries:      0,
		t3Active:       false,
	}
}

func (sm *StateMachine) GetState() MTP2State {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.state
}

func (sm *StateMachine) GetStats() (int, int, int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.fisuCount, sm.lssuCount, sm.msuCount
}

func (sm *StateMachine) GetLinkStats() *LinkStats {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.computeLinkStatsLocked()
}

func (sm *StateMachine) computeLinkStatsLocked() *LinkStats {
	var frameLossRate float64
	var retransmitRate float64
	if sm.totalSent > 0 {
		frameLossRate = float64(sm.lostFrames) / float64(sm.totalSent) * 100
		retransmitRate = float64(sm.retransmitted) / float64(sm.totalSent) * 100
	}
	return &LinkStats{
		TotalSent:         sm.totalSent,
		LostFrames:        sm.lostFrames,
		Retransmitted:     sm.retransmitted,
		FrameLossRate:     frameLossRate,
		RetransmitRate:    retransmitRate,
		T1Retransmissions: sm.t1Retransmissions,
		T3Retransmissions: sm.t3Retransmissions,
	}
}

func (sm *StateMachine) GetSyncStatus() SyncStatus {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.syncStatus
}

func (sm *StateMachine) GetTimerInfo() (bool, int, bool, int) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.t1Active, sm.t1Retries, sm.t3Active, sm.t3Retries
}

func (sm *StateMachine) GetExpectedFSN() int {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.expectedFSN
}

func (sm *StateMachine) SetStateDuration(d time.Duration) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.stateDuration = d
}

func (sm *StateMachine) SetAutoAdvance(auto bool) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.autoAdvance = auto
}

func (sm *StateMachine) SetSimulateErrors(simulate bool) {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.simulateErrors = simulate
}

func (sm *StateMachine) Start() {
	go sm.run()
}

func (sm *StateMachine) Stop() {
	sm.stopTimers()
	close(sm.stopChan)
}

func (sm *StateMachine) Reset() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.stopTimersLocked()
	sm.state = StateIdle
	sm.msgFactory = NewMessageFactory()
	sm.lssuCount = 0
	sm.fisuCount = 0
	sm.msuCount = 0
	sm.expectedFSN = 0
	sm.syncStatus = SyncInSync
	sm.lastValidBSN = 0
	sm.congested = false
	sm.t1Retries = 0
	sm.t1Active = false
	sm.t3Retries = 0
	sm.t3Active = false
	sm.totalSent = 0
	sm.lostFrames = 0
	sm.retransmitted = 0
	sm.t1Retransmissions = 0
	sm.t3Retransmissions = 0
	sm.stopChan = make(chan struct{})
}

func (sm *StateMachine) sendEvent(event *SimulatorEvent) {
	if sm.eventChan != nil {
		select {
		case sm.eventChan <- event:
		default:
		}
	}
}

func (sm *StateMachine) changeState(newState MTP2State, reason string) {
	oldState := sm.state
	sm.state = newState

	if oldState != newState {
		sm.stopTimersLocked()
	}

	if newState == StateEstablish {
		sm.startT1Timer()
	}

	transition := &StateTransition{
		From:      oldState,
		To:        newState,
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
		Reason:    reason,
	}

	sm.sendEvent(&SimulatorEvent{
		Event:      "state_change",
		State:      newState,
		Transition: transition,
		SyncStatus: sm.syncStatus,
		Timestamp:  transition.Timestamp,
	})
}

func (sm *StateMachine) sendMessage(msg *SignalUnit) {
	sm.mu.Lock()
	switch msg.Type {
	case FISU:
		sm.fisuCount++
	case LSSU:
		sm.lssuCount++
	case MSU:
		sm.msuCount++
	}
	sm.totalSent++
	sm.mu.Unlock()

	sm.sendEvent(&SimulatorEvent{
		Event:      "message",
		Message:    msg,
		State:      sm.state,
		SyncStatus: sm.syncStatus,
		Timestamp:  msg.Timestamp,
	})
}

func (sm *StateMachine) validateFSN(msg *SignalUnit) *FSNValidationResult {
	if msg.Type == FISU {
		return &FSNValidationResult{
			Valid:       true,
			ExpectedFSN: sm.expectedFSN,
			ReceivedFSN: msg.FSN,
			Reason:      "FISU does not carry FSN increment",
		}
	}

	result := &FSNValidationResult{
		ExpectedFSN: sm.expectedFSN,
		ReceivedFSN: msg.FSN,
	}

	if msg.FSN == sm.expectedFSN {
		result.Valid = true
		result.Reason = "FSN matches expected value"
		sm.expectedFSN = (sm.expectedFSN + 1) % FSNModulo
		sm.lastValidBSN = msg.BSN
		sm.syncStatus = SyncInSync

		if sm.t3Active {
			sm.stopT3TimerLocked()
			sm.t3Retries = 0
		}
	} else {
		result.Valid = false
		result.Reason = fmt.Sprintf("FSN mismatch: expected %d, got %d", sm.expectedFSN, msg.FSN)
		sm.syncStatus = SyncOutSync
		sm.lostFrames++
		sm.handleOutOfSync(msg)
	}

	return result
}

func (sm *StateMachine) handleOutOfSync(msg *SignalUnit) {
	sm.sendEvent(&SimulatorEvent{
		Event:      "fsn_validation",
		State:      sm.state,
		SyncStatus: SyncOutSync,
		FSNResult: &FSNValidationResult{
			Valid:       false,
			ExpectedFSN: sm.expectedFSN,
			ReceivedFSN: msg.FSN,
			Reason:      fmt.Sprintf("FSN mismatch detected, sending SIB and starting T3 recovery"),
		},
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
	})

	sibMsg := sm.msgFactory.CreateLSSU(LSSUBusy)
	sm.sendEvent(&SimulatorEvent{
		Event:      "message",
		Message:    sibMsg,
		State:      sm.state,
		SyncStatus: SyncOutSync,
		Timestamp:  sibMsg.Timestamp,
	})

	sm.mu.Lock()
	sm.lssuCount++
	sm.totalSent++
	sm.retransmitted++
	sm.congested = true
	sm.mu.Unlock()

	sm.startT3Timer()
}

func (sm *StateMachine) stopTimers() {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	sm.stopTimersLocked()
}

func (sm *StateMachine) stopTimersLocked() {
	if sm.t1Timer != nil {
		sm.t1Timer.Stop()
		sm.t1Timer = nil
		sm.t1Active = false
	}
	if sm.t3Timer != nil {
		sm.t3Timer.Stop()
		sm.t3Timer = nil
		sm.t3Active = false
	}
}

func (sm *StateMachine) startT1Timer() {
	if sm.t1Timer != nil {
		sm.t1Timer.Stop()
	}
	sm.t1Active = true
	sm.t1Retries = 0

	sm.sendTimerEvent(TimerT1, "started", 0)

	sm.t1Timer = time.AfterFunc(T1Timeout, func() {
		sm.onT1Expired()
	})
}

func (sm *StateMachine) onT1Expired() {
	sm.mu.Lock()
	sm.t1Retries++
	retries := sm.t1Retries
	currentState := sm.state
	sm.t1Active = false
	sm.mu.Unlock()

	sm.sendTimerEvent(TimerT1, "expired", retries)

	if currentState != StateEstablish {
		return
	}

	if retries >= T1MaxRetries {
		sm.sendTimerEvent(TimerT1, "max_retries_exceeded", retries)
		sm.changeState(StateIdle, fmt.Sprintf("T1 max retries (%d) exceeded, no SIO acknowledgment", T1MaxRetries))
		return
	}

	sm.sendTimerEvent(TimerT1, "retransmit_sio", retries)

	sioMsg := sm.msgFactory.CreateLSSU(LSSUOutOfService)

	sm.mu.Lock()
	sm.retransmitted++
	sm.t1Retransmissions++
	sm.mu.Unlock()

	sm.sendMessage(sioMsg)

	sm.mu.Lock()
	sm.t1Active = true
	sm.t1Timer = time.AfterFunc(T1Timeout, func() {
		sm.onT1Expired()
	})
	sm.mu.Unlock()
}

func (sm *StateMachine) stopT1TimerLocked() {
	if sm.t1Timer != nil {
		sm.t1Timer.Stop()
		sm.t1Timer = nil
		sm.t1Active = false
		sm.t1Retries = 0
	}
}

func (sm *StateMachine) acknowledgeT1() {
	sm.mu.Lock()
	if sm.t1Active {
		sm.stopT1TimerLocked()
	}
	sm.mu.Unlock()

	sm.sendTimerEvent(TimerT1, "acknowledged", 0)
}

func (sm *StateMachine) startT3Timer() {
	sm.mu.Lock()
	if sm.t3Timer != nil {
		sm.t3Timer.Stop()
	}
	if !sm.t3Active {
		sm.t3Retries = 0
	}
	sm.t3Active = true
	sm.mu.Unlock()

	sm.sendTimerEvent(TimerT3, "started", sm.t3Retries)

	sm.mu.Lock()
	sm.t3Timer = time.AfterFunc(T3Timeout, func() {
		sm.onT3Expired()
	})
	sm.mu.Unlock()
}

func (sm *StateMachine) onT3Expired() {
	sm.mu.Lock()
	sm.t3Retries++
	retries := sm.t3Retries
	currentState := sm.state
	sm.t3Active = false
	sm.mu.Unlock()

	sm.sendTimerEvent(TimerT3, "expired", retries)

	if retries >= T3MaxRetries {
		sm.sendTimerEvent(TimerT3, "max_retries_exceeded", retries)
		sm.expectedFSN = 0
		sm.syncStatus = SyncInSync
		sm.changeState(StateIdle, fmt.Sprintf("T3 max retries (%d) exceeded, resynchronization failed", T3MaxRetries))
		return
	}

	sibMsg := sm.msgFactory.CreateLSSU(LSSUBusy)
	sm.sendEvent(&SimulatorEvent{
		Event:      "message",
		Message:    sibMsg,
		State:      currentState,
		SyncStatus: SyncOutSync,
		Timestamp:  sibMsg.Timestamp,
	})

	sm.mu.Lock()
	sm.lssuCount++
	sm.totalSent++
	sm.retransmitted++
	sm.t3Retransmissions++
	sm.t3Active = true
	sm.t3Timer = time.AfterFunc(T3Timeout, func() {
		sm.onT3Expired()
	})
	sm.mu.Unlock()

	sm.sendTimerEvent(TimerT3, "retry_sib", retries)
}

func (sm *StateMachine) stopT3TimerLocked() {
	if sm.t3Timer != nil {
		sm.t3Timer.Stop()
		sm.t3Timer = nil
		sm.t3Active = false
		sm.t3Retries = 0
	}
}

func (sm *StateMachine) sendTimerEvent(timer TimerType, action string, retries int) {
	maxRetries := T1MaxRetries
	if timer == TimerT3 {
		maxRetries = T3MaxRetries
	}
	sm.sendEvent(&SimulatorEvent{
		Event: "timer_event",
		Timer: &TimerEvent{
			Timer:      timer,
			Action:     action,
			Retries:    retries,
			MaxRetries: maxRetries,
			Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
		},
		State:      sm.state,
		SyncStatus: sm.syncStatus,
		Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
	})
}

func (sm *StateMachine) run() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	stateTimer := time.NewTimer(sm.stateDuration)
	defer stateTimer.Stop()

	for {
		select {
		case <-sm.stopChan:
			return
		case <-stateTimer.C:
			sm.mu.Lock()
			auto := sm.autoAdvance
			sm.mu.Unlock()

			if auto {
				sm.advanceState()
			}
			stateTimer.Reset(sm.getStateDuration())
		case <-ticker.C:
			sm.processCurrentState()
		}
	}
}

func (sm *StateMachine) getStateDuration() time.Duration {
	sm.mu.Lock()
	defer sm.mu.Unlock()
	return sm.stateDuration
}

func (sm *StateMachine) advanceState() {
	sm.mu.Lock()
	currentState := sm.state
	simulateErrors := sm.simulateErrors
	sm.mu.Unlock()

	switch currentState {
	case StateIdle:
		sm.changeState(StateEstablish, "Link initialization started")
	case StateEstablish:
		if simulateErrors && rand.Float32() < 0.3 {
			sm.changeState(StateRestore, "Alignment failed, entering recovery")
		} else {
			sm.changeState(StateTraffic, "Link alignment successful")
		}
	case StateTraffic:
		if simulateErrors && rand.Float32() < 0.2 {
			sm.changeState(StateRestore, "Link quality degradation detected")
		} else {
			sm.changeState(StateIdle, "Manual reset")
		}
	case StateRestore:
		if rand.Float32() < 0.7 {
			sm.changeState(StateTraffic, "Link recovered successfully")
		} else {
			sm.changeState(StateIdle, "Recovery failed, returning to idle")
		}
	}
}

func (sm *StateMachine) processCurrentState() {
	sm.mu.Lock()
	currentState := sm.state
	simulateErrors := sm.simulateErrors
	isOutOfSync := sm.syncStatus == SyncOutSync
	sm.mu.Unlock()

	switch currentState {
	case StateIdle:
		sm.processIdle()
	case StateEstablish:
		sm.processEstablish()
	case StateTraffic:
		sm.processTraffic(simulateErrors, isOutOfSync)
	case StateRestore:
		sm.processRestore()
	}
}

func (sm *StateMachine) processIdle() {
	if rand.Float32() < 0.3 {
		msg := sm.msgFactory.CreateFISU()
		sm.sendMessage(msg)
	}
}

func (sm *StateMachine) processEstablish() {
	r := rand.Float32()
	if r < 0.4 {
		msg := sm.msgFactory.CreateFISU()
		sm.sendMessage(msg)
	} else if r < 0.7 {
		status := LSSUOutOfService
		if sm.lssuCount >= 2 {
			status = LSSUInService
		}
		msg := sm.msgFactory.CreateLSSU(status)

		sm.mu.Lock()
		fsnResult := sm.validateFSN(msg)
		sm.mu.Unlock()

		sm.sendMessage(msg)

		if status == LSSUInService {
			sm.acknowledgeT1()
		}

		sm.sendEvent(&SimulatorEvent{
			Event:      "fsn_validation",
			State:      sm.state,
			SyncStatus: sm.syncStatus,
			FSNResult:  fsnResult,
			Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
		})
	} else {
		msg := sm.msgFactory.CreateLSSU(LSSUNormal)

		sm.mu.Lock()
		fsnResult := sm.validateFSN(msg)
		sm.mu.Unlock()

		sm.sendMessage(msg)

		sm.sendEvent(&SimulatorEvent{
			Event:      "fsn_validation",
			State:      sm.state,
			SyncStatus: sm.syncStatus,
			FSNResult:  fsnResult,
			Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
		})
	}
}

func (sm *StateMachine) processTraffic(simulateErrors bool, isOutOfSync bool) {
	if isOutOfSync {
		r := rand.Float32()
		if r < 0.4 {
			sibMsg := sm.msgFactory.CreateLSSU(LSSUBusy)

			sm.mu.Lock()
			sm.retransmitted++
			sm.t3Retransmissions++
			sm.mu.Unlock()

			sm.sendMessage(sibMsg)
		} else {
			syncMsg := sm.msgFactory.CreateLSSU(LSSUNormal)
			sm.mu.Lock()
			sm.expectedFSN = sm.msgFactory.fsn
			sm.syncStatus = SyncInSync
			sm.congested = false
			if sm.t3Active {
				sm.stopT3TimerLocked()
				sm.t3Retries = 0
			}
			sm.mu.Unlock()
			sm.sendMessage(syncMsg)

			sm.sendEvent(&SimulatorEvent{
				Event:      "sync_recovered",
				State:      sm.state,
				SyncStatus: SyncInSync,
				Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
			})
		}
		return
	}

	r := rand.Float32()
	if r < 0.2 {
		msg := sm.msgFactory.CreateFISU()
		sm.sendMessage(msg)
	} else if r < 0.3 {
		msg := sm.msgFactory.CreateLSSU(LSSUNormal)
		sm.sendMessage(msg)
	} else {
		siTypes := []string{"SCCP", "ISUP", "TUP", "MTP-TEST"}
		si := siTypes[rand.Intn(len(siTypes))]
		msg := sm.msgFactory.CreateMSU(si, nil)

		sm.mu.Lock()
		if simulateErrors && rand.Float32() < 0.15 {
			sm.expectedFSN = (sm.expectedFSN + rand.Intn(10) + 2) % FSNModulo
		}
		fsnResult := sm.validateFSN(msg)
		sm.mu.Unlock()

		sm.sendMessage(msg)

		sm.sendEvent(&SimulatorEvent{
			Event:      "fsn_validation",
			State:      sm.state,
			SyncStatus: sm.syncStatus,
			FSNResult:  fsnResult,
			Timestamp:  time.Now().UnixNano() / int64(time.Millisecond),
		})

		if simulateErrors && rand.Float32() < 0.1 {
			errorMsg := sm.msgFactory.CreateLSSU(LSSUEmergency)
			sm.sendMessage(errorMsg)
		}
	}
}

func (sm *StateMachine) processRestore() {
	r := rand.Float32()
	if r < 0.5 {
		msg := sm.msgFactory.CreateFISU()
		sm.sendMessage(msg)
	} else if r < 0.8 {
		msg := sm.msgFactory.CreateLSSU(LSSUOutOfService)
		sm.sendMessage(msg)
	} else {
		msg := sm.msgFactory.CreateLSSU(LSSUInService)

		sm.mu.Lock()
		sm.expectedFSN = sm.msgFactory.fsn
		sm.syncStatus = SyncInSync
		sm.congested = false
		sm.mu.Unlock()

		sm.sendMessage(msg)
	}
}

func (sm *StateMachine) ManualStateChange(newState MTP2State) error {
	sm.mu.Lock()
	currentState := sm.state
	sm.mu.Unlock()

	validTransitions := map[MTP2State][]MTP2State{
		StateIdle:      {StateEstablish},
		StateEstablish: {StateIdle, StateTraffic, StateRestore},
		StateTraffic:   {StateIdle, StateRestore},
		StateRestore:   {StateIdle, StateTraffic},
	}

	valid := false
	for _, allowed := range validTransitions[currentState] {
		if allowed == newState {
			valid = true
			break
		}
	}

	if !valid {
		return fmt.Errorf("invalid transition from %s to %s", currentState, newState)
	}

	sm.changeState(newState, fmt.Sprintf("Manual transition from %s", currentState))
	return nil
}

func (sm *StateMachine) GetMessageFactory() *MessageFactory {
	return sm.msgFactory
}
