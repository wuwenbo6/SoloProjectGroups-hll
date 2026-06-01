package simulator

import (
	"encoding/binary"
	"fmt"
	"iec104-simulator/protocol"
	"iec104-simulator/session"
	"log"
	"math"
	"math/rand"
	"strings"
	"sync"
	"time"
)

type EventType string

const (
	EventTypeSOE     EventType = "SOE"
	EventTypeGI      EventType = "GI"
	EventTypeMeasure EventType = "Measure"
	EventTypeCommand EventType = "Command"
	EventTypeSystem  EventType = "System"
	EventTypeFile    EventType = "File"
)

type Event struct {
	ID        int64     `json:"id"`
	Timestamp string    `json:"timestamp"`
	CP56Time  string    `json:"cp56Time"`
	EventType EventType `json:"eventType"`
	TypeID    byte      `json:"typeId"`
	TypeName  string    `json:"typeName"`
	IOA       uint32    `json:"ioa"`
	Value     string    `json:"value"`
	Cause     string    `json:"cause"`
	Quality   string    `json:"quality"`
	RawHex    string    `json:"rawHex"`
}

type DataPoint struct {
	IOA      uint32
	Value    bool
	Qu0      bool
	Qu1      bool
	Qu2      bool
	Qu3      bool
	Blk      bool
	Sb       bool
	NT       bool
	LastTime protocol.CP56Time2a
}

type MeasurePoint struct {
	IOA   uint32
	Value float32
	OV    bool
	Blk   bool
	Sb    bool
	NT    bool
}

type SimFile struct {
	Name     string
	ID       uint16
	Size     uint32
	Content  []byte
	Sections [][]byte
	ModTime  protocol.CP56Time2a
}

type Simulator struct {
	mu            sync.RWMutex
	sess          *session.Session
	commonAddr    uint16
	digitalPoints []*DataPoint
	measurePoints []*MeasurePoint
	files         map[string]*SimFile
	events        []Event
	eventIDSeq    int64
	running       bool
	burstActive   bool
	burstStop     chan struct{}
	eventSubs     []chan Event
	subMu         sync.Mutex
}

func NewSimulator(commonAddr uint16) *Simulator {
	sim := &Simulator{
		commonAddr: commonAddr,
		burstStop:  make(chan struct{}),
		files:      make(map[string]*SimFile),
	}

	for i := uint32(1); i <= 100; i++ {
		sim.digitalPoints = append(sim.digitalPoints, &DataPoint{
			IOA:      i,
			Value:    rand.Intn(2) == 1,
			LastTime: protocol.NowCP56Time2a(),
		})
	}

	for i := uint32(101); i <= 130; i++ {
		sim.measurePoints = append(sim.measurePoints, &MeasurePoint{
			IOA:   i,
			Value: rand.Float32() * 100.0,
		})
	}

	sim.addSampleFile("events.log", generateSampleLog())
	sim.addSampleFile("config.ini", generateSampleConfig())
	sim.addSampleFile("report.txt", generateSampleReport())

	return sim
}

func (sim *Simulator) addSampleFile(name string, content []byte) {
	if !protocol.ValidateFilename(name) {
		return
	}
	sectionSize := 200
	var sections [][]byte
	for i := 0; i < len(content); i += sectionSize {
		end := i + sectionSize
		if end > len(content) {
			end = len(content)
		}
		sections = append(sections, content[i:end])
	}

	fileID := uint16(len(sim.files) + 1)
	sim.files[name] = &SimFile{
		Name:     name,
		ID:       fileID,
		Size:     uint32(len(content)),
		Content:  content,
		Sections: sections,
		ModTime:  protocol.NowCP56Time2a(),
	}
}

func generateSampleLog() []byte {
	var log strings.Builder
	log.WriteString("IEC 104 System Event Log\n")
	log.WriteString("========================\n\n")
	for i := 0; i < 50; i++ {
		t := time.Now().Add(-time.Duration(50-i) * time.Minute)
		fmt.Fprintf(&log, "%s Point-%03d StateChanged %d\n",
			t.Format("2006-01-02 15:04:05"),
			rand.Intn(100)+1,
			rand.Intn(2))
	}
	return []byte(log.String())
}

