package lisp

import (
	"encoding/binary"
	"errors"
	"fmt"
	"net"
)

const (
	MessageTypeMapRequest  = 1
	MessageTypeMapReply    = 2
	MessageTypeMapRegister = 3
	MessageTypeMapNotify   = 4

	AFIIPv4 = 1
	AFIIPv6 = 2

	DefaultMapRequestPort = 4342
	DefaultMapServerPort  = 4342
)

type EIDPrefix struct {
	AFI     uint16
	MaskLen uint8
	Prefix  net.IP
}

type RLOC struct {
	AFI       uint16
	IP        net.IP
	Priority  uint8
	Weight    uint8
	MulticastPriority uint8
	MulticastWeight    uint8
	L2Flags   uint8
}

type MapRequest struct {
	Type              uint8
	P                 uint8
	S                 uint8
	p                 uint8
	M                 uint8
	RecordCount       uint8
	Nonce             uint64
	SourceEID         EIDPrefix
	ITRRLOC           RLOC
	EIDRecords        []EIDPrefix
}

type MapReply struct {
	Type              uint8
	P                 uint8
	E                 uint8
	S                 uint8
	RecordCount       uint8
	Nonce             uint64
	Records           []MappingRecord
}

type MappingRecord struct {
	TTL               uint32
	LocatorCount      uint8
	EIDMaskLen        uint8
	ACT               uint8
	A                 uint8
	Authoritative     uint8
	EIDPrefix         EIDPrefix
	Locators          []RLOC
}

func EncodeMapRequest(mr *MapRequest) ([]byte, error) {
	buf := make([]byte, 0, 512)

	flags := uint8(0)
	flags |= (mr.Type & 0x0F) << 4
	flags |= (mr.P & 0x01) << 3
	flags |= (mr.S & 0x01) << 2
	flags |= (mr.p & 0x01) << 1
	flags |= mr.M & 0x01
	buf = append(buf, flags)

	buf = append(buf, mr.RecordCount&0x1F)

	reserved := make([]byte, 6)
	buf = append(buf, reserved...)

	nonceBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(nonceBytes, mr.Nonce)
	buf = append(buf, nonceBytes...)

	srcEidBytes, err := encodeEIDPrefix(&mr.SourceEID)
	if err != nil {
		return nil, err
	}
	buf = append(buf, srcEidBytes...)

	itRlocBytes, err := encodeRLOC(&mr.ITRRLOC)
	if err != nil {
		return nil, err
	}
	buf = append(buf, itRlocBytes...)

	for _, eid := range mr.EIDRecords {
		eidBytes, err := encodeEIDPrefix(&eid)
		if err != nil {
			return nil, err
		}
		buf = append(buf, eidBytes...)
	}

	return buf, nil
}

func DecodeMapRequest(data []byte) (*MapRequest, error) {
	if len(data) < 16 {
		return nil, errors.New("data too short for Map-Request")
	}

	mr := &MapRequest{}
	offset := 0

	mr.Type = (data[offset] >> 4) & 0x0F
	mr.P = (data[offset] >> 3) & 0x01
	mr.S = (data[offset] >> 2) & 0x01
	mr.p = (data[offset] >> 1) & 0x01
	mr.M = data[offset] & 0x01
	offset++

	if mr.Type != MessageTypeMapRequest {
		return nil, fmt.Errorf("not a Map-Request, type=%d", mr.Type)
	}

	mr.RecordCount = data[offset] & 0x1F
	offset++

	offset += 6

	mr.Nonce = binary.BigEndian.Uint64(data[offset:offset+8])
	offset += 8

	srcEid, n, err := decodeEIDPrefix(data[offset:])
	if err != nil {
		return nil, fmt.Errorf("decode SourceEID: %v", err)
	}
	mr.SourceEID = *srcEid
	offset += n

	itRloc, n, err := decodeRLOC(data[offset:])
	if err != nil {
		return nil, fmt.Errorf("decode ITR RLOC: %v", err)
	}
	mr.ITRRLOC = *itRloc
	offset += n

	for i := 0; i < int(mr.RecordCount); i++ {
		eid, n, err := decodeEIDPrefix(data[offset:])
		if err != nil {
			return nil, fmt.Errorf("decode EID record %d: %v", i, err)
		}
		mr.EIDRecords = append(mr.EIDRecords, *eid)
		offset += n
	}

	return mr, nil
}

