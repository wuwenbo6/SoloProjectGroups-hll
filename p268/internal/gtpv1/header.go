package gtpv1

import (
	"encoding/binary"
	"errors"
)

const (
	GTPv1HeaderLen    = 8
	GTPv1UHeaderLen   = 8
	GTPv1ExtensionLen = 4

	VersionGTPv1 = 1

	MsgTypeEchoRequest              = 1
	MsgTypeEchoResponse             = 2
	MsgTypeCreatePDPContextRequest  = 16
	MsgTypeCreatePDPContextResponse = 17
	MsgTypeUpdatePDPContextRequest  = 18
	MsgTypeUpdatePDPContextResponse = 19
	MsgTypeDeletePDPContextRequest  = 20
	MsgTypeDeletePDPContextResponse = 21
	MsgTypeErrorIndication          = 26
	MsgTypeGTPU                     = 255
)

type Header struct {
	Version          uint8
	PT               uint8
	Ext              uint8
	SN               uint8
	PN               uint8
	MessageType      uint8
	Length           uint16
	TEID             uint32
	SequenceNumber   uint16
	NPDU             uint8
	NextExtension    uint8
	ExtensionHeaders []ExtensionHeader
}

type ExtensionHeader struct {
	Type    uint8
	Length  uint8
	Content []byte
}

func MarshalHeader(h *Header) ([]byte, error) {
	var headerLen int
	if h.Ext == 1 || h.SN == 1 || h.PN == 1 {
		headerLen = GTPv1HeaderLen + 4
	} else {
		headerLen = GTPv1HeaderLen
	}

	buf := make([]byte, headerLen)

	flags := uint8(0)
	flags |= (h.Version & 0x07) << 5
	flags |= (h.PT & 0x01) << 4
	flags |= (h.Ext & 0x01) << 2
	flags |= (h.SN & 0x01) << 1
	flags |= h.PN & 0x01
	buf[0] = flags

	buf[1] = h.MessageType
	binary.BigEndian.PutUint16(buf[2:4], h.Length)
	binary.BigEndian.PutUint32(buf[4:8], h.TEID)

	if h.Ext == 1 || h.SN == 1 || h.PN == 1 {
		binary.BigEndian.PutUint16(buf[8:10], h.SequenceNumber)
		buf[10] = h.NPDU
		buf[11] = h.NextExtension
	}

	return buf, nil
}

func UnmarshalHeader(data []byte) (*Header, error) {
	if len(data) < GTPv1HeaderLen {
		return nil, errors.New("data too short for GTPv1 header")
	}

	h := &Header{}

	h.Version = (data[0] >> 5) & 0x07
	h.PT = (data[0] >> 4) & 0x01
	h.Ext = (data[0] >> 2) & 0x01
	h.SN = (data[0] >> 1) & 0x01
	h.PN = data[0] & 0x01
	h.MessageType = data[1]
	h.Length = binary.BigEndian.Uint16(data[2:4])
	h.TEID = binary.BigEndian.Uint32(data[4:8])

	if h.Ext == 1 || h.SN == 1 || h.PN == 1 {
		if len(data) < GTPv1HeaderLen+4 {
			return nil, errors.New("data too short for optional fields")
		}
		h.SequenceNumber = binary.BigEndian.Uint16(data[8:10])
		h.NPDU = data[10]
		h.NextExtension = data[11]
	}

	return h, nil
}

func MessageTypeName(msgType uint8) string {
	switch msgType {
	case MsgTypeEchoRequest:
		return "Echo Request"
	case MsgTypeEchoResponse:
		return "Echo Response"
	case MsgTypeCreatePDPContextRequest:
		return "Create PDP Context Request"
	case MsgTypeCreatePDPContextResponse:
		return "Create PDP Context Response"
	case MsgTypeUpdatePDPContextRequest:
		return "Update PDP Context Request"
	case MsgTypeUpdatePDPContextResponse:
		return "Update PDP Context Response"
	case MsgTypeDeletePDPContextRequest:
		return "Delete PDP Context Request"
	case MsgTypeDeletePDPContextResponse:
		return "Delete PDP Context Response"
	case MsgTypeErrorIndication:
		return "Error Indication"
	case MsgTypeGTPU:
		return "GTP-U (User Data)"
	default:
		return "Unknown"
	}
}