func generateSampleConfig() []byte {
	config := `[General]
StationName = Substation-A
Protocol = IEC 60870-5-104
Port = 2404

[Timers]
T1 = 15
T2 = 10
T3 = 20
k = 12
w = 8

[Points]
DigitalStart = 1
DigitalCount = 100
AnalogStart = 101
AnalogCount = 30

[Logging]
Level = INFO
EnableEventLog = true
EnableSOE = true
FileTransfer = true
`
	return []byte(config)
}

func generateSampleReport() []byte {
	report := `IEC 104 Communication Report
=============================
Generated: ` + time.Now().Format("2006-01-02 15:04:05") + `

Session Statistics:
  Total Packets Sent: 12847
  Total Packets Received: 9652
  CRC Errors: 0
  Timeouts: 2

Data Points:
  Digital Points: 100
  Analog Points: 30
  SOE Events: 3421

File Transfer:
  Files Available: 3
  Total Size: 24.5 KB

Status:
  Connection: Active
  Last Activity: ` + time.Now().Format("2006-01-02 15:04:05") + `
  State: Normal
`
	return []byte(report)
}

func (sim *Simulator) SetSession(sess *session.Session) {
	sim.mu.Lock()
	defer sim.mu.Unlock()
	sim.sess = sess
}

func (sim *Simulator) OnFrameReceived(sess *session.Session, apci *protocol.APCI, asdu *protocol.ASDU) {
	log.Printf("[Simulator] Received: Type=%s Cause=%s IOA_count=%d",
		asdu.TypeName(), asdu.CauseName(), len(asdu.InformationObjects))

	switch asdu.TypeID {
	case protocol.ASDU_C_IC_NA_1:
		if asdu.CauseTrans == protocol.CauseActivation {
			sim.handleGeneralInterrogation(asdu)
		}
	case protocol.ASDU_C_CI_NA_1:
		if asdu.CauseTrans == protocol.CauseActivation {
			sim.handleCounterInterrogation(asdu)
		}
	case protocol.ASDU_C_CS_NA_1:
		sim.handleClockSync(asdu)
	case protocol.ASDU_F_SC_NA_1:
		sim.handleFileCall(asdu)
	case protocol.ASDU_F_AF_NA_1:
		sim.handleFileAck(asdu)
	case protocol.ASDU_F_SG_NA_1:
		sim.handleFileSegment(asdu)
	default:
		sim.addSystemEvent(fmt.Sprintf("Received unknown ASDU type 0x%02X", asdu.TypeID))
	}
}

func (sim *Simulator) OnSessionStateChanged(sess *session.Session, oldState, newState session.SessionState) {
	stateName := func(st session.SessionState) string {
		switch st {
		case session.StateConnecting:
			return "Connecting"
		case session.StateConnected:
			return "Connected"
		case session.StateStartDTSent:
			return "StartDT_Sent"
		case session.StateStartDTCon:
			return "StartDT_Con"
		case session.StateActive:
			return "Active"
		case session.StateStopped:
			return "Stopped"
		default:
			return "Unknown"
		}
	}
	sim.addSystemEvent(fmt.Sprintf("State: %s -> %s", stateName(oldState), stateName(newState)))
	sim.mu.Lock()
	sim.sess = sess
	sim.mu.Unlock()
}

