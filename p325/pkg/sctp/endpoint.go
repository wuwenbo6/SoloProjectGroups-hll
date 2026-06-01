package sctp

import (
	"fmt"
	"sort"
	"time"
)

func NewEndpoint(id, name string, ips []string, peerIPs []string, config SimulatorConfig) *Endpoint {
	e := &Endpoint{
		id:                  id,
		name:                name,
		heartbeatInterval:   config.HeartbeatInterval,
		maxMissedHeartbeats: config.MaxMissedHeartbeats,
		heartbeatChan:       make(chan HeartbeatMsg, 100),
		heartbeatAckChan:    make(chan HeartbeatAck, 100),
		stopChan:            make(chan struct{}),
		dataChan:            make(chan DataMsg, 100),
		dataAckChan:         make(chan DataAck, 100),
		bufferQueue:         make([]DataMsg, 0),
		isPathVerified:      true,
		bufferEvents:        make([]BufferEvent, 0),
		receivedData:        make([]DataMsg, 0),
	}

	e.paths = make([]*Path, len(ips)*len(peerIPs))
	pathIdx := 0
	priority := 1
	for i, srcIP := range ips {
		for j, dstIP := range peerIPs {
			pathID := fmt.Sprintf("%s-%s", srcIP, dstIP)
			isPrimary := (i == 0 && j == 0)
			status := PathStatusStandby
			if isPrimary {
				status = PathStatusActive
				e.activePathID = pathID
			}
			e.paths[pathIdx] = &Path{
				ID:            pathID,
				SourceIP:      srcIP,
				DestIP:        dstIP,
				Status:        status,
				IsPrimary:     isPrimary,
				Priority:      priority,
				LastHeartbeat: time.Now(),
			}
			pathIdx++
			priority++
		}
	}

	return e
}

func (e *Endpoint) SetPeer(peer *Endpoint) {
	e.peer = peer
}

func (e *Endpoint) SetEventCallback(cb func(PathSwitchEvent)) {
	e.eventCallback = cb
}

func (e *Endpoint) SetBufferCallback(cb func(BufferEvent)) {
	e.bufferCallback = cb
}

func (e *Endpoint) addBufferEvent(eventType string, dataSeqNum uint64, pathID, message string) {
	e.bufferEventCount++
	event := BufferEvent{
		ID:         e.bufferEventCount,
		Timestamp:  time.Now(),
		Type:       eventType,
		DataSeqNum: dataSeqNum,
		PathID:     pathID,
		Message:    message,
	}
	e.bufferEvents = append(e.bufferEvents, event)
	if e.bufferCallback != nil {
		e.bufferCallback(event)
	}
}

func (e *Endpoint) Start() {
	e.mu.Lock()
	if e.isRunning {
		e.mu.Unlock()
		return
	}
	e.isRunning = true
	e.mu.Unlock()

	go e.heartbeatSender()
	go e.heartbeatReceiver()
	go e.pathMonitor()
	go e.dataSender()
	go e.dataReceiver()
}

func (e *Endpoint) Stop() {
	e.mu.Lock()
	if !e.isRunning {
		e.mu.Unlock()
		return
	}
	e.isRunning = false
	e.mu.Unlock()
	close(e.stopChan)
}

func (e *Endpoint) heartbeatSender() {
	ticker := time.NewTicker(e.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-e.stopChan:
			return
		case <-ticker.C:
			e.mu.RLock()
			if !e.isRunning {
				e.mu.RUnlock()
				return
			}
			activePath := e.getActivePathLocked()
			e.seqNum++
			seq := e.seqNum
			e.mu.RUnlock()

			if activePath != nil && activePath.Status == PathStatusActive {
				msg := HeartbeatMsg{
					FromEndpoint: e.id,
					FromIP:       activePath.SourceIP,
					ToIP:         activePath.DestIP,
					Timestamp:    time.Now(),
					SeqNum:       seq,
				}

				if e.peer != nil {
					select {
					case e.peer.heartbeatChan <- msg:
					default:
					}
				}
			}

			e.mu.RLock()
			for _, path := range e.paths {
				if path.Status != PathStatusActive && path.Status != PathStatusFailed {
					e.seqNum++
					seq := e.seqNum
					msg := HeartbeatMsg{
						FromEndpoint: e.id,
						FromIP:       path.SourceIP,
						ToIP:         path.DestIP,
						Timestamp:    time.Now(),
						SeqNum:       seq,
					}
					if e.peer != nil {
						select {
						case e.peer.heartbeatChan <- msg:
						default:
						}
					}
				}
			}
			e.mu.RUnlock()
		}
	}
}

