package protocol

const (
	StartByte      byte = 0x68
	MaxFrameSize        = 253
	APCIHeaderSize      = 6

	UFrameStartDTACT byte = 0x07
	UFrameStartDTCON byte = 0x0B
	UFrameStopDTACT  byte = 0x13
	UFrameStopDTCON  byte = 0x23
	UFrameTestFRACT  byte = 0x43
	UFrameTestFRCON  byte = 0x83

	CausePeriodic      = 1
	CauseBackground    = 2
	CauseSpontaneous   = 3
	CauseInitialized   = 4
	CauseRequest       = 5
	CauseActivation    = 6
	CauseActivationCon = 7
	CauseDeactivation  = 8
	CauseInterrogated  = 20
	CauseFileTransfer  = 21

	ASDU_M_SP_NA_1 = 1
	ASDU_M_SP_TB_1 = 30
	ASDU_M_DP_NA_1 = 3
	ASDU_M_DP_TB_1 = 31
	ASDU_M_ME_NC_1 = 13
	ASDU_M_ME_TF_1 = 36
	ASDU_C_IC_NA_1 = 100
	ASDU_C_CI_NA_1 = 101
	ASDU_C_CS_NA_1 = 103
	ASDU_F_FR_NA_1 = 120
	ASDU_F_SR_NA_1 = 121
	ASDU_F_SC_NA_1 = 122
	ASDU_F_LS_NA_1 = 123
	ASDU_F_AF_NA_1 = 124
	ASDU_F_SG_NA_1 = 125

	IOASize = 3

	DefaultASDUCommonAddr = 1

	FileSelectDir       = 1
	FileSelectFile      = 2
	FileCallFile        = 3
	FileCallDir         = 4
	FileDeactivate      = 5
	FileDelete          = 6
	FileAckOK           = 0
	FileAckNOK          = 1
	FileAckFileNotFound = 2
	FileAckUnavailable  = 3
)
