package s1ap

import (
	"encoding/hex"
	"fmt"
	"time"
)

type MessageType string

const (
	MsgTypeInitialUEMessage             MessageType = "InitialUEMessage"
	MsgTypeInitialContextSetupRequest   MessageType = "InitialContextSetupRequest"
	MsgTypeInitialContextSetupResponse  MessageType = "InitialContextSetupResponse"
	MsgTypeUEContextReleaseCommand      MessageType = "UEContextReleaseCommand"
	MsgTypeUEContextReleaseComplete     MessageType = "UEContextReleaseComplete"
	MsgTypeX2HandoverRequest           MessageType = "X2HandoverRequest"
	MsgTypeX2HandoverRequestAck        MessageType = "X2HandoverRequestAck"
	MsgTypeX2SNStatusTransfer          MessageType = "X2SNStatusTransfer"
	MsgTypePathSwitchRequest           MessageType = "PathSwitchRequest"
	MsgTypePathSwitchRequestAck        MessageType = "PathSwitchRequestAck"
)

type S1APPDU struct {
	ProcedureCode int    `json:"procedureCode"`
	Criticality   string `json:"criticality"`
	Value         interface{} `json:"value"`
}

type NASMessage struct {
	SecurityHeaderType string `json:"securityHeaderType"`
	MessageType        string `json:"messageType"`
	MessageName        string `json:"messageName"`
	NASKeyValue        string `json:"nasKeyValue,omitempty"`
}

type AttachRequestFields struct {
	EPSAttachType     string `json:"epsAttachType"`
	IMSI              string `json:"imsi"`
	EPSBearerIdentity string `json:"epsBearerIdentity"`
	AccessPointName   string `json:"accessPointName"`
	PDNAddress        string `json:"pdnAddress"`
	Authentication    string `json:"authentication"`
	NASMessageHex     string `json:"nasMessageHex"`
}

type AttachAcceptFields struct {
	EPSAttachResult   string `json:"epsAttachResult"`
	T3412Value        string `json:"t3412Value"`
	GUTI              string `json:"guti"`
	TAIList           string `json:"taiList"`
	ESMMessage        string `json:"esmMessage"`
	NASMessageHex     string `json:"nasMessageHex"`
}

type InitialUEMessage struct {
	MessageType        MessageType         `json:"messageType"`
	Timestamp          string              `json:"timestamp"`
	Direction          string              `json:"direction"`
	ENBUEID            int                 `json:"enbUeId"`
	NASPDU             string              `json:"nasPdu"`
	NASMessage         NASMessage          `json:"nasMessage"`
	AttachRequest      *AttachRequestFields `json:"attachRequest,omitempty"`
	TAC                int                 `json:"tac"`
	PLMNIdentity       string              `json:"plmnIdentity"`
	RRCEstCause        string              `json:"rrcEstCause"`
	CSGID              int                 `json:"csgId,omitempty"`
	GlobalENBID        string              `json:"globalEnbId"`
}

type E_RABToBeSetupItem struct {
	E_RABID          int    `json:"eRabId"`
	QCI              int    `json:"qci"`
	DL_GTP_TEID      string `json:"dlGtpTeid"`
	TransportLayerAddress string `json:"transportLayerAddress"`
}

type InitialContextSetupRequest struct {
	MessageType           MessageType            `json:"messageType"`
	Timestamp             string                 `json:"timestamp"`
	Direction             string                 `json:"direction"`
	MMEUES1APID           int                    `json:"mmeUeS1apId"`
	ENBUES1APID           int                    `json:"enbUeS1apId"`
	UEAggregateMaxBitrate string                 `json:"ueAggregateMaxBitrate"`
	E_RABToBeSetupList    []E_RABToBeSetupItem   `json:"eRabToBeSetupList"`
	SecurityKey           string                 `json:"securityKey"`
	SecurityCapabilities  string                 `json:"securityCapabilities"`
	NASPDU                string                 `json:"nasPdu,omitempty"`
	AttachAccept          *AttachAcceptFields    `json:"attachAccept,omitempty"`
}

type E_RABSetupItem struct {
	E_RABID          int    `json:"eRabId"`
	UL_GTP_TEID      string `json:"ulGtpTeid"`
	TransportLayerAddress string `json:"transportLayerAddress"`
}