func EncodeMapReply(mr *MapReply) ([]byte, error) {
	buf := make([]byte, 0, 1024)

	flags := uint8(0)
	flags |= (mr.Type & 0x0F) << 4
	flags |= (mr.P & 0x01) << 3
	flags |= (mr.E & 0x01) << 2
	flags |= (mr.S & 0x01) << 1
	buf = append(buf, flags)

	buf = append(buf, mr.RecordCount&0x1F)

	reserved := make([]byte, 6)
	buf = append(buf, reserved...)

	nonceBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(nonceBytes, mr.Nonce)
	buf = append(buf, nonceBytes...)

	for _, rec := range mr.Records {
		recBytes, err := encodeMappingRecord(&rec)
		if err != nil {
			return nil, err
		}
		buf = append(buf, recBytes...)
	}

	return buf, nil
}

func DecodeMapReply(data []byte) (*MapReply, error) {
	if len(data) < 16 {
		return nil, errors.New("data too short for Map-Reply")
	}

	mr := &MapReply{}
	offset := 0

	mr.Type = (data[offset] >> 4) & 0x0F
	mr.P = (data[offset] >> 3) & 0x01
	mr.E = (data[offset] >> 2) & 0x01
	mr.S = (data[offset] >> 1) & 0x01
	offset++

	if mr.Type != MessageTypeMapReply {
		return nil, fmt.Errorf("not a Map-Reply, type=%d", mr.Type)
	}

	mr.RecordCount = data[offset] & 0x1F
	offset++

	offset += 6

	mr.Nonce = binary.BigEndian.Uint64(data[offset:offset+8])
	offset += 8

	for i := 0; i < int(mr.RecordCount); i++ {
		rec, n, err := decodeMappingRecord(data[offset:])
		if err != nil {
			return nil, fmt.Errorf("decode mapping record %d: %v", i, err)
		}
		mr.Records = append(mr.Records, *rec)
		offset += n
	}

	return mr, nil
}

func encodeEIDPrefix(eid *EIDPrefix) ([]byte, error) {
	buf := make([]byte, 0, 20)

	afiBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(afiBytes, eid.AFI)
	buf = append(buf, afiBytes...)

	buf = append(buf, eid.MaskLen)

	reserved := make([]byte, 1)
	buf = append(buf, reserved...)

	ipBytes := getIPBytes(eid.AFI, eid.Prefix)
	buf = append(buf, ipBytes...)

	return buf, nil
}

func decodeEIDPrefix(data []byte) (*EIDPrefix, int, error) {
	if len(data) < 4 {
		return nil, 0, errors.New("data too short for EID prefix")
	}

	eid := &EIDPrefix{}
	offset := 0

	eid.AFI = binary.BigEndian.Uint16(data[offset:offset+2])
	offset += 2

	eid.MaskLen = data[offset]
	offset++

	offset++

	ipLen := getIPLen(eid.AFI)
	if len(data) < offset+ipLen {
		return nil, 0, errors.New("data too short for IP address")
	}
	eid.Prefix = ipFromBytes(eid.AFI, data[offset:offset+ipLen])
	offset += ipLen

	return eid, offset, nil
}

func encodeRLOC(rloc *RLOC) ([]byte, error) {
	buf := make([]byte, 0, 20)

	afiBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(afiBytes, rloc.AFI)
	buf = append(buf, afiBytes...)

	buf = append(buf, rloc.Priority)
	buf = append(buf, rloc.Weight)
	buf = append(buf, rloc.MulticastPriority)
	buf = append(buf, rloc.MulticastWeight)
	buf = append(buf, rloc.L2Flags)

	reserved := make([]byte, 1)
	buf = append(buf, reserved...)

	ipBytes := getIPBytes(rloc.AFI, rloc.IP)
	buf = append(buf, ipBytes...)

	return buf, nil
}