func (sim *Simulator) handleGeneralInterrogation(asdu *protocol.ASDU) {
	log.Printf("[Simulator] General Interrogation received, QOI=%d", asdu.InformationObjects[0].Elements[0])
	sim.addEvent(Event{
		EventType: EventTypeCommand,
		TypeID:    asdu.TypeID,
		TypeName:  asdu.TypeName(),
		IOA:       asdu.InformationObjects[0].IOA,
		Value:     fmt.Sprintf("QOI=%d", asdu.InformationObjects[0].Elements[0]),
		Cause:     asdu.CauseName(),
	})

	sim.mu.RLock()
	sess := sim.sess
	sim.mu.RUnlock()

	if sess == nil {
		return
	}

	go func() {
		time.Sleep(50 * time.Millisecond)

		sim.mu.RLock()
		points := make([]*DataPoint, len(sim.digitalPoints))
		copy(points, sim.digitalPoints)
		sim.mu.RUnlock()

		for i := 0; i < len(points); i += 40 {
			end := i + 40
			if end > len(points) {
				end = len(points)
			}
			batch := points[i:end]

			elements := make([][]byte, 0, len(batch))
			for _, dp := range batch {
				siq := byte(0)
				if dp.Value {
					siq |= 0x01
				}
				if dp.Blk {
					siq |= 0x10
				}
				if dp.Sb {
					siq |= 0x20
				}
				if dp.NT {
					siq |= 0x40
				}
				elements = append(elements, []byte{siq})
			}
			asduData := protocol.BuildMSPNA1SQ(sim.commonAddr, protocol.CauseInterrogated, batch[0].IOA, elements)
			sess.SendIFrame(asduData)

			for _, dp := range batch {
				sim.addEvent(Event{
					EventType: EventTypeGI,
					TypeID:    protocol.ASDU_M_SP_NA_1,
					TypeName:  "M_SP_NA_1",
					IOA:       dp.IOA,
					Value:     fmt.Sprintf("%v", dp.Value),
					Cause:     "Interrogated",
					Quality:   sim.qualityStr(dp.Blk, dp.Sb, dp.NT),
				})
			}
			time.Sleep(20 * time.Millisecond)
		}

		sim.mu.RLock()
		measures := make([]*MeasurePoint, len(sim.measurePoints))
		copy(measures, sim.measurePoints)
		sim.mu.RUnlock()

		for i := 0; i < len(measures); i += 20 {
			end := i + 20
			if end > len(measures) {
				end = len(measures)
			}
			batch := measures[i:end]

			objects := make([]protocol.InformationObject, 0, len(batch))
			for _, mp := range batch {
				buf := make([]byte, 5)
				binary.LittleEndian.PutUint32(buf[0:4], math.Float32bits(mp.Value))
				var qd byte
				if mp.OV {
					qd |= 0x01
				}
				if mp.Blk {
					qd |= 0x10
				}
				if mp.Sb {
					qd |= 0x20
				}
				if mp.NT {
					qd |= 0x40
				}
				buf[4] = qd
				objects = append(objects, protocol.InformationObject{
					IOA:      mp.IOA,
					Elements: buf,
				})
			}
			asduData := protocol.BuildMENCTF1(sim.commonAddr, protocol.CauseInterrogated, objects)
			sess.SendIFrame(asduData)

			for _, mp := range batch {
				sim.addEvent(Event{
					EventType: EventTypeMeasure,
					TypeID:    protocol.ASDU_M_ME_TF_1,
					TypeName:  "M_ME_TF_1",
					IOA:       mp.IOA,
					Value:     fmt.Sprintf("%.2f", mp.Value),
					Cause:     "Interrogated",
				})
			}
			time.Sleep(20 * time.Millisecond)
		}

		sim.addSystemEvent("General Interrogation completed")
	}()
}

func (sim *Simulator) handleCounterInterrogation(asdu *protocol.ASDU) {
	log.Printf("[Simulator] Counter Interrogation received")
	sim.addSystemEvent("Counter Interrogation received (not implemented)")
}

func (sim *Simulator) handleClockSync(asdu *protocol.ASDU) {
	log.Printf("[Simulator] Clock Sync received")
	sim.addSystemEvent("Clock Synchronization received")
}

