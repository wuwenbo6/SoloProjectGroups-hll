package mme

import (
	"log"
	"s1ap-simulator/s1ap"
)

type MME struct {
	ID string
}

func NewMME(id string) *MME {
	return &MME{
		ID: id,
	}
}

func (m *MME) ReceiveInitialUEMessage(msg *s1ap.InitialUEMessage) int {
	mmeUeId := s1ap.GetMMEUeIDGenerator().Next()

	log.Printf("[MME %s] Received Initial UE Message", m.ID)
	log.Printf("  - eNB UE ID: %d", msg.ENBUEID)
	log.Printf("  - MME UE ID assigned: %d", mmeUeId)
	log.Printf("  - NAS Message: %s", msg.NASMessage.MessageName)
	log.Printf("  - TAC: %d", msg.TAC)
	log.Printf("  - PLMN: %s", msg.PLMNIdentity)

	return mmeUeId
}

func (m *MME) SendInitialContextSetupRequest(enbUeId int, mmeUeId int) *s1ap.InitialContextSetupRequest {
	log.Printf("[MME %s] Sending Initial Context Setup Request", m.ID)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	log.Printf("  - eNB UE S1AP ID: %d", enbUeId)
	
	return s1ap.GenerateInitialContextSetupRequest(enbUeId, mmeUeId)
}

func (m *MME) ReceiveInitialContextSetupResponse(resp *s1ap.InitialContextSetupResponse) {
	log.Printf("[MME %s] Received Initial Context Setup Response", m.ID)
	log.Printf("  - MME UE S1AP ID: %d", resp.MMEUES1APID)
	log.Printf("  - eNB UE S1AP ID: %d", resp.ENBUES1APID)
	log.Printf("  - E-RABs setup: %d", len(resp.E_RABSetupList))
	
	for _, erab := range resp.E_RABSetupList {
		log.Printf("    * E-RAB ID %d: UL TEID=%s, GTP-U=%s", 
			erab.E_RABID, erab.UL_GTP_TEID, erab.TransportLayerAddress)
	}
}

func (m *MME) SendUEContextReleaseCommand(enbUeId int, mmeUeId int, cause string, causeDetails string) *s1ap.UEContextReleaseCommand {
	log.Printf("[MME %s] Sending UE Context Release Command", m.ID)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	log.Printf("  - eNB UE S1AP ID: %d", enbUeId)
	log.Printf("  - Cause: %s", cause)
	log.Printf("  - Cause Details: %s", causeDetails)
	
	return s1ap.GenerateUEContextReleaseCommand(enbUeId, mmeUeId, cause, causeDetails)
}

func (m *MME) ReceiveUEContextReleaseComplete(resp *s1ap.UEContextReleaseComplete) {
	log.Printf("[MME %s] Received UE Context Release Complete", m.ID)
	log.Printf("  - MME UE S1AP ID: %d", resp.MMEUES1APID)
	log.Printf("  - eNB UE S1AP ID: %d", resp.ENBUES1APID)
	log.Printf("  - UE context successfully released")
}

func (m *MME) ReceivePathSwitchRequest(req *s1ap.PathSwitchRequest) {
	log.Printf("[MME %s] Received Path Switch Request", m.ID)
	log.Printf("  - Target eNB: %s", req.TargetENBID)
	log.Printf("  - MME UE S1AP ID: %d", req.MMEUES1APID)
	log.Printf("  - eNB UE S1AP ID: %d", req.ENBUES1APID)
	log.Printf("  - E-RAB ID: %d", req.E_RABID)
	log.Printf("  - UL GTP TEID: %s", req.UL_GTP_TEID)
}

func (m *MME) SendPathSwitchRequestAck(targetEnbId string, mmeUeId int, enbUeId int) *s1ap.PathSwitchRequestAck {
	log.Printf("[MME %s] Sending Path Switch Request Ack", m.ID)
	log.Printf("  - Target eNB: %s", targetEnbId)
	log.Printf("  - MME UE S1AP ID: %d", mmeUeId)
	
	return s1ap.GeneratePathSwitchRequestAck(targetEnbId, mmeUeId, enbUeId)
}