func (e *Endpoint) heartbeatReceiver() {
	for {
		select {
		case <-e.stopChan:
			return
		case msg := <-e.heartbeatChan:
			e.mu.RLock()
			path := e.findPathLocked(msg.ToIP, msg.FromIP)
			e.mu.RUnlock()

			if path != nil {
				ack := HeartbeatAck{
					FromEndpoint: e.id,
					FromIP:       msg.ToIP,
					ToIP:         msg.FromIP,
					Timestamp:    time.Now(),
					SeqNum:       msg.SeqNum,
				}

				if e.peer != nil {
					select {
					case e.peer.heartbeatAckChan <- ack:
					default:
					}
				}
			}

		case ack := <-e.heartbeatAckChan:
			e.mu.Lock()
			path := e.findPathLocked(ack.ToIP, ack.FromIP)
			if path != nil {
				rtt := time.Since(ack.Timestamp)
				path.RTT = rtt.Milliseconds()
				path.LastHeartbeat = time.Now()
				path.HeartbeatMissed = 0
				if path.Status == PathStatusFailed {
					path.Status = PathStatusStandby
				}

				if path.ID == e.activePathID && !e.isPathVerified {
					e.isPathVerified = true
					e.addBufferEvent("path_verified", 0, path.ID,
						fmt.Sprintf("新路径 %s 已通过 HEARTBEAT-ACK 验证，准备发送缓存数据 (%d 条)",
							path.ID, len(e.bufferQueue)))

					if len(e.bufferQueue) > 0 {
						go e.flushBuffer()
					}
				}
			}
			e.mu.Unlock()
		}
	}
}

func (e *Endpoint) pathMonitor() {
	ticker := time.NewTicker(e.heartbeatInterval / 2)
	defer ticker.Stop()

	for {
		select {
		case <-e.stopChan:
			return
		case <-ticker.C:
			e.mu.Lock()
			if !e.isRunning {
				e.mu.Unlock()
				return
			}

			activePath := e.getActivePathLocked()
			needSwitch := false
			switchReason := ""

			if activePath != nil {
				timeSinceLastHeartbeat := time.Since(activePath.LastHeartbeat)
				expectedInterval := e.heartbeatInterval * time.Duration(e.maxMissedHeartbeats)

				if timeSinceLastHeartbeat > expectedInterval {
					activePath.HeartbeatMissed++
					if activePath.HeartbeatMissed >= e.maxMissedHeartbeats {
						activePath.Status = PathStatusFailed
						needSwitch = true
						switchReason = fmt.Sprintf("心跳超时: 错过 %d 次心跳, 最后心跳: %v 前",
							activePath.HeartbeatMissed, timeSinceLastHeartbeat.Round(time.Millisecond))
					}
				}
			}

			if needSwitch {
				e.switchToNextPathLocked(switchReason)
			}

			for _, path := range e.paths {
				if path != activePath && path.Status != PathStatusFailed {
					timeSinceLastHeartbeat := time.Since(path.LastHeartbeat)
					expectedInterval := e.heartbeatInterval * time.Duration(e.maxMissedHeartbeats*2)
					if timeSinceLastHeartbeat > expectedInterval {
						path.Status = PathStatusFailed
					}
				}
			}

			e.mu.Unlock()
		}
	}
}