func decodeRLOC(data []byte) (*RLOC, int, error) {
	if len(data) < 8 {
		return nil, 0, errors.New("data too short for RLOC")
	}

	rloc := &RLOC{}
	offset := 0

	rloc.AFI = binary.BigEndian.Uint16(data[offset:offset+2])
	offset += 2

	rloc.Priority = data[offset]
	offset++
	rloc.Weight = data[offset]
	offset++
	rloc.MulticastPriority = data[offset]
	offset++
	rloc.MulticastWeight = data[offset]
	offset++
	rloc.L2Flags = data[offset]
	offset++

	offset++

	ipLen := getIPLen(rloc.AFI)
	if len(data) < offset+ipLen {
		return nil, 0, errors.New("data too short for RLOC IP address")
	}
	rloc.IP = ipFromBytes(rloc.AFI, data[offset:offset+ipLen])
	offset += ipLen

	return rloc, offset, nil
}

func encodeMappingRecord(rec *MappingRecord) ([]byte, error) {
	buf := make([]byte, 0, 512)

	ttlBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(ttlBytes, rec.TTL)
	buf = append(buf, ttlBytes...)

	buf = append(buf, rec.LocatorCount)
	buf = append(buf, rec.EIDMaskLen)

	actByte := uint8(0)
	actByte |= (rec.ACT & 0x07) << 5
	actByte |= (rec.A & 0x01) << 4
	actByte |= rec.Authoritative & 0x01
	buf = append(buf, actByte)

	reserved := make([]byte, 3)
	buf = append(buf, reserved...)

	mapVersion := make([]byte, 2)
	binary.BigEndian.PutUint16(mapVersion, 1)
	buf = append(buf, mapVersion...)

	eidBytes, err := encodeEIDPrefix(&rec.EIDPrefix)
	if err != nil {
		return nil, err
	}
	buf = append(buf, eidBytes...)

	for _, rloc := range rec.Locators {
		rlocBytes, err := encodeRLOC(&rloc)
		if err != nil {
			return nil, err
		}
		buf = append(buf, rlocBytes...)
	}

	return buf, nil
}

func decodeMappingRecord(data []byte) (*MappingRecord, int, error) {
	if len(data) < 12 {
		return nil, 0, errors.New("data too short for mapping record")
	}

	rec := &MappingRecord{}
	offset := 0

	rec.TTL = binary.BigEndian.Uint32(data[offset:offset+4])
	offset += 4

	rec.LocatorCount = data[offset]
	offset++
	rec.EIDMaskLen = data[offset]
	offset++

	rec.ACT = (data[offset] >> 5) & 0x07
	rec.A = (data[offset] >> 4) & 0x01
	rec.Authoritative = data[offset] & 0x01
	offset++

	offset += 3
	offset += 2

	eid, n, err := decodeEIDPrefix(data[offset:])
	if err != nil {
		return nil, 0, err
	}
	rec.EIDPrefix = *eid
	offset += n

	for i := 0; i < int(rec.LocatorCount); i++ {
		rloc, n, err := decodeRLOC(data[offset:])
		if err != nil {
			return nil, 0, fmt.Errorf("decode RLOC %d: %v", i, err)
		}
		rec.Locators = append(rec.Locators, *rloc)
		offset += n
	}

	return rec, offset, nil
}

func getIPLen(afi uint16) int {
	switch afi {
	case AFIIPv4:
		return 4
	case AFIIPv6:
		return 16
	default:
		return 4
	}
}

func getIPBytes(afi uint16, ip net.IP) []byte {
	if afi == AFIIPv4 {
		return ip.To4()
	}
	if afi == AFIIPv6 {
		return ip.To16()
	}
	return ip.To4()
}

func ipFromBytes(afi uint16, data []byte) net.IP {
	if afi == AFIIPv4 {
		return net.IP(data).To4()
	}
	return net.IP(data)
}