func (sim *Simulator) StartSOEBurst(count int, intervalMs int) {
	sim.mu.Lock()
	if sim.burstActive {
		sim.mu.Unlock()
		return
	}
	sim.burstActive = true
	sim.burstStop = make(chan struct{})
	sim.mu.Unlock()

	go func() {
		defer func() {
			sim.mu.Lock()
			sim.burstActive = false
			sim.mu.Unlock()
		}()

		sim.mu.RLock()
		sess := sim.sess
		sim.mu.RUnlock()

		if sess == nil {
			return
		}

		sim.addSystemEvent(fmt.Sprintf("SOE Burst started: %d events @ %dms interval", count, intervalMs))

		for i := 0; i < count; i++ {
			select {
			case <-sim.burstStop:
				sim.addSystemEvent("SOE Burst stopped")
				return
			default:
			}

			sim.mu.RLock()
			idx := rand.Intn(len(sim.digitalPoints))
			dp := sim.digitalPoints[idx]
			dp.Value = !dp.Value
			ts := protocol.NowCP56Time2a()
			dp.LastTime = ts
			sim.mu.RUnlock()

			si := byte(0)
			if dp.Value {
				si = 0x01
			}
			var qd byte
			if dp.Blk {
				qd |= 0x10
			}
			if dp.Sb {
				qd |= 0x20
			}
			if dp.NT {
				qd |= 0x40
			}

			elem := make([]byte, 1+1+7)
			elem[0] = si
			elem[1] = qd
			copy(elem[2:], ts.Marshal())

			objects := []protocol.InformationObject{
				{IOA: dp.IOA, Elements: elem},
			}
			asduData := protocol.BuildMSPTB1(sim.commonAddr, protocol.CauseSpontaneous, objects)
			sess.SendIFrame(asduData)

			sim.addEvent(Event{
				EventType: EventTypeSOE,
				TypeID:    protocol.ASDU_M_SP_TB_1,
				TypeName:  "M_SP_TB_1",
				IOA:       dp.IOA,
				Value:     fmt.Sprintf("%v", dp.Value),
				Cause:     "Spontaneous",
				CP56Time:  ts.String(),
				Quality:   sim.qualityStr(dp.Blk, dp.Sb, dp.NT),
			})

			time.Sleep(time.Duration(intervalMs) * time.Millisecond)
		}

		sim.addSystemEvent("SOE Burst completed")
	}()
}

func (sim *Simulator) StopSOEBurst() {
	sim.mu.Lock()
	defer sim.mu.Unlock()
	if sim.burstActive {
		close(sim.burstStop)
		sim.burstActive = false
	}
}

func (sim *Simulator) SendDoublePointEvent(ioa uint32, value bool) {
	sim.mu.RLock()
	sess := sim.sess
	sim.mu.RUnlock()

	if sess == nil {
		return
	}

	ts := protocol.NowCP56Time2a()
	dpi := byte(0x01)
	if value {
		dpi = 0x02
	}

	elem := make([]byte, 1+1+7)
	elem[0] = dpi
	copy(elem[8:], ts.Marshal())

	objects := []protocol.InformationObject{
		{IOA: ioa, Elements: elem},
	}
	asduData := protocol.BuildMDPTB1(sim.commonAddr, protocol.CauseSpontaneous, objects)
	sess.SendIFrame(asduData)

	sim.addEvent(Event{
		EventType: EventTypeSOE,
		TypeID:    protocol.ASDU_M_DP_TB_1,
		TypeName:  "M_DP_TB_1",
		IOA:       ioa,
		Value:     fmt.Sprintf("%v", value),
		Cause:     "Spontaneous",
		CP56Time:  ts.String(),
	})
}

func (sim *Simulator) GetEvents() []Event {
	sim.mu.RLock()
	defer sim.mu.RUnlock()
	result := make([]Event, len(sim.events))
	copy(result, sim.events)
	return result
}

func (sim *Simulator) GetDigitalPoints() []*DataPoint {
	sim.mu.RLock()
	defer sim.mu.RUnlock()
	result := make([]*DataPoint, len(sim.digitalPoints))
	copy(result, sim.digitalPoints)
	return result
}

func (sim *Simulator) GetMeasurePoints() []*MeasurePoint {
	sim.mu.RLock()
	defer sim.mu.RUnlock()
	result := make([]*MeasurePoint, len(sim.measurePoints))
	copy(result, sim.measurePoints)
	return result
}

