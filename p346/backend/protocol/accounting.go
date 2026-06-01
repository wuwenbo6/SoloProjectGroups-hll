package protocol

import (
	"errors"
	"tacacs-simulator/model"
)

type AcctRequest struct {
	Flags        uint8
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

type AcctReply struct {
	Status uint8
	Flags  uint8
}

func EncodeAcctRequest(a *AcctRequest) ([]byte, error) {
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

	totalLen := 9 + int(a.ArgCnt) + int(a.UserLen) + int(a.PortLen) + int(a.RemAddrLen)
	for _, l := range a.ArgLen {
		totalLen += int(l)
	}

	buf := make([]byte, totalLen)
	buf[0] = a.Flags
	buf[1] = a.AuthenMethod
	buf[2] = a.PrivLvl
	buf[3] = a.AuthenType
	buf[4] = a.AuthenSvc
	buf[5] = a.UserLen
	buf[6] = a.PortLen
	buf[7] = a.RemAddrLen
	buf[8] = a.ArgCnt

	offset := 9
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

func DecodeAcctRequest(data []byte) (*AcctRequest, error) {
	if len(data) < 9 {
		return nil, errors.New("accounting request packet too short")
	}

	a := &AcctRequest{
		Flags:        data[0],
		AuthenMethod: data[1],
		PrivLvl:      data[2],
		AuthenType:   data[3],
		AuthenSvc:    data[4],
		UserLen:      data[5],
		PortLen:      data[6],
		RemAddrLen:   data[7],
		ArgCnt:       data[8],
	}

	argLenOffset := 9
	expectedLen := argLenOffset + int(a.ArgCnt) + int(a.UserLen) + int(a.PortLen) + int(a.RemAddrLen)

	a.ArgLen = make([]uint8, a.ArgCnt)
	for i := 0; i < int(a.ArgCnt); i++ {
		a.ArgLen[i] = data[argLenOffset+i]
		expectedLen += int(a.ArgLen[i])
	}

	if len(data) < expectedLen {
		return nil, errors.New("accounting request packet truncated")
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

func (a *AcctRequest) ToMap() map[string]interface{} {
	args := make([]map[string]interface{}, len(a.Args))
	for i, arg := range a.Args {
		args[i] = map[string]interface{}{
			"length": int(a.ArgLen[i]),
			"value":  arg,
		}
	}

	return map[string]interface{}{
		"flags": map[string]interface{}{
			"raw":    a.Flags,
			"hex":    "0x" + byteToHex(a.Flags),
			"start":  (a.Flags & model.TacacsAcctFlagStart) != 0,
			"stop":   (a.Flags & model.TacacsAcctFlagStop) != 0,
			"update": (a.Flags & model.TacacsAcctFlagUpdate) != 0,
		},
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

func EncodeAcctReply(r *AcctReply) ([]byte, error) {
	buf := make([]byte, 2)
	buf[0] = r.Status
	buf[1] = r.Flags
	return buf, nil
}

func DecodeAcctReply(data []byte) (*AcctReply, error) {
	if len(data) < 2 {
		return nil, errors.New("accounting reply packet too short")
	}
	r := &AcctReply{
		Status: data[0],
		Flags:  data[1],
	}
	return r, nil
}

func (r *AcctReply) ToMap() map[string]interface{} {
	return map[string]interface{}{
		"status": map[string]interface{}{
			"raw":  r.Status,
			"hex":  "0x" + byteToHex(r.Status),
			"name": acctStatusName(r.Status),
		},
		"flags": map[string]interface{}{
			"raw": r.Flags,
			"hex": "0x" + byteToHex(r.Flags),
		},
	}
}

func acctStatusName(s uint8) string {
	switch s {
	case 1:
		return "Success"
	case 2:
		return "Error"
	default:
		return "Unknown"
	}
}