func NewMapRequest(eid net.IP, sourceEID net.IP, itrRLOC net.IP) *MapRequest {
	return &MapRequest{
		Type:        MessageTypeMapRequest,
		P:           0,
		S:           0,
		p:           0,
		M:           0,
		RecordCount: 1,
		Nonce:       uint64(0x1234567890abcdef),
		SourceEID: EIDPrefix{
			AFI:     AFIIPv4,
			MaskLen: 32,
			Prefix:  sourceEID,
		},
		ITRRLOC: RLOC{
			AFI:               AFIIPv4,
			IP:                itrRLOC,
			Priority:          1,
			Weight:            100,
			MulticastPriority: 0,
			MulticastWeight:   0,
			L2Flags:           0,
		},
		EIDRecords: []EIDPrefix{
			{
				AFI:     AFIIPv4,
				MaskLen: 32,
				Prefix:  eid,
			},
		},
	}
}

func NewMapReply(nonce uint64, eid net.IP, rlocs []RLOC) *MapReply {
	record := MappingRecord{
		TTL:          1440,
		LocatorCount: uint8(len(rlocs)),
		EIDMaskLen:   32,
		ACT:          0,
		A:            1,
		Authoritative: 1,
		EIDPrefix: EIDPrefix{
			AFI:     AFIIPv4,
			MaskLen: 32,
			Prefix:  eid,
		},
		Locators: rlocs,
	}

	return &MapReply{
		Type:        MessageTypeMapReply,
		P:           0,
		E:           0,
		S:           0,
		RecordCount: 1,
		Nonce:       nonce,
		Records:     []MappingRecord{record},
	}
}

func NewRLOC(ip net.IP, priority uint8, weight uint8) RLOC {
	return RLOC{
		AFI:               AFIIPv4,
		IP:                ip,
		Priority:          priority,
		Weight:            weight,
		MulticastPriority: 255,
		MulticastWeight:   0,
		L2Flags:           0,
	}
}

type MapRegister struct {
	Type        uint8
	P           uint8
	M           uint8
	WantMapNotify uint8
	RecordCount uint8
	Nonce       uint64
	KeyID       uint16
	AuthDataLen uint16
	AuthData    []byte
	Records     []MapRegisterRecord
}

type MapRegisterRecord struct {
	TTL          uint32
	LocatorCount uint8
	EIDMaskLen   uint8
	ACT          uint8
	A            uint8
	Authoritative uint8
	MapVersion   uint16
	EIDPrefix    EIDPrefix
	Locators     []RLOC
}

type MapNotify struct {
	Type        uint8
	P           uint8
	M           uint8
	RecordCount uint8
	Nonce       uint64
	KeyID       uint16
	AuthDataLen uint16
	AuthData    []byte
	Records     []MapRegisterRecord
}

func EncodeMapRegister(mr *MapRegister) ([]byte, error) {
	buf := make([]byte, 0, 1024)

	flags := uint8(0)
	flags |= (mr.Type & 0x0F) << 4
	flags |= (mr.P & 0x01) << 3
	flags |= (mr.M & 0x01) << 2
	flags |= (mr.WantMapNotify & 0x01) << 1
	buf = append(buf, flags)

	buf = append(buf, mr.RecordCount&0x1F)

	reserved := make([]byte, 6)
	buf = append(buf, reserved...)

	nonceBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(nonceBytes, mr.Nonce)
	buf = append(buf, nonceBytes...)

	keyIDBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(keyIDBytes, mr.KeyID)
	buf = append(buf, keyIDBytes...)

	authLenBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(authLenBytes, mr.AuthDataLen)
	buf = append(buf, authLenBytes...)

	if len(mr.AuthData) > 0 {
		buf = append(buf, mr.AuthData...)
	} else {
		zeroAuth := make([]byte, int(mr.AuthDataLen))
		buf = append(buf, zeroAuth...)
	}

	for _, rec := range mr.Records {
		recBytes, err := encodeMapRegisterRecord(&rec)
		if err != nil {
			return nil, err
		}
		buf = append(buf, recBytes...)
	}

	return buf, nil
}