func (sim *Simulator) IsBurstActive() bool {
	sim.mu.RLock()
	defer sim.mu.RUnlock()
	return sim.burstActive
}

func (sim *Simulator) Subscribe() chan Event {
	ch := make(chan Event, 64)
	sim.subMu.Lock()
	sim.eventSubs = append(sim.eventSubs, ch)
	sim.subMu.Unlock()
	return ch
}

func (sim *Simulator) Unsubscribe(ch chan Event) {
	sim.subMu.Lock()
	defer sim.subMu.Unlock()
	for i, sub := range sim.eventSubs {
		if sub == ch {
			sim.eventSubs = append(sim.eventSubs[:i], sim.eventSubs[i+1:]...)
			close(ch)
			return
		}
	}
}

func (sim *Simulator) addEvent(evt Event) {
	sim.mu.Lock()
	sim.eventIDSeq++
	evt.ID = sim.eventIDSeq
	evt.Timestamp = time.Now().Format("15:04:05.000")
	if len(sim.events) >= 500 {
		sim.events = sim.events[len(sim.events)-400:]
	}
	sim.events = append(sim.events, evt)
	sim.mu.Unlock()

	sim.subMu.Lock()
	for _, sub := range sim.eventSubs {
		select {
		case sub <- evt:
		default:
		}
	}
	sim.subMu.Unlock()
}

func (sim *Simulator) addSystemEvent(msg string) {
	sim.addEvent(Event{
		EventType: EventTypeSystem,
		TypeName:  "SYSTEM",
		Value:     msg,
		Cause:     "System",
	})
}

func (sim *Simulator) GetSession() *session.Session {
	sim.mu.RLock()
	defer sim.mu.RUnlock()
	return sim.sess
}

func (sim *Simulator) handleFileCall(asdu *protocol.ASDU) {
	if len(asdu.InformationObjects) == 0 {
		return
	}

	fc, err := protocol.ParseFileCall(asdu.InformationObjects[0])
	if err != nil {
		log.Printf("[Simulator] Parse FileCall error: %v", err)
		return
	}

	log.Printf("[Simulator] FileCall: Service=%s FileID=%d SectionID=%d Offset=%d NumElements=%d",
		fc.Service, fc.FileID, fc.SectionID, fc.Offset, fc.NumElements)

	sim.addEvent(Event{
		EventType: EventTypeFile,
		TypeID:    asdu.TypeID,
		TypeName:  asdu.TypeName(),
		IOA:       uint32(fc.FileID),
		Value:     fmt.Sprintf("Service=%s FileID=%d", fc.Service, fc.FileID),
		Cause:     asdu.CauseName(),
	})

	sim.mu.RLock()
	sess := sim.sess
	sim.mu.RUnlock()

	if sess == nil {
		return
	}

	switch fc.Service {
	case protocol.FileServiceCallDir:
		go sim.SendFileList(sess)
	case protocol.FileServiceCallFile:
		go sim.SendFileContent(sess, fc.FileID, int(fc.Offset), int(fc.NumElements))
	case protocol.FileServiceSelectFile:
		go sim.ackFileRequest(sess, fc.FileID, protocol.FileACKOK)
	case protocol.FileServiceDeactivate:
		go sim.ackFileRequest(sess, fc.FileID, protocol.FileACKOK)
		sim.addSystemEvent(fmt.Sprintf("File transfer deactivated: FileID=%d", fc.FileID))
	case protocol.FileServiceDelete:
		sim.mu.Lock()
		var deletedName string
		for name, f := range sim.files {
			if f.ID == fc.FileID {
				delete(sim.files, name)
				deletedName = name
				break
			}
		}
		sim.mu.Unlock()
		if deletedName != "" {
			go sim.ackFileRequest(sess, fc.FileID, protocol.FileACKOK)
			sim.addSystemEvent(fmt.Sprintf("File deleted: %s (ID=%d)", deletedName, fc.FileID))
		} else {
			go sim.ackFileRequest(sess, fc.FileID, protocol.FileACKFileNotFound)
		}
	default:
		go sim.ackFileRequest(sess, fc.FileID, protocol.FileACKNOK)
	}
}

