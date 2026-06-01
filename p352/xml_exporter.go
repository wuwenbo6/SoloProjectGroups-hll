package main

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

type IEEE8021QbvSchedule struct {
	XMLName      xml.Name         `xml:"http://www.ieee802.org/1/ns/yang/ieee802-dot1q-sched ieee802-dot1q-sched"`
	GateSchedules []GateScheduleXML `xml:"gate-schedules>gate-schedule"`
}

type GateScheduleXML struct {
	XMLName              xml.Name `xml:"gate-schedule"`
	PortReference        string   `xml:"port-reference"`
	AdminCycleTimeNum    int64    `xml:"admin-cycle-time>numerator"`
	AdminCycleTimeDenom  int64    `xml:"admin-cycle-time>denominator"`
	AdminCycleTimeExtension int64 `xml:"admin-cycle-time-extension"`
	AdminGateList        AdminGateListXML `xml:"admin-gate-list"`
	AdminBaseTime        int64    `xml:"admin-base-time"`
	OperCycleTimeNum     int64    `xml:"oper-cycle-time>numerator"`
	OperCycleTimeDenom   int64    `xml:"oper-cycle-time>denominator"`
	OperGateList         OperGateListXML `xml:"oper-gate-list"`
	OperBaseTime         int64    `xml:"oper-base-time"`
	ConfigChange         int      `xml:"config-change"`
	TickGranularity      int64    `xml:"tick-granularity"`
}

type AdminGateListXML struct {
	XMLName       xml.Name `xml:"admin-gate-list"`
	GateControlEntries []GateControlEntryXML `xml:"gate-control-entry"`
}

type OperGateListXML struct {
	XMLName       xml.Name `xml:"oper-gate-list"`
	GateControlEntries []GateControlEntryXML `xml:"gate-control-entry"`
}

type GateControlEntryXML struct {
	XMLName        xml.Name `xml:"gate-control-entry"`
	OperationName  string   `xml:"operation-name"`
	TimeInterval   int64    `xml:"time-interval"`
	GateStatesValue string  `xml:"gate-states-value"`
}

type StreamReservationXML struct {
	XMLName      xml.Name `xml:"http://www.ieee802.org/1/ns/yang/ieee802-dot1q-srp ieee802-dot1q-srp"`
	Streams      []StreamXML `xml:"streams>stream"`
}

type StreamXML struct {
	XMLName      xml.Name `xml:"stream"`
	StreamID     string   `xml:"stream-id"`
	StreamName   string   `xml:"stream-name"`
	SourceMAC    string   `xml:"source-mac"`
	DestMAC      string   `xml:"dest-mac"`
	VLANID       int      `xml:"vlan-id"`
	Priority     int      `xml:"priority"`
	Bandwidth    float64  `xml:"bandwidth"`
	MaxFrameSize int      `xml:"max-frame-size"`
	Rank         string   `xml:"rank"`
}

func ExportToIEEE8021QbvXML(config *SimulationConfig) (string, error) {
	var schedules []GateScheduleXML

	for queueIdx, queue := range config.Queues {
		cycleTime := calculateCycleTime(queue.GateControlList)

		adminEntries := make([]GateControlEntryXML, len(queue.GateControlList))
		for i, entry := range queue.GateControlList {
			adminEntries[i] = GateControlEntryXML{
				OperationName:  fmt.Sprintf("Entry%d", i),
				TimeInterval:   entry.TimeInterval,
				GateStatesValue: createGateStatesValue(len(config.Queues), queueIdx, entry.Operation),
			}
		}

		schedule := GateScheduleXML{
			PortReference:         fmt.Sprintf("Port%d", queue.QueueID),
			AdminCycleTimeNum:     cycleTime,
			AdminCycleTimeDenom:   1000000000,
			AdminCycleTimeExtension: 0,
			AdminGateList: AdminGateListXML{
				GateControlEntries: adminEntries,
			},
			AdminBaseTime:   time.Now().UnixNano(),
			OperCycleTimeNum:   cycleTime,
			OperCycleTimeDenom: 1000000000,
			OperGateList:    OperGateListXML{GateControlEntries: adminEntries},
			OperBaseTime:    time.Now().UnixNano(),
			ConfigChange:    0,
			TickGranularity: 1,
		}
		schedules = append(schedules, schedule)
	}

	ieeeConfig := IEEE8021QbvSchedule{
		GateSchedules: schedules,
	}

	output, err := xml.MarshalIndent(ieeeConfig, "", "  ")
	if err != nil {
		return "", err
	}

	xmlHeader := `<?xml version="1.0" encoding="UTF-8"?>
`
	return xmlHeader + string(output), nil
}

func ExportSRPToXML(streams []SRPStream) (string, error) {
	var streamXMLs []StreamXML

	for _, stream := range streams {
		streamXMLs = append(streamXMLs, StreamXML{
			StreamID:     stream.StreamID,
			StreamName:   stream.StreamName,
			SourceMAC:    stream.Talker.EndStationMAC,
			DestMAC:      stream.Talker.DestMAC,
			VLANID:       stream.Talker.VLANID,
			Priority:     stream.Talker.DataFramePriority,
			Bandwidth:    stream.RequiredBandwidth,
			MaxFrameSize: stream.Talker.MaxFrameSize,
			Rank:         stream.Talker.Rank,
		})
	}

	srpConfig := StreamReservationXML{
		Streams: streamXMLs,
	}

	output, err := xml.MarshalIndent(srpConfig, "", "  ")
	if err != nil {
		return "", err
	}

	xmlHeader := `<?xml version="1.0" encoding="UTF-8"?>
`
	return xmlHeader + string(output), nil
}

func calculateCycleTime(entries []GateControlEntry) int64 {
	var total int64
	for _, entry := range entries {
		total += entry.TimeInterval
	}
	return total
}

func createGateStatesValue(numQueues int, queueIndex int, operation GateState) string {
	states := make([]string, 8)
	for i := 0; i < 8; i++ {
		states[i] = "0"
	}
	if operation == GateOpen {
		idx := 7 - queueIndex
		if idx >= 0 && idx < 8 {
			states[idx] = "1"
		}
	}
	return strings.Join(states, "")
}

func ExportFullConfigToXML(config *SimulationConfig, streams []SRPStream) (string, error) {
	gateXML, err := ExportToIEEE8021QbvXML(config)
	if err != nil {
		return "", err
	}

	srpXML, err := ExportSRPToXML(streams)
	if err != nil {
		return "", err
	}

	fullXML := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<tsn-configuration xmlns="http://example.com/tsn">
  <description>TSN Configuration - Gate Scheduling and Stream Reservation</description>
  <timestamp>%s</timestamp>
  <port-bandwidth>%.2f Mbps</port-bandwidth>
  <simulation-duration>%d ns</simulation-duration>
  
  <ieee8021qbv>
%s
  </ieee8021qbv>
  
  <ieee8021qat>
%s
  </ieee8021qat>
</tsn-configuration>`,
		time.Now().Format(time.RFC3339),
		config.PortBandwidth,
		config.Duration,
		indentXML(gateXML, "    "),
		indentXML(srpXML, "    "),
	)

	return fullXML, nil
}

func indentXML(xmlStr, indent string) string {
	lines := strings.Split(xmlStr, "\n")
	var result []string
	for _, line := range lines {
		if strings.TrimSpace(line) != "" && !strings.HasPrefix(line, "<?xml") {
			result = append(result, indent+line)
		}
	}
	return strings.Join(result, "\n")
}