func DecodeMapRegister(data []byte) (*MapRegister, error) {
	if len(data) < 20 {
		return nil, errors.New("data too short for Map-Register")
	}

	mr := &MapRegister{}
	offset := 0

	mr.Type = (data[offset] >> 4) & 0x0F
	mr.P = (data[offset] >> 3) & 0x01
	mr.M = (data[offset] >> 2) & 0x01
	mr.WantMapNotify = (data[offset] >> 1) & 0x01
	offset++

	if mr.Type != MessageTypeMapRegister {
		return nil, fmt.Errorf("not a Map-Register, type=%d", mr.Type)
	}

	mr.RecordCount = data[offset] & 0x1F
	offset++

	offset += 6

	if len(data) < offset+8 {
		return nil, errors.New("data too short for nonce")
	}
	mr.Nonce = binary.BigEndian.Uint64(data[offset : offset+8])
	offset += 8

	if len(data) < offset+4 {
		return nil, errors.New("data too short for auth fields")
	}
	mr.KeyID = binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	mr.AuthDataLen = binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	if int(mr.AuthDataLen) > 0 && len(data) >= offset+int(mr.AuthDataLen) {
		mr.AuthData = make([]byte, mr.AuthDataLen)
		copy(mr.AuthData, data[offset:offset+int(mr.AuthDataLen)])
		offset += int(mr.AuthDataLen)
	}

	for i := 0; i < int(mr.RecordCount); i++ {
		rec, n, err := decodeMapRegisterRecord(data[offset:])
		if err != nil {
			return nil, fmt.Errorf("decode register record %d: %v", i, err)
		}
		mr.Records = append(mr.Records, *rec)
		offset += n
	}

	return mr, nil
}

func EncodeMapNotify(mn *MapNotify) ([]byte, error) {
	buf := make([]byte, 0, 1024)

	flags := uint8(0)
	flags |= (mn.Type & 0x0F) << 4
	flags |= (mn.P & 0x01) << 3
	flags |= (mn.M & 0x01) << 2
	buf = append(buf, flags)

	buf = append(buf, mn.RecordCount&0x1F)

	reserved := make([]byte, 6)
	buf = append(buf, reserved...)

	nonceBytes := make([]byte, 8)
	binary.BigEndian.PutUint64(nonceBytes, mn.Nonce)
	buf = append(buf, nonceBytes...)

	keyIDBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(keyIDBytes, mn.KeyID)
	buf = append(buf, keyIDBytes...)

	authLenBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(authLenBytes, mn.AuthDataLen)
	buf = append(buf, authLenBytes...)

	if len(mn.AuthData) > 0 {
		buf = append(buf, mn.AuthData...)
	} else {
		zeroAuth := make([]byte, int(mn.AuthDataLen))
		buf = append(buf, zeroAuth...)
	}

	for _, rec := range mn.Records {
		recBytes, err := encodeMapRegisterRecord(&rec)
		if err != nil {
			return nil, err
		}
		buf = append(buf, recBytes...)
	}

	return buf, nil
}

func DecodeMapNotify(data []byte) (*MapNotify, error) {
	if len(data) < 20 {
		return nil, errors.New("data too short for Map-Notify")
	}

	mn := &MapNotify{}
	offset := 0

	mn.Type = (data[offset] >> 4) & 0x0F
	mn.P = (data[offset] >> 3) & 0x01
	mn.M = (data[offset] >> 2) & 0x01
	offset++

	if mn.Type != MessageTypeMapNotify {
		return nil, fmt.Errorf("not a Map-Notify, type=%d", mn.Type)
	}

	mn.RecordCount = data[offset] & 0x1F
	offset++

	offset += 6

	mn.Nonce = binary.BigEndian.Uint64(data[offset : offset+8])
	offset += 8

	mn.KeyID = binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	mn.AuthDataLen = binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	if int(mn.AuthDataLen) > 0 && len(data) >= offset+int(mn.AuthDataLen) {
		mn.AuthData = make([]byte, mn.AuthDataLen)
		copy(mn.AuthData, data[offset:offset+int(mn.AuthDataLen)])
		offset += int(mn.AuthDataLen)
	}

	for i := 0; i < int(mn.RecordCount); i++ {
		rec, n, err := decodeMapRegisterRecord(data[offset:])
		if err != nil {
			return nil, fmt.Errorf("decode notify record %d: %v", i, err)
		}
		mn.Records = append(mn.Records, *rec)
		offset += n
	}

	return mn, nil
}