func (sim *Simulator) handleFileAck(asdu *protocol.ASDU) {
	if len(asdu.InformationObjects) == 0 {
		return
	}

	fa, err := protocol.ParseFileAck(asdu.InformationObjects[0])
	if err != nil {
		log.Printf("[Simulator] Parse FileAck error: %v", err)
		return
	}

	log.Printf("[Simulator] FileAck: Status=%s FileID=%d SectionID=%d",
		fa.Status, fa.FileID, fa.SectionID)

	sim.addEvent(Event{
		EventType: EventTypeFile,
		TypeID:    asdu.TypeID,
		TypeName:  asdu.TypeName(),
		IOA:       uint32(fa.FileID),
		Value:     fmt.Sprintf("ACK=%s FileID=%d Sec=%d", fa.Status, fa.FileID, fa.SectionID),
		Cause:     asdu.CauseName(),
	})
}

func (sim *Simulator) handleFileSegment(asdu *protocol.ASDU) {
	if len(asdu.InformationObjects) == 0 {
		return
	}

	fs, err := protocol.ParseFileSegment(asdu.InformationObjects[0])
	if err != nil {
		log.Printf("[Simulator] Parse FileSegment error: %v", err)
		return
	}

	log.Printf("[Simulator] FileSegment received: FileID=%d SectionID=%d Offset=%d DataLen=%d",
		fs.FileID, fs.SectionID, fs.Offset, len(fs.Data))

	sim.addEvent(Event{
		EventType: EventTypeFile,
		TypeID:    asdu.TypeID,
		TypeName:  asdu.TypeName(),
		IOA:       uint32(fs.FileID),
		Value:     fmt.Sprintf("Seg=%d Off=%d Len=%d", fs.SectionID, fs.Offset, len(fs.Data)),
		Cause:     asdu.CauseName(),
	})
}

func (sim *Simulator) SendFileList(sess *session.Session) {
	sim.mu.RLock()
	files := make([]*SimFile, 0, len(sim.files))
	for _, f := range sim.files {
		files = append(files, f)
	}
	sim.mu.RUnlock()

	for _, f := range files {
		fr := protocol.FileReady{
			Filename:  f.Name,
			FileID:    f.ID,
			Size:      f.Size,
			ReadyTime: protocol.NowCP56Time2a(),
			LFD:       true,
		}
		asduData := protocol.BuildFFRNA1(sim.commonAddr, fr)
		sess.SendIFrame(asduData)

		sim.addEvent(Event{
			EventType: EventTypeFile,
			TypeID:    protocol.ASDU_F_FR_NA_1,
			TypeName:  "F_FR_NA_1",
			IOA:       uint32(f.ID),
			Value:     fmt.Sprintf("File=%s Size=%d", f.Name, f.Size),
			Cause:     "FileTransfer",
		})
		time.Sleep(20 * time.Millisecond)
	}

	sim.addSystemEvent(fmt.Sprintf("Directory listing sent: %d files", len(files)))
}