type InitialContextSetupResponse struct {
	MessageType        MessageType      `json:"messageType"`
	Timestamp          string           `json:"timestamp"`
	Direction          string           `json:"direction"`
	MMEUES1APID        int              `json:"mmeUeS1apId"`
	ENBUES1APID        int              `json:"enbUeS1apId"`
	E_RABSetupList     []E_RABSetupItem `json:"eRabSetupList"`
}

type UEContextReleaseCommand struct {
	MessageType     MessageType `json:"messageType"`
	Timestamp       string      `json:"timestamp"`
	Direction       string      `json:"direction"`
	MMEUES1APID     int         `json:"mmeUeS1apId"`
	ENBUES1APID     int         `json:"enbUeS1apId"`
	Cause           string      `json:"cause"`
	CauseDetails    string      `json:"causeDetails"`
}

type UEContextReleaseComplete struct {
	MessageType      MessageType `json:"messageType"`
	Timestamp        string      `json:"timestamp"`
	Direction        string      `json:"direction"`
	MMEUES1APID      int         `json:"mmeUeS1apId"`
	ENBUES1APID      int         `json:"enbUeS1apId"`
}

type ERABAdmittedItem struct {
	E_RABID          int    `json:"eRabId"`
	UL_GTP_TEID      string `json:"ulGtpTeid"`
	DL_GTP_TEID      string `json:"dlGtpTeid"`
	TransportLayerAddress string `json:"transportLayerAddress"`
}

type X2HandoverRequest struct {
	MessageType       MessageType          `json:"messageType"`
	Timestamp         string               `json:"timestamp"`
	Direction         string               `json:"direction"`
	SourceENBID       string               `json:"sourceEnbId"`
	TargetENBID       string               `json:"targetEnbId"`
	MMEUES1APID       int                  `json:"mmeUeS1apId"`
	ENBUES1APID       int                  `json:"enbUeS1apId"`
	Cause             string               `json:"cause"`
	CauseDetails      string               `json:"causeDetails"`
	ERABAdmittedList  []ERABAdmittedItem   `json:"eRabAdmittedList"`
}

type X2HandoverRequestAck struct {
	MessageType        MessageType          `json:"messageType"`
	Timestamp          string               `json:"timestamp"`
	Direction          string               `json:"direction"`
	SourceENBID        string               `json:"sourceEnbId"`
	TargetENBID        string               `json:"targetEnbId"`
	ENBUES1APID        int                  `json:"enbUeS1apId"`
	TargetENBUEID      int                  `json:"targetEnbUeId"`
	ERABAdmittedList   []ERABAdmittedItem   `json:"eRabAdmittedList"`
}

type SNStatusTransfer struct {
	MessageType     MessageType `json:"messageType"`
	Timestamp       string      `json:"timestamp"`
	Direction       string      `json:"direction"`
	SourceENBID     string      `json:"sourceEnbId"`
	TargetENBID     string      `json:"targetEnbId"`
	ERABID          int         `json:"eRabId"`
	UL_COUNT        string      `json:"ulCount"`
	DL_COUNT        string      `json:"dlCount"`
	UL_HFN          string      `json:"ulHfn"`
	DL_HFN          string      `json:"dlHfn"`
}

type PathSwitchRequest struct {
	MessageType     MessageType `json:"messageType"`
	Timestamp       string      `json:"timestamp"`
	Direction       string      `json:"direction"`
	TargetENBID     string      `json:"targetEnbId"`
	MMEUES1APID     int         `json:"mmeUeS1apId"`
	ENBUES1APID     int         `json:"enbUeS1apId"`
	E_RABID         int         `json:"eRabId"`
	UL_GTP_TEID     string      `json:"ulGtpTeid"`
	TransportLayerAddress string `json:"transportLayerAddress"`
}

type PathSwitchRequestAck struct {
	MessageType     MessageType `json:"messageType"`
	Timestamp       string      `json:"timestamp"`
	Direction       string      `json:"direction"`
	TargetENBID     string      `json:"targetEnbId"`
	MMEUES1APID     int         `json:"mmeUeS1apId"`
	ENBUES1APID     int         `json:"enbUeS1apId"`
	DL_GTP_TEID     string      `json:"dlGtpTeid"`
	TransportLayerAddress string `json:"transportLayerAddress"`
}

type SimulatedSignaling struct {
	ID          int         `json:"id"`
	Source      string      `json:"source"`
	Destination string      `json:"destination"`
	Message     interface{} `json:"message"`
}