func (e *Endpoint) switchToNextPathLocked(reason string) {
	switchStartTime := time.Now()
	oldPath := e.getActivePathLocked()

	availablePaths := make([]*Path, 0)
	for _, path := range e.paths {
		if path.ID != oldPath.ID && path.Status != PathStatusFailed {
			availablePaths = append(availablePaths, path)
		}
	}

	sort.Slice(availablePaths, func(i, j int) bool {
		return availablePaths[i].Priority < availablePaths[j].Priority
	})

	var newPath *Path
	if len(availablePaths) > 0 {
		newPath = availablePaths[0]
	}

	if newPath != nil {
		if oldPath != nil {
			oldPath.Status = PathStatusFailed
		}
		newPath.Status = PathStatusActive
		e.activePathID = newPath.ID
		e.switchCount++

		e.isPathVerified = false
		e.addBufferEvent("path_switch", 0, newPath.ID,
			fmt.Sprintf("路径切换: %s -> %s, 等待 HEARTBEAT-ACK 验证新路径", oldPath.ID, newPath.ID))

		switchTime := time.Since(switchStartTime).Milliseconds()

		event := PathSwitchEvent{
			ID:           e.switchCount,
			Timestamp:    time.Now(),
			FromPathID:   oldPath.ID,
			FromSourceIP: oldPath.SourceIP,
			FromDestIP:   oldPath.DestIP,
			ToPathID:     newPath.ID,
			ToSourceIP:   newPath.SourceIP,
			ToDestIP:     newPath.DestIP,
			Reason:       reason,
			SwitchTimeMs: switchTime,
		}

		e.switchHistory = append(e.switchHistory, event)

		if e.eventCallback != nil {
			e.eventCallback(event)
		}
	}
}

func (e *Endpoint) findPathLocked(srcIP, dstIP string) *Path {
	for _, path := range e.paths {
		if path.SourceIP == srcIP && path.DestIP == dstIP {
			return path
		}
	}
	return nil
}

func (e *Endpoint) getActivePathLocked() *Path {
	for _, path := range e.paths {
		if path.ID == e.activePathID {
			return path
		}
	}
	if len(e.paths) > 0 {
		return e.paths[0]
	}
	return nil
}

func (e *Endpoint) SendData(content string) {
	e.mu.Lock()
	e.dataSeqNum++
	seq := e.dataSeqNum
	activePath := e.getActivePathLocked()
	e.mu.Unlock()

	if activePath == nil {
		return
	}

	msg := DataMsg{
		FromEndpoint: e.id,
		FromIP:       activePath.SourceIP,
		ToIP:         activePath.DestIP,
		Timestamp:    time.Now(),
		SeqNum:       seq,
		Content:      content,
		IsBuffered:   false,
	}

	select {
	case e.dataChan <- msg:
	default:
		e.mu.Lock()
		msg.IsBuffered = true
		e.bufferQueue = append(e.bufferQueue, msg)
		e.addBufferEvent("buffer_overflow", seq, activePath.ID, "发送队列已满，数据进入缓存")
		e.mu.Unlock()
	}
}

func (e *Endpoint) dataSender() {
	for {
		select {
		case <-e.stopChan:
			return
		case msg := <-e.dataChan:
			e.mu.Lock()
			canSend := e.isPathVerified
			activePath := e.getActivePathLocked()

			if !canSend || activePath == nil {
				msg.IsBuffered = true
				e.bufferQueue = append(e.bufferQueue, msg)
				e.addBufferEvent("buffer", msg.SeqNum, e.activePathID,
					"路径未验证，数据进入缓存队列")
				e.mu.Unlock()
				continue
			}

			msg.FromIP = activePath.SourceIP
			msg.ToIP = activePath.DestIP
			msg.IsBuffered = false

			e.addBufferEvent("send", msg.SeqNum, activePath.ID,
				fmt.Sprintf("发送数据 #%d: %s", msg.SeqNum, truncateString(msg.Content, 30)))

			peer := e.peer
			e.mu.Unlock()

			if peer != nil {
				select {
				case peer.dataChan <- msg:
				default:
				}
			}
		}
	}
}

