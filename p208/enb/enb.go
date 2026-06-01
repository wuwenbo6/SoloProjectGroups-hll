package enb

import (
	"log"
	"s1ap-simulator/s1ap"
)

type ENB struct {
	ID string
}

func NewENB(id string) *ENB {
	return &ENB{
		ID: id,
	}
}

func (e *ENB) SendInitialUEMessage() (*s1ap.InitialUEMessage, int) {
	enbUeId := s1ap.GetENBUeIDGenerator().Next()

	msg := s1ap.GenerateInitialUEMessage(enbUeId)
	
	log.Printf("[eNB %s] Sending Initial UE Message (ENB_UE_ID: %d)", e.ID, enbUeId)
	log.Printf("  - NAS PDU: %s", msg.NASPDU)
	log.Printf("  - TAC: %d", msg.TAC)
	log.Printf("  - PLMN Identity: %s", msg.PLMNIdentity)
	log.Printf("  - RRC Establishment Cause: %s", msg.RRCEstCause)

	return msg, enbUeId
}

func (e *ENB) ReceiveInitialContextSetupRequest(req *s1ap.InitialContextSetupRequest) {
	log.Printf("[eNB %s] Received Initial Context Setup Request", e.ID)
	log.Printf("  - MME UE S1AP ID: %d", req.MMEUES1APID)
	log.Printf("  - eNB UE S1AP ID: %d", req.ENBUES1APID)
	log.Printf("  - UE Aggregate Max Bitrate: %s", req.UEAggregateMaxBitrate)
	log.Printf("  - Number of E-RABs to setup: %d", len(req.E_RABToBeSetupList))
}

func (e *ENB) SendInitialContextSetupResponse(enbUeId int, mmeUeId int) *s1ap.InitialContextSetupResponse {
	log.Printf("[eNB %s] Sending Initial Context Setup Response", e.ID)
	
	return s1ap.GenerateInitialContextSetupResponse(enbUeId, mmeUeId)
}

func (e *ENB) ReceiveUEContextReleaseCommand(cmd *s1ap.UEContextReleaseCommand) {
	log.Printf("[eNB %s] Received UE Context Release Command", e.ID)
	log.Printf("  - MME UE S1AP ID: %d", cmd.MMEUES1APID)
	log.Printf("  - eNB UE S1AP ID: %d", cmd.ENBUES1APID)
	log.Printf("  - Cause: %s", cmd.Cause)
	log.Printf("  - Cause Details: %s", cmd.CauseDetails)
}

func (e *ENB) SendUEContextReleaseComplete(enbUeId int, mmeUeId int) *s1ap.UEContextReleaseComplete {
	log.Printf("[eNB %s] Sending UE Context Release Complete", e.ID)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	log.Printf("  - eNB UE S1AP ID: %d", enbUeId)
	
	return s1ap.GenerateUEContextReleaseComplete(enbUeId, mmeUeId)
}

func (e *ENB) SendX2HandoverRequest(targetEnbId string, mmeUeId int, enbUeId int) *s1ap.X2HandoverRequest {
	log.Printf("[eNB %s] Sending X2 Handover Request to %s", e.ID, targetEnbId)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	log.Printf("  - eNB UE S1AP ID: %d", enbUeId)
	
	return s1ap.GenerateX2HandoverRequest(e.ID, targetEnbId, mmeUeId, enbUeId)
}

func (e *ENB) ReceiveX2HandoverRequestAck(ack *s1ap.X2HandoverRequestAck) {
	log.Printf("[eNB %s] Received X2 Handover Request Ack", e.ID)
	log.Printf("  - Target eNB UE ID: %d", ack.TargetENBUEID)
	log.Printf("  - E-RABs admitted: %d", len(ack.ERABAdmittedList))
}

func (e *ENB) SendSNStatusTransfer(targetEnbId string) *s1ap.SNStatusTransfer {
	log.Printf("[eNB %s] Sending SN Status Transfer to %s", e.ID, targetEnbId)
	
	return s1ap.GenerateSNStatusTransfer(e.ID, targetEnbId)
}

func (e *ENB) ReceiveX2HandoverRequest(req *s1ap.X2HandoverRequest) {
	log.Printf("[eNB %s] Received X2 Handover Request", e.ID)
	log.Printf("  - Source eNB: %s", req.SourceENBID)
	log.Printf("  - Cause: %s", req.Cause)
}

func (e *ENB) SendX2HandoverRequestAck(sourceEnbId string, enbUeId int) *s1ap.X2HandoverRequestAck {
	targetEnbUeId := s1ap.GetENBUeIDGenerator().Next()
	log.Printf("[eNB %s] Sending X2 Handover Request Ack", e.ID)
	log.Printf("  - Target eNB UE ID assigned: %d", targetEnbUeId)
	
	return s1ap.GenerateX2HandoverRequestAck(sourceEnbId, e.ID, enbUeId, targetEnbUeId)
}

func (e *ENB) ReceiveSNStatusTransfer(transfer *s1ap.SNStatusTransfer) {
	log.Printf("[eNB %s] Received SN Status Transfer", e.ID)
	log.Printf("  - E-RAB ID: %d", transfer.ERABID)
	log.Printf("  - UL COUNT: %s", transfer.UL_COUNT)
	log.Printf("  - DL COUNT: %s", transfer.DL_COUNT)
}

func (e *ENB) SendPathSwitchRequest(mmeUeId int, enbUeId int) *s1ap.PathSwitchRequest {
	log.Printf("[eNB %s] Sending Path Switch Request to MME", e.ID)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	log.Printf("  - eNB UE S1AP ID: %d", enbUeId)
	
	return s1ap.GeneratePathSwitchRequest(e.ID, mmeUeId, enbUeId)
}

func (e *ENB) ReceivePathSwitchRequestAck(ack *s1ap.PathSwitchRequestAck) {
	log.Printf("[eNB %s] Received Path Switch Request Ack", e.ID)
	log.Printf("  - MME UE S1AP ID: %d", ack.MMEUES1APID)
	log.Printf("  - DL GTP TEID: %s", ack.DL_GTP_TEID)
	log.Printf("  - Transport Layer: %s", ack.TransportLayerAddress)
}