func GenerateInitialUEMessage(enbUeId int) *InitialUEMessage {
	nasPdu := "0741020BF61002F60040352008106000000000000000000"

	return &InitialUEMessage{
		MessageType: MsgTypeInitialUEMessage,
		Timestamp:   time.Now().Format(time.RFC3339Nano),
		Direction:   "eNB -> MME",
		ENBUEID:     enbUeId,
		NASPDU:      nasPdu,
		NASMessage: NASMessage{
			SecurityHeaderType: "Plain NAS message",
			MessageType:        "0x41 (Attach request)",
			MessageName:        "Attach Request",
			NASKeyValue:        "0x00",
		},
		AttachRequest: &AttachRequestFields{
			EPSAttachType:     "EPS Attach (type=1)",
			IMSI:              "460001234567890",
			EPSBearerIdentity: "EPS Bearer ID: 5 (default)",
			AccessPointName:   "cmnet",
			PDNAddress:        "10.0.1.1 (IPv4)",
			Authentication:    "Security protected (NAS security context established)",
			NASMessageHex:     nasPdu,
		},
		TAC:          4097,
		PLMNIdentity: "46000",
		RRCEstCause:  "mo-Signalling",
		GlobalENBID:  fmt.Sprintf("460-00-%d", 12345),
	}
}

func GenerateInitialContextSetupRequest(enbUeId int, mmeUeId int) *InitialContextSetupRequest {
	nasPduAccept := "0742020BF61002F6000100020281020780010D00400000811006000000000000000000"
	return &InitialContextSetupRequest{
		MessageType:           MsgTypeInitialContextSetupRequest,
		Timestamp:             time.Now().Format(time.RFC3339Nano),
		Direction:             "MME -> eNB",
		MMEUES1APID:           mmeUeId,
		ENBUES1APID:           enbUeId,
		UEAggregateMaxBitrate: "UL: 100 Mbps, DL: 300 Mbps",
		E_RABToBeSetupList: []E_RABToBeSetupItem{
			{
				E_RABID:          5,
				QCI:              9,
				DL_GTP_TEID:      hex.EncodeToString([]byte{0x01, 0x02, 0x03, 0x04}),
				TransportLayerAddress: "192.168.100.1",
			},
		},
		SecurityKey:          hex.EncodeToString([]byte{0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF}),
		SecurityCapabilities: "EEA0, EEA1, EEA2; EIA0, EIA1, EIA2",
		NASPDU:               nasPduAccept,
		AttachAccept: &AttachAcceptFields{
			EPSAttachResult:   "EPS Attach (result=1, successfully attached)",
			T3412Value:        "T3412=180 (Periodic Tracking Area Update timer, 180s)",
			GUTI:              "460-00-1234-5678-90 (Globally Unique Temporary UE Identity)",
			TAIList:           "TAC=4097 (PLMN: 46000)",
			ESMMessage:        "Activate Default EPS Bearer Context Request (EBI=5, QCI=9)",
			NASMessageHex:     nasPduAccept,
		},
	}
}

func GenerateInitialContextSetupResponse(enbUeId int, mmeUeId int) *InitialContextSetupResponse {
	return &InitialContextSetupResponse{
		MessageType:    MsgTypeInitialContextSetupResponse,
		Timestamp:      time.Now().Format(time.RFC3339Nano),
		Direction:      "eNB -> MME",
		MMEUES1APID:    mmeUeId,
		ENBUES1APID:    enbUeId,
		E_RABSetupList: []E_RABSetupItem{
			{
				E_RABID:          5,
				UL_GTP_TEID:      hex.EncodeToString([]byte{0x05, 0x06, 0x07, 0x08}),
				TransportLayerAddress: "192.168.100.2",
			},
		},
	}
}

func GenerateUEContextReleaseCommand(enbUeId int, mmeUeId int, cause string, causeDetails string) *UEContextReleaseCommand {
	return &UEContextReleaseCommand{
		MessageType:  MsgTypeUEContextReleaseCommand,
		Timestamp:    time.Now().Format(time.RFC3339Nano),
		Direction:    "MME -> eNB",
		MMEUES1APID:  mmeUeId,
		ENBUES1APID:  enbUeId,
		Cause:        cause,
		CauseDetails: causeDetails,
	}
}

func GenerateUEContextReleaseComplete(enbUeId int, mmeUeId int) *UEContextReleaseComplete {
	return &UEContextReleaseComplete{
		MessageType:  MsgTypeUEContextReleaseComplete,
		Timestamp:    time.Now().Format(time.RFC3339Nano),
		Direction:    "eNB -> MME",
		MMEUES1APID:  mmeUeId,
		ENBUES1APID:  enbUeId,
	}
}