func (e *Endpoint) flushBuffer() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if len(e.bufferQueue) == 0 {
		return
	}

	activePath := e.getActivePathLocked()
	if activePath == nil {
		return
	}

	flushedCount := len(e.bufferQueue)

	for i, msg := range e.bufferQueue {
		msg.FromIP = activePath.SourceIP
		msg.ToIP = activePath.DestIP
		msg.IsBuffered = false

		e.addBufferEvent("flush", msg.SeqNum, activePath.ID,
			fmt.Sprintf("发送缓存数据 #%d (%d/%d): %s",
				msg.SeqNum, i+1, flushedCount, truncateString(msg.Content, 30)))

		if e.peer != nil {
			select {
			case e.peer.dataChan <- msg:
			default:
			}
		}
	}

	e.bufferQueue = make([]DataMsg, 0)
	e.addBufferEvent("flush_complete", 0, activePath.ID,
		fmt.Sprintf("缓存数据发送完成，共 %d 条", flushedCount))
}

func (e *Endpoint) dataReceiver() {
	for {
		select {
		case <-e.stopChan:
			return
		case msg := <-e.dataChan:
			e.mu.Lock()
			e.receivedData = append(e.receivedData, msg)

			if len(e.receivedData) > 100 {
				e.receivedData = e.receivedData[len(e.receivedData)-100:]
			}
			e.mu.Unlock()

			ack := DataAck{
				FromEndpoint: e.id,
				FromIP:       msg.ToIP,
				ToIP:         msg.FromIP,
				Timestamp:    time.Now(),
				SeqNum:       msg.SeqNum,
				Received:     true,
			}

			if e.peer != nil {
				select {
				case e.peer.dataAckChan <- ack:
				default:
				}
			}

		case ack := <-e.dataAckChan:
			e.mu.Lock()
			e.addBufferEvent("ack", ack.SeqNum, e.activePathID,
				fmt.Sprintf("收到数据 #%d 的 ACK 确认", ack.SeqNum))
			e.mu.Unlock()
		}
	}
}

func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func (e *Endpoint) SimulatePathFailure(srcIP, dstIP string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	path := e.findPathLocked(srcIP, dstIP)
	if path != nil {
		path.Status = PathStatusFailed
		if path.ID == e.activePathID {
			e.switchToNextPathLocked("模拟路径故障")
		}
	}
}

func (e *Endpoint) SimulatePathRecovery(srcIP, dstIP string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	path := e.findPathLocked(srcIP, dstIP)
	if path != nil {
		path.Status = PathStatusStandby
		path.HeartbeatMissed = 0
		path.LastHeartbeat = time.Now()
	}
}

func (e *Endpoint) GetStatus() EndpointStatus {
	e.mu.RLock()
	defer e.mu.RUnlock()

	pathsCopy := make([]*Path, len(e.paths))
	for i, p := range e.paths {
		pathsCopy[i] = &Path{
			ID:              p.ID,
			SourceIP:        p.SourceIP,
			DestIP:          p.DestIP,
			Status:          p.Status,
			RTT:             p.RTT,
			LastHeartbeat:   p.LastHeartbeat,
			HeartbeatMissed: p.HeartbeatMissed,
			IsPrimary:       p.IsPrimary,
			Priority:        p.Priority,
		}
	}

	historyCopy := make([]PathSwitchEvent, len(e.switchHistory))
	copy(historyCopy, e.switchHistory)

	bufferCopy := make([]DataMsg, len(e.bufferQueue))
	copy(bufferCopy, e.bufferQueue)

	bufferEventsCopy := make([]BufferEvent, len(e.bufferEvents))
	copy(bufferEventsCopy, e.bufferEvents)

	receivedCopy := make([]DataMsg, len(e.receivedData))
	copy(receivedCopy, e.receivedData)

	return EndpointStatus{
		ID:                  e.id,
		Name:                e.name,
		Paths:               pathsCopy,
		ActivePathID:        e.activePathID,
		SwitchHistory:       historyCopy,
		HeartbeatInterval:   e.heartbeatInterval,
		MaxMissedHeartbeats: e.maxMissedHeartbeats,
		IsRunning:           e.isRunning,
		BufferQueueSize:     len(e.bufferQueue),
		BufferQueue:         bufferCopy,
		IsPathVerified:      e.isPathVerified,
		BufferEvents:        bufferEventsCopy,
		ReceivedData:        receivedCopy,
	}
}