func (sim *Simulator) SendFileContent(sess *session.Session, fileID uint16, offset int, numSections int) {
	sim.mu.RLock()
	var targetFile *SimFile
	for _, f := range sim.files {
		if f.ID == fileID {
			targetFile = f
			break
		}
	}
	sim.mu.RUnlock()

	if targetFile == nil {
		go sim.ackFileRequest(sess, fileID, protocol.FileACKFileNotFound)
		return
	}

	if offset >= len(targetFile.Sections) {
		go sim.ackFileRequest(sess, fileID, protocol.FileACKOK)
		return
	}

	endSection := offset + numSections
	if numSections == 0 || endSection > len(targetFile.Sections) {
		endSection = len(targetFile.Sections)
	}

	sim.addSystemEvent(fmt.Sprintf("Sending file: %s (%d sections)", targetFile.Name, endSection-offset))

	for i := offset; i < endSection; i++ {
		section := targetFile.Sections[i]

		fsr := protocol.FileSectionReady{
			FileID:    fileID,
			SectionID: uint8(i),
			DataLen:   uint16(len(section)),
			ReadyTime: protocol.NowCP56Time2a(),
		}
		if i == endSection-1 {
			fsr.LFD = true
		}
		asduData := protocol.BuildFSRNA1(sim.commonAddr, fsr)
		sess.SendIFrame(asduData)

		sim.addEvent(Event{
			EventType: EventTypeFile,
			TypeID:    protocol.ASDU_F_SR_NA_1,
			TypeName:  "F_SR_NA_1",
			IOA:       uint32(fileID),
			Value:     fmt.Sprintf("Sec=%d Len=%d", i, len(section)),
			Cause:     "FileTransfer",
		})

		time.Sleep(30 * time.Millisecond)

		fsg := protocol.FileSegment{
			FileID:    fileID,
			SectionID: uint8(i),
			Offset:    uint16(i * 200),
			Data:      section,
		}
		asduData = protocol.BuildFSGNA1(sim.commonAddr, fsg)
		sess.SendIFrame(asduData)

		sim.addEvent(Event{
			EventType: EventTypeFile,
			TypeID:    protocol.ASDU_F_SG_NA_1,
			TypeName:  "F_SG_NA_1",
			IOA:       uint32(fileID),
			Value:     fmt.Sprintf("Data[%d] = %d bytes", i, len(section)),
			Cause:     "FileTransfer",
		})

		time.Sleep(50 * time.Millisecond)
	}

	fls := protocol.FileLastSection{
		FileID:    fileID,
		SectionID: uint8(endSection - 1),
		DataLen:   uint16(len(targetFile.Sections[endSection-1])),
		Checksum:  protocol.ComputeChecksum(targetFile.Content),
		TimeLast:  targetFile.ModTime,
	}
	asduData := protocol.BuildFLSNA1(sim.commonAddr, fls)
	sess.SendIFrame(asduData)

	sim.addEvent(Event{
		EventType: EventTypeFile,
		TypeID:    protocol.ASDU_F_LS_NA_1,
		TypeName:  "F_LS_NA_1",
		IOA:       uint32(fileID),
		Value:     fmt.Sprintf("CRC=0x%04X Sections=%d", fls.Checksum, endSection-offset),
		Cause:     "FileTransfer",
	})

	sim.addSystemEvent(fmt.Sprintf("File transfer complete: %s", targetFile.Name))
}

func (sim *Simulator) ackFileRequest(sess *session.Session, fileID uint16, status protocol.FileACK) {
	fa := protocol.FileAck{
		Status:    status,
		FileID:    fileID,
		SectionID: 0,
	}
	asduData := protocol.BuildFAFNA1(sim.commonAddr, fa)
	sess.SendIFrame(asduData)

	sim.addEvent(Event{
		EventType: EventTypeFile,
		TypeID:    protocol.ASDU_F_AF_NA_1,
		TypeName:  "F_AF_NA_1",
		IOA:       uint32(fileID),
		Value:     fmt.Sprintf("ACK=%s", status),
		Cause:     "FileTransfer",
	})
}

func (sim *Simulator) GetFiles() []map[string]interface{} {
	sim.mu.RLock()
	defer sim.mu.RUnlock()

	result := make([]map[string]interface{}, 0, len(sim.files))
	for _, f := range sim.files {
		result = append(result, map[string]interface{}{
			"name":     f.Name,
			"id":       f.ID,
			"size":     f.Size,
			"sections": len(f.Sections),
			"modTime":  f.ModTime.String(),
		})
	}
	return result
}

func (sim *Simulator) GetFileContent(name string) ([]byte, bool) {
	sim.mu.RLock()
	defer sim.mu.RUnlock()

	if f, ok := sim.files[name]; ok {
		return f.Content, true
	}
	return nil, false
}

func (sim *Simulator) qualityStr(blk, sb, nt bool) string {
	q := "Good"
	if blk {
		q = "Blocked"
	}
	if sb {
		q = "Substituted"
	}
	if nt {
		q = "NotTopical"
	}
	return q
}
