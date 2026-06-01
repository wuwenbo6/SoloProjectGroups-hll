package protocol

import (
	"encoding/binary"
	"errors"
	"tacacs-simulator/model"
)

type AuthorRequest struct {
	AuthenMethod uint8
	PrivLvl      uint8
	AuthenType   uint8
	AuthenSvc    uint8
	UserLen      uint8
	PortLen      uint8
	RemAddrLen   uint8
	ArgCnt       uint8
	ArgLen       []uint8
	User         string
	Port         string
	RemAddr      string
	Args         []string
}

type AuthorReply struct {
	Status       uint8
	ArgCnt       uint8
	ServerMsgLen uint16
	DataLen      uint16
	ArgLen       []uint8
	ServerMsg    string
	Data         string
	Args         []string
}

func EncodeAuthorRequest(a *AuthorRequest) ([]byte, error) {
	userBytes := []byte(a.User)
	portBytes := []byte(a.Port)
	remAddrBytes := []byte(a.RemAddr)

	a.UserLen = uint8(len(userBytes))
	a.PortLen = uint8(len(portBytes))
	a.RemAddrLen = uint8(len(remAddrBytes))
	a.ArgCnt = uint8(len(a.Args))
	a.ArgLen = make([]uint8, len(a.Args))
	for i, arg := range a.Args {
		a.ArgLen[i] = uint8(len(arg))
	}

	totalLen := 8 + int(a.ArgCnt) + int(a.UserLen) + int(a.PortLen) + int(a.RemAddrLen)
	for _, l := range a.ArgLen {
		totalLen += int(l)
	}

	buf := make([]byte, totalLen)
	buf[0] = a.AuthenMethod
	buf[1] = a.PrivLvl
	buf[2] = a.AuthenType
	buf[3] = a.AuthenSvc
	buf[4] = a.UserLen
	buf[5] = a.PortLen
	buf[6] = a.RemAddrLen
	buf[7] = a.ArgCnt

	offset := 8
	for i, l := range a.ArgLen {
		buf[offset+i] = l
	}
	offset += int(a.ArgCnt)

	copy(buf[offset:offset+int(a.UserLen)], userBytes)
	offset += int(a.UserLen)
	copy(buf[offset:offset+int(a.PortLen)], portBytes)
	offset += int(a.PortLen)
	copy(buf[offset:offset+int(a.RemAddrLen)], remAddrBytes)
	offset += int(a.RemAddrLen)

	for i, arg := range a.Args {
		copy(buf[offset:offset+int(a.ArgLen[i])], []byte(arg))
		offset += int(a.ArgLen[i])
	}

	return buf, nil
}

func DecodeAuthorRequest(data []byte) (*AuthorRequest, error) {
	if len(data) < 8 {
		return nil, errors.New("author request packet too short")
	}

	a := &AuthorRequest{
		AuthenMethod: data[0],
		PrivLvl:      data[1],
		AuthenType:   data[2],
		AuthenSvc:    data[3],
		UserLen:      data[4],
		PortLen:      data[5],
		RemAddrLen:   data[6],
		ArgCnt:       data[7],
	}

	argLenOffset := 8
	expectedLen := argLenOffset + int(a.ArgCnt) + int(a.UserLen) + int(a.PortLen) + int(a.RemAddrLen)

	a.ArgLen = make([]uint8, a.ArgCnt)
	for i := 0; i < int(a.ArgCnt); i++ {
		a.ArgLen[i] = data[argLenOffset+i]
		expectedLen += int(a.ArgLen[i])
	}

	if len(data) < expectedLen {
		return nil, errors.New("author request packet truncated")
	}

	offset := argLenOffset + int(a.ArgCnt)
	a.User = string(data[offset : offset+int(a.UserLen)])
	offset += int(a.UserLen)
	a.Port = string(data[offset : offset+int(a.PortLen)])
	offset += int(a.PortLen)
	a.RemAddr = string(data[offset : offset+int(a.RemAddrLen)])
	offset += int(a.RemAddrLen)

	a.Args = make([]string, a.ArgCnt)
	for i := 0; i < int(a.ArgCnt); i++ {
		a.Args[i] = string(data[offset : offset+int(a.ArgLen[i])])
		offset += int(a.ArgLen[i])
	}

	return a, nil
}