func (e *Endpoint) SetPrimaryPath(srcIP, dstIP string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	newPath := e.findPathLocked(srcIP, dstIP)
	if newPath == nil || newPath.Status == PathStatusFailed {
		return false
	}

	oldPath := e.getActivePathLocked()
	if oldPath != nil && oldPath.ID == newPath.ID {
		return true
	}

	if oldPath != nil {
		oldPath.Status = PathStatusStandby
		oldPath.IsPrimary = false
	}

	newPath.Status = PathStatusActive
	newPath.IsPrimary = true
	e.activePathID = newPath.ID
	e.isPathVerified = false
	e.switchCount++

	e.addBufferEvent("manual_switch", 0, newPath.ID,
		fmt.Sprintf("手动切换主路径: %s -> %s", oldPath.ID, newPath.ID))

	event := PathSwitchEvent{
		ID:           e.switchCount,
		Timestamp:    time.Now(),
		FromPathID:   oldPath.ID,
		FromSourceIP: oldPath.SourceIP,
		FromDestIP:   oldPath.DestIP,
		ToPathID:     newPath.ID,
		ToSourceIP:   newPath.SourceIP,
		ToDestIP:     newPath.DestIP,
		Reason:       "手动切换主路径",
		SwitchTimeMs: 0,
	}

	e.switchHistory = append(e.switchHistory, event)

	if e.eventCallback != nil {
		e.eventCallback(event)
	}

	return true
}

func (e *Endpoint) SetPathPriority(srcIP, dstIP string, priority int) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	path := e.findPathLocked(srcIP, dstIP)
	if path == nil {
		return false
	}

	path.Priority = priority
	return true
}

func (e *Endpoint) GetSwitchStats() SwitchStats {
	e.mu.RLock()
	defer e.mu.RUnlock()

	stats := SwitchStats{
		TotalSwitches:    len(e.switchHistory),
		FailuresByReason: make(map[string]int),
	}

	if len(e.switchHistory) == 0 {
		return stats
	}

	times := make([]int64, 0, len(e.switchHistory))
	var total int64 = 0
	minVal := int64(1<<63 - 1)
	maxVal := int64(0)

	for _, event := range e.switchHistory {
		times = append(times, event.SwitchTimeMs)
		total += event.SwitchTimeMs
		if event.SwitchTimeMs < minVal {
			minVal = event.SwitchTimeMs
		}
		if event.SwitchTimeMs > maxVal {
			maxVal = event.SwitchTimeMs
		}
		stats.FailuresByReason[event.Reason]++
	}

	stats.TotalDataMs = total
	stats.AvgSwitchTimeMs = float64(total) / float64(len(times))
	stats.MinSwitchTimeMs = minVal
	stats.MaxSwitchTimeMs = maxVal
	stats.LastSwitchTime = e.switchHistory[len(e.switchHistory)-1].Timestamp

	sort.Slice(times, func(i, j int) bool {
		return times[i] < times[j]
	})

	n := len(times)
	if n%2 == 0 {
		stats.MedianSwitchTimeMs = float64(times[n/2-1]+times[n/2]) / 2.0
	} else {
		stats.MedianSwitchTimeMs = float64(times[n/2])
	}

	p95Idx := int(float64(n) * 0.95)
	if p95Idx >= n {
		p95Idx = n - 1
	}
	stats.P95SwitchTimeMs = float64(times[p95Idx])

	p99Idx := int(float64(n) * 0.99)
	if p99Idx >= n {
		p99Idx = n - 1
	}
	stats.P99SwitchTimeMs = float64(times[p99Idx])

	return stats
}

func (e *Endpoint) GetID() string {
	return e.id
}
