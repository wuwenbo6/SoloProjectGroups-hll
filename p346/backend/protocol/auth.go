package protocol

import (
	"encoding/binary"
	"errors"
	"tacacs-simulator/model"
)

type AuthStart struct {
	Action     uint8
	PrivLvl    uint8
	AuthenType uint8
	AuthenSvc  uint8
	UserLen    uint8
	PortLen    uint8
	RemAddrLen uint8
	DataLen    uint16
	User       string
	Port       string
	RemAddr    string
	Data       string
}

type AuthReply struct {
	Status       uint8
	Flags        uint8
	ServerMsgLen uint16
	DataLen      uint16
	ServerMsg    string
	Data         string
}

func EncodeAuthStart(a *AuthStart) ([]byte, error) {
	userBytes := []byte(a.User)
	portBytes := []byte(a.Port)
	remAddrBytes := []byte(a.RemAddr)
	dataBytes := []byte(a.Data)

	a.UserLen = uint8(len(userBytes))
	a.PortLen = uint8(len(portBytes))
	a.RemAddrLen = uint8(len(remAddrBytes))
	a.DataLen = uint16(len(dataBytes))

	buf := make([]byte, 9+int(a.UserLen)+int(a.PortLen)+int(a.RemAddrLen)+int(a.DataLen))
	buf[0] = a.Action
	buf[1] = a.PrivLvl
	buf[2] = a.AuthenType
	buf[3] = a.AuthenSvc
	buf[4] = a.UserLen
	buf[5] = a.PortLen
	buf[6] = a.RemAddrLen
	binary.BigEndian.PutUint16(buf[7:9], a.DataLen)

	offset := 9
	copy(buf[offset:offset+int(a.UserLen)], userBytes)
	offset += int(a.UserLen)
	copy(buf[offset:offset+int(a.PortLen)], portBytes)
	offset += int(a.PortLen)
	copy(buf[offset:offset+int(a.RemAddrLen)], remAddrBytes)
	offset += int(a.RemAddrLen)
	copy(buf[offset:offset+int(a.DataLen)], dataBytes)

	return buf, nil
}

func DecodeAuthStart(data []byte) (*AuthStart, error) {
	if len(data) < 9 {
		return nil, errors.New("auth start packet too short")
	}

	a := &AuthStart{
		Action:     data[0],
		PrivLvl:    data[1],
		AuthenType: data[2],
		AuthenSvc:  data[3],
		UserLen:    data[4],
		PortLen:    data[5],
		RemAddrLen: data[6],
		DataLen:    binary.BigEndian.Uint16(data[7:9]),
	}

	expectedLen := 9 + int(a.UserLen) + int(a.PortLen) + int(a.RemAddrLen) + int(a.DataLen)
	if len(data) < expectedLen {
		return nil, errors.New("auth start packet truncated")
	}

	offset := 9
	a.User = string(data[offset : offset+int(a.UserLen)])
	offset += int(a.UserLen)
	a.Port = string(data[offset : offset+int(a.PortLen)])
	offset += int(a.PortLen)
	a.RemAddr = string(data[offset : offset+int(a.RemAddrLen)])
	offset += int(a.RemAddrLen)
	a.Data = string(data[offset : offset+int(a.DataLen)])

	return a, nil
}

func (a *AuthStart) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"action": map[string]interface{}{
			"raw":  a.Action,
			"hex":  "0x" + byteToHex(a.Action),
			"name": authActionName(a.Action),
		},
		"privLvl": map[string]interface{}{
			"raw": a.PrivLvl,
			"hex": "0x" + byteToHex(a.PrivLvl),
		},
		"authenType": map[string]interface{}{
			"raw":  a.AuthenType,
			"hex":  "0x" + byteToHex(a.AuthenType),
			"name": authTypeName(a.AuthenType),
		},
		"authenSvc": map[string]interface{}{
			"raw":  a.AuthenSvc,
			"hex":  "0x" + byteToHex(a.AuthenSvc),
			"name": authSvcName(a.AuthenSvc),
		},
		"userLen":    int(a.UserLen),
		"portLen":    int(a.PortLen),
		"remAddrLen": int(a.RemAddrLen),
		"dataLen":    int(a.DataLen),
		"user":       a.User,
		"port":       a.Port,
		"remAddr":    a.RemAddr,
		"data":       a.Data,
	}
}