func (a *AuthorRequest) ToMap() map[string]interface{} {
	args := make([]map[string]interface{}, len(a.Args))
	for i, arg := range a.Args {
		args[i] = map[string]interface{}{
			"length": int(a.ArgLen[i]),
			"value":  arg,
		}
	}

	return map[string]interface{}{
		"authenMethod": map[string]interface{}{
			"raw": a.AuthenMethod,
			"hex": "0x" + byteToHex(a.AuthenMethod),
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
		"argCnt":     int(a.ArgCnt),
		"argLen":     a.ArgLen,
		"user":       a.User,
		"port":       a.Port,
		"remAddr":    a.RemAddr,
		"args":       args,
	}
}

func EncodeAuthorReply(r *AuthorReply) ([]byte, error) {
	msgBytes := []byte(r.ServerMsg)
	dataBytes := []byte(r.Data)

	r.ServerMsgLen = uint16(len(msgBytes))
	r.DataLen = uint16(len(dataBytes))
	r.ArgCnt = uint8(len(r.Args))
	r.ArgLen = make([]uint8, len(r.Args))
	for i, arg := range r.Args {
		r.ArgLen[i] = uint8(len(arg))
	}

	totalLen := 6 + int(r.ArgCnt) + int(r.ServerMsgLen) + int(r.DataLen)
	for _, l := range r.ArgLen {
		totalLen += int(l)
	}

	buf := make([]byte, totalLen)
	buf[0] = r.Status
	buf[1] = r.ArgCnt
	binary.BigEndian.PutUint16(buf[2:4], r.ServerMsgLen)
	binary.BigEndian.PutUint16(buf[4:6], r.DataLen)

	offset := 6
	for i, l := range r.ArgLen {
		buf[offset+i] = l
	}
	offset += int(r.ArgCnt)

	copy(buf[offset:offset+int(r.ServerMsgLen)], msgBytes)
	offset += int(r.ServerMsgLen)
	copy(buf[offset:offset+int(r.DataLen)], dataBytes)
	offset += int(r.DataLen)

	for i, arg := range r.Args {
		copy(buf[offset:offset+int(r.ArgLen[i])], []byte(arg))
		offset += int(r.ArgLen[i])
	}

	return buf, nil
}

func DecodeAuthorReply(data []byte) (*AuthorReply, error) {
	if len(data) < 6 {
		return nil, errors.New("author reply packet too short")
	}

	r := &AuthorReply{
		Status:       data[0],
		ArgCnt:       data[1],
		ServerMsgLen: binary.BigEndian.Uint16(data[2:4]),
		DataLen:      binary.BigEndian.Uint16(data[4:6]),
	}

	argLenOffset := 6
	expectedLen := argLenOffset + int(r.ArgCnt) + int(r.ServerMsgLen) + int(r.DataLen)

	r.ArgLen = make([]uint8, r.ArgCnt)
	for i := 0; i < int(r.ArgCnt); i++ {
		r.ArgLen[i] = data[argLenOffset+i]
		expectedLen += int(r.ArgLen[i])
	}

	if len(data) < expectedLen {
		return nil, errors.New("author reply packet truncated")
	}

	offset := argLenOffset + int(r.ArgCnt)
	r.ServerMsg = string(data[offset : offset+int(r.ServerMsgLen)])
	offset += int(r.ServerMsgLen)
	r.Data = string(data[offset : offset+int(r.DataLen)])
	offset += int(r.DataLen)

	r.Args = make([]string, r.ArgCnt)
	for i := 0; i < int(r.ArgCnt); i++ {
		r.Args[i] = string(data[offset : offset+int(r.ArgLen[i])])
		offset += int(r.ArgLen[i])
	}

	return r, nil
}

func (r *AuthorReply) ToMap() map[string]interface{} {
	args := make([]map[string]interface{}, len(r.Args))
	for i, arg := range r.Args {
		args[i] = map[string]interface{}{
			"length": int(r.ArgLen[i]),
			"value":  arg,
		}
	}

	return map[string]interface{}{
		"status": map[string]interface{}{
			"raw":  r.Status,
			"hex":  "0x" + byteToHex(r.Status),
			"name": authorStatusName(r.Status),
		},
		"argCnt":       int(r.ArgCnt),
		"serverMsgLen": int(r.ServerMsgLen),
		"dataLen":      int(r.DataLen),
		"argLen":       r.ArgLen,
		"serverMsg":    r.ServerMsg,
		"data":         r.Data,
		"args":         args,
	}
}

func authorStatusName(s uint8) string {
	switch s {
	case model.TacacsAuthorStatusPassAdd:
		return "Pass Add"
	case model.TacacsAuthorStatusPassReplace:
		return "Pass Replace"
	case model.TacacsAuthorStatusFail:
		return "Fail"
	case model.TacacsAuthorStatusError:
		return "Error"
	default:
		return "Unknown"
	}
}