func GenerateX2HandoverRequest(sourceEnbId, targetEnbId string, mmeUeId, enbUeId int) *X2HandoverRequest {
	return &X2HandoverRequest{
		MessageType:  MsgTypeX2HandoverRequest,
		Timestamp:    time.Now().Format(time.RFC3339Nano),
		Direction:    fmt.Sprintf("%s -> %s (X2)", sourceEnbId, targetEnbId),
		SourceENBID:  sourceEnbId,
		TargetENBID:  targetEnbId,
		MMEUES1APID:  mmeUeId,
		ENBUES1APID:  enbUeId,
		Cause:        "ho-coverage",
		CauseDetails: "切换原因: 覆盖优化 (Coverage optimization)",
		ERABAdmittedList: []ERABAdmittedItem{
			{
				E_RABID:          5,
				UL_GTP_TEID:      hex.EncodeToString([]byte{0x10, 0x20, 0x30, 0x40}),
				DL_GTP_TEID:      hex.EncodeToString([]byte{0x01, 0x02, 0x03, 0x04}),
				TransportLayerAddress: "192.168.100.1",
			},
		},
	}
}

func GenerateX2HandoverRequestAck(sourceEnbId, targetEnbId string, enbUeId, targetEnbUeId int) *X2HandoverRequestAck {
	return &X2HandoverRequestAck{
		MessageType:  MsgTypeX2HandoverRequestAck,
		Timestamp:    time.Now().Format(time.RFC3339Nano),
		Direction:    fmt.Sprintf("%s -> %s (X2)", targetEnbId, sourceEnbId),
		SourceENBID:  sourceEnbId,
		TargetENBID:  targetEnbId,
		ENBUES1APID:  enbUeId,
		TargetENBUEID: targetEnbUeId,
		ERABAdmittedList: []ERABAdmittedItem{
			{
				E_RABID:          5,
				UL_GTP_TEID:      hex.EncodeToString([]byte{0x50, 0x60, 0x70, 0x80}),
				DL_GTP_TEID:      hex.EncodeToString([]byte{0x11, 0x12, 0x13, 0x14}),
				TransportLayerAddress: "192.168.200.1",
			},
		},
	}
}

func GenerateSNStatusTransfer(sourceEnbId, targetEnbId string) *SNStatusTransfer {
	return &SNStatusTransfer{
		MessageType: MsgTypeX2SNStatusTransfer,
		Timestamp:   time.Now().Format(time.RFC3339Nano),
		Direction:   fmt.Sprintf("%s -> %s (X2)", sourceEnbId, targetEnbId),
		SourceENBID: sourceEnbId,
		TargetENBID: targetEnbId,
		ERABID:      5,
		UL_COUNT:    "0x000100 (COUNT=256)",
		DL_COUNT:    "0x000200 (COUNT=512)",
		UL_HFN:      "0 (Hyper Frame Number)",
		DL_HFN:      "0 (Hyper Frame Number)",
	}
}

func GeneratePathSwitchRequest(targetEnbId string, mmeUeId, enbUeId int) *PathSwitchRequest {
	return &PathSwitchRequest{
		MessageType:         MsgTypePathSwitchRequest,
		Timestamp:           time.Now().Format(time.RFC3339Nano),
		Direction:           fmt.Sprintf("%s -> MME (S1AP)", targetEnbId),
		TargetENBID:         targetEnbId,
		MMEUES1APID:         mmeUeId,
		ENBUES1APID:         enbUeId,
		E_RABID:             5,
		UL_GTP_TEID:         hex.EncodeToString([]byte{0x50, 0x60, 0x70, 0x80}),
		TransportLayerAddress: "192.168.200.1",
	}
}

func GeneratePathSwitchRequestAck(targetEnbId string, mmeUeId, enbUeId int) *PathSwitchRequestAck {
	return &PathSwitchRequestAck{
		MessageType:         MsgTypePathSwitchRequestAck,
		Timestamp:           time.Now().Format(time.RFC3339Nano),
		Direction:           fmt.Sprintf("MME -> %s (S1AP)", targetEnbId),
		TargetENBID:         targetEnbId,
		MMEUES1APID:         mmeUeId,
		ENBUES1APID:         enbUeId,
		DL_GTP_TEID:         hex.EncodeToString([]byte{0x11, 0x12, 0x13, 0x14}),
		TransportLayerAddress: "10.1.1.1",
	}
}