func EncodeAuthReply(r *AuthReply) ([]byte, error) {
	msgBytes := []byte(r.ServerMsg)
	dataBytes := []byte(r.Data)

	r.ServerMsgLen = uint16(len(msgBytes))
	r.DataLen = uint16(len(dataBytes))

	buf := make([]byte, 6+int(r.ServerMsgLen)+int(r.DataLen))
	buf[0] = r.Status
	buf[1] = r.Flags
	binary.BigEndian.PutUint16(buf[2:4], r.ServerMsgLen)
	binary.BigEndian.PutUint16(buf[4:6], r.DataLen)

	offset := 6
	copy(buf[offset:offset+int(r.ServerMsgLen)], msgBytes)
	offset += int(r.ServerMsgLen)
	copy(buf[offset:offset+int(r.DataLen)], dataBytes)

	return buf, nil
}

func DecodeAuthReply(data []byte) (*AuthReply, error) {
	if len(data) < 6 {
		return nil, errors.New("auth reply packet too short")
	}

	r := &AuthReply{
		Status:       data[0],
		Flags:        data[1],
		ServerMsgLen: binary.BigEndian.Uint16(data[2:4]),
		DataLen:      binary.BigEndian.Uint16(data[4:6]),
	}

	expectedLen := 6 + int(r.ServerMsgLen) + int(r.DataLen)
	if len(data) < expectedLen {
		return nil, errors.New("auth reply packet truncated")
	}

	offset := 6
	r.ServerMsg = string(data[offset : offset+int(r.ServerMsgLen)])
	offset += int(r.ServerMsgLen)
	r.Data = string(data[offset : offset+int(r.DataLen)])

	return r, nil
}

func (r *AuthReply) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"status": map[string]interface{}{
			"raw":  r.Status,
			"hex":  "0x" + byteToHex(r.Status),
			"name": authStatusName(r.Status),
		},
		"flags": map[string]interface{}{
			"raw": r.Flags,
			"hex": "0x" + byteToHex(r.Flags),
		},
		"serverMsgLen": int(r.ServerMsgLen),
		"dataLen":      int(r.DataLen),
		"serverMsg":    r.ServerMsg,
		"data":         r.Data,
	}
}

func authActionName(a uint8) string {
	switch a {
	case model.TacacsAuthActionLogin:
		return "Login"
	case model.TacacsAuthActionSendAuth:
		return "Send Auth"
	case model.TacacsAuthActionSendPassword:
		return "Send Password"
	default:
		return "Unknown"
	}
}

func authTypeName(t uint8) string {
	switch t {
	case model.TacacsAuthTypeASCII:
		return "ASCII"
	case model.TacacsAuthTypePAP:
		return "PAP"
	case model.TacacsAuthTypeCHAP:
		return "CHAP"
	case model.TacacsAuthTypeMSCHAP:
		return "MSCHAP"
	default:
		return "Unknown"
	}
}

func authSvcName(s uint8) string {
	switch s {
	case model.TacacsAuthSvcNone:
		return "None"
	case model.TacacsAuthSvcLogin:
		return "Login"
	case model.TacacsAuthSvcEnable:
		return "Enable"
	case model.TacacsAuthSvcPPP:
		return "PPP"
	case model.TacacsAuthSvcARAP:
		return "ARAP"
	default:
		return "Unknown"
	}
}

func authStatusName(s uint8) string {
	switch s {
	case model.TacacsAuthStatusPass:
		return "Pass"
	case model.TacacsAuthStatusFail:
		return "Fail"
	case model.TacacsAuthStatusGetData:
		return "Get Data"
	case model.TacacsAuthStatusGetUser:
		return "Get User"
	case model.TacacsAuthStatusGetPass:
		return "Get Password"
	case model.TacacsAuthStatusRestart:
		return "Restart"
	case model.TacacsAuthStatusError:
		return "Error"
	default:
		return "Unknown"
	}
}