func encodeMapRegisterRecord(rec *MapRegisterRecord) ([]byte, error) {
	buf := make([]byte, 0, 512)

	ttlBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(ttlBytes, rec.TTL)
	buf = append(buf, ttlBytes...)

	buf = append(buf, rec.LocatorCount)
	buf = append(buf, rec.EIDMaskLen)

	actByte := uint8(0)
	actByte |= (rec.ACT & 0x07) << 5
	actByte |= (rec.A & 0x01) << 4
	actByte |= rec.Authoritative & 0x01
	buf = append(buf, actByte)

	reserved := make([]byte, 3)
	buf = append(buf, reserved...)

	mapVersionBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(mapVersionBytes, rec.MapVersion)
	buf = append(buf, mapVersionBytes...)

	eidBytes, err := encodeEIDPrefix(&rec.EIDPrefix)
	if err != nil {
		return nil, err
	}
	buf = append(buf, eidBytes...)

	for _, rloc := range rec.Locators {
		rlocBytes, err := encodeRLOC(&rloc)
		if err != nil {
			return nil, err
		}
		buf = append(buf, rlocBytes...)
	}

	return buf, nil
}

func decodeMapRegisterRecord(data []byte) (*MapRegisterRecord, int, error) {
	if len(data) < 12 {
		return nil, 0, errors.New("data too short for register record")
	}

	rec := &MapRegisterRecord{}
	offset := 0

	rec.TTL = binary.BigEndian.Uint32(data[offset : offset+4])
	offset += 4

	rec.LocatorCount = data[offset]
	offset++
	rec.EIDMaskLen = data[offset]
	offset++

	rec.ACT = (data[offset] >> 5) & 0x07
	rec.A = (data[offset] >> 4) & 0x01
	rec.Authoritative = data[offset] & 0x01
	offset++

	offset += 3

	rec.MapVersion = binary.BigEndian.Uint16(data[offset : offset+2])
	offset += 2

	eid, n, err := decodeEIDPrefix(data[offset:])
	if err != nil {
		return nil, 0, err
	}
	rec.EIDPrefix = *eid
	offset += n

	for i := 0; i < int(rec.LocatorCount); i++ {
		rloc, n, err := decodeRLOC(data[offset:])
		if err != nil {
			return nil, 0, fmt.Errorf("decode RLOC %d: %v", i, err)
		}
		rec.Locators = append(rec.Locators, *rloc)
		offset += n
	}

	return rec, offset, nil
}

func NewMapRegister(eid net.IP, maskLen uint8, rlocs []RLOC, wantNotify bool) *MapRegister {
	records := make([]MapRegisterRecord, 0, 1)
	records = append(records, MapRegisterRecord{
		TTL:          1440,
		LocatorCount: uint8(len(rlocs)),
		EIDMaskLen:   maskLen,
		ACT:          0,
		A:            1,
		Authoritative: 1,
		MapVersion:   1,
		EIDPrefix: EIDPrefix{
			AFI:     AFIIPv4,
			MaskLen: maskLen,
			Prefix:  eid,
		},
		Locators: rlocs,
	})

	wantNotifyFlag := uint8(0)
	if wantNotify {
		wantNotifyFlag = 1
	}

	return &MapRegister{
		Type:          MessageTypeMapRegister,
		P:             0,
		M:             0,
		WantMapNotify: wantNotifyFlag,
		RecordCount:   1,
		Nonce:         uint64(0xfedcba9876543210),
		KeyID:         0,
		AuthDataLen:   0,
		AuthData:      nil,
		Records:       records,
	}
}

func NewMapNotifyFromRegister(reg *MapRegister) *MapNotify {
	return &MapNotify{
		Type:        MessageTypeMapNotify,
		P:           reg.P,
		M:           reg.M,
		RecordCount: reg.RecordCount,
		Nonce:       reg.Nonce,
		KeyID:       reg.KeyID,
		AuthDataLen: reg.AuthDataLen,
		AuthData:    reg.AuthData,
		Records:     reg.Records,
	}
}
