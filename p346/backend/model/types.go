package model

import "time"

type User struct {
	ID             string `json:"id"`
	Username       string `json:"username"`
	Password       string `json:"password"`
	PrivilegeLevel int    `json:"privilegeLevel"`
	CreatedAt      time.Time `json:"createdAt"`
}

type AuthPolicy struct {
	ID             string            `json:"id"`
	Username       string            `json:"username"`
	CommandPattern string            `json:"commandPattern"`
	ArgPatterns    []string          `json:"argPatterns,omitempty"`
	Allowed        bool              `json:"allowed"`
	Priority       int               `json:"priority"`
	ReturnAttrs    map[string]string `json:"returnAttrs,omitempty"`
	CreatedAt      time.Time         `json:"createdAt"`
}

type SystemConfig struct {
	SharedSecret string    `json:"sharedSecret"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type TacacsSession struct {
	ID        string    `json:"id"`
	SessionID uint32    `json:"sessionId"`
	Username  string    `json:"username"`
	Status    string    `json:"status"`
	StartTime time.Time `json:"startTime"`
	EndTime   time.Time `json:"endTime,omitempty"`
}

type PacketRecord struct {
	ID             string    `json:"id"`
	SessionID      uint32    `json:"sessionId"`
	Type           string    `json:"type"`
	Direction      string    `json:"direction"`
	RawHex         string    `json:"rawHex"`
	DecryptedBody  string    `json:"decryptedBody"`
	HeaderFields   map[string]interface{} `json:"headerFields"`
	BodyFields     map[string]interface{} `json:"bodyFields"`
	Timestamp      time.Time `json:"timestamp"`
}

type AuthRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	SessionID uint32    `json:"sessionId"`
	Request PacketDetail `json:"request"`
	Response PacketDetail `json:"response"`
}

type AuthorizeRequest struct {
	Username  string            `json:"username"`
	Command   string            `json:"command"`
	CmdArgs   []string          `json:"cmdArgs,omitempty"`
	Attrs     map[string]string `json:"attrs,omitempty"`
	SessionID uint32            `json:"sessionId"`
}

type AuthorizeResponse struct {
	Allowed       bool              `json:"allowed"`
	Reason        string            `json:"reason"`
	MatchedPolicy string            `json:"matchedPolicy,omitempty"`
	ReturnAttrs   map[string]string `json:"returnAttrs,omitempty"`
	Request       PacketDetail      `json:"request"`
	Response      PacketDetail      `json:"response"`
}

type AccountingRequest struct {
	Username  string            `json:"username"`
	SessionID uint32            `json:"sessionId"`
	SeqNo     uint8             `json:"seqNo,omitempty"`
	Command   string            `json:"command,omitempty"`
	Status    string            `json:"status"`
	Args      map[string]string `json:"args,omitempty"`
}

type AccountingResponse struct {
	Success  bool         `json:"success"`
	Message  string       `json:"message"`
	SeqNo    uint8        `json:"seqNo,omitempty"`
	Request  PacketDetail `json:"request"`
	Response PacketDetail `json:"response"`
}

type PacketDetail struct {
	Header        TacacsHeaderInfo       `json:"header"`
	RawHex        string                 `json:"rawHex"`
	DecryptedHex  string                 `json:"decryptedHex,omitempty"`
	Fields        map[string]interface{} `json:"fields"`
}

type TacacsHeaderInfo struct {
	Version   uint8  `json:"version"`
	Type      uint8  `json:"type"`
	SeqNo     uint8  `json:"seqNo"`
	Flags     uint8  `json:"flags"`
	SessionID uint32 `json:"sessionId"`
	Length    uint32 `json:"length"`
}

const (
	TacacsVersionMajor = 12
	TacacsVersionMinor = 0

	TacacsTypeAuth       = 1
	TacacsTypeAuthorize  = 2
	TacacsTypeAccounting = 3

	TacacsFlagUnencrypted = 0x00
	TacacsFlagEncrypted   = 0x01
	TacacsFlagSingleConn  = 0x04

	TacacsAuthStatusPass     = 1
	TacacsAuthStatusFail     = 2
	TacacsAuthStatusGetData  = 3
	TacacsAuthStatusGetUser  = 4
	TacacsAuthStatusGetPass  = 5
	TacacsAuthStatusRestart  = 6
	TacacsAuthStatusError    = 7

	TacacsAuthActionLogin        = 1
	TacacsAuthActionSendAuth     = 2
	TacacsAuthActionSendPassword = 3

	TacacsAuthTypeASCII = 1
	TacacsAuthTypePAP   = 2
	TacacsAuthTypeCHAP  = 3
	TacacsAuthTypeMSCHAP = 4

	TacacsAuthSvcNone   = 0
	TacacsAuthSvcLogin  = 1
	TacacsAuthSvcEnable = 2
	TacacsAuthSvcPPP    = 3
	TacacsAuthSvcARAP   = 4

	TacacsAuthorStatusPassAdd     = 1
	TacacsAuthorStatusPassReplace = 2
	TacacsAuthorStatusFail        = 16
	TacacsAuthorStatusError       = 17

	TacacsAcctFlagStart  = 0x02
	TacacsAcctFlagStop   = 0x04
	TacacsAcctFlagUpdate = 0x08
)
