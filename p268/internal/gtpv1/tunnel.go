package gtpv1

import (
	"encoding/binary"
	"errors"
)

func EncapsulateIPPacket(teid uint32, ipPacket []byte) ([]byte, error) {
	return EncapsulateIPPacketWithSeq(teid, ipPacket, 0)
}

func EncapsulateIPPacketWithSeq(teid uint32, ipPacket []byte, seq uint16) ([]byte, error) {
	if len(ipPacket) == 0 {
		return nil, errors.New("empty IP packet")
	}

	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeGTPU,
		Length:         uint16(len(ipPacket)),
		TEID:           teid,
		SN:             1,
		SequenceNumber: seq,
	}

	headerBytes, err := MarshalHeader(header)
	if err != nil {
		return nil, err
	}

	gtpPacket := make([]byte, len(headerBytes)+len(ipPacket))
	copy(gtpPacket, headerBytes)
	copy(gtpPacket[len(headerBytes):], ipPacket)

	return gtpPacket, nil
}

func DecapsulateIPPacket(gtpPacket []byte) (uint32, []byte, error) {
	teid, _, ipPacket, err := DecapsulateIPPacketWithSeq(gtpPacket)
	return teid, ipPacket, err
}

func DecapsulateIPPacketWithSeq(gtpPacket []byte) (uint32, uint16, []byte, error) {
	header, err := UnmarshalHeader(gtpPacket)
	if err != nil {
		return 0, 0, nil, err
	}

	if header.MessageType != MsgTypeGTPU {
		return 0, 0, nil, errors.New("not a GTP-U packet")
	}

	headerLen := GTPv1HeaderLen
	if header.Ext == 1 || header.SN == 1 || header.PN == 1 {
		headerLen += 4
	}

	if len(gtpPacket) < headerLen {
		return 0, 0, nil, errors.New("packet too short")
	}

	ipPacket := make([]byte, len(gtpPacket)-headerLen)
	copy(ipPacket, gtpPacket[headerLen:])

	return header.TEID, header.SequenceNumber, ipPacket, nil
}

func BuildEchoRequest(seq uint16) ([]byte, error) {
	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeEchoRequest,
		Length:         0,
		TEID:           0,
		SN:             1,
		SequenceNumber: seq,
	}

	return MarshalHeader(header)
}

func BuildEchoResponse(seq uint16, teid uint32) ([]byte, error) {
	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeEchoResponse,
		Length:         0,
		TEID:           teid,
		SN:             1,
		SequenceNumber: seq,
	}

	return MarshalHeader(header)
}

func BuildDeletePDPContextRequest(seq uint16, teid uint32, teardownInd bool) ([]byte, error) {
	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeDeletePDPContextRequest,
		TEID:           teid,
		SN:             1,
		SequenceNumber: seq,
	}

	var ies []byte
	if teardownInd {
		ies = append(ies, EncodeIE(InformationElement{
			Type:   IEITeardownInd,
			Length: 1,
			Data:   []byte{1},
		})...)
	}

	header.Length = uint16(8 + len(ies))
	headerBytes, err := MarshalHeader(header)
	if err != nil {
		return nil, err
	}

	return append(headerBytes, ies...), nil
}

func BuildDeletePDPContextResponse(seq uint16, teid uint32, cause uint8) ([]byte, error) {
	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeDeletePDPContextResponse,
		TEID:           teid,
		SN:             1,
		SequenceNumber: seq,
	}

	causeIE := EncodeIE(InformationElement{
		Type:   IEICause,
		Length: 1,
		Data:   []byte{cause},
	})

	header.Length = uint16(8 + len(causeIE))
	headerBytes, err := MarshalHeader(header)
	if err != nil {
		return nil, err
	}

	return append(headerBytes, causeIE...), nil
}

func GenerateTEID() uint32 {
	return binary.BigEndian.Uint32([]byte{
		byte(0x01),
		byte(0x02),
		byte(0x03),
		byte(0x04),
	})
}
