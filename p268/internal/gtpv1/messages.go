package gtpv1

import (
	"encoding/binary"
	"errors"
)

const (
	IEICause                     = 2
	IEIIMSI                      = 1
	IEIRAI                       = 3
	IEITLLI                      = 4
	IEIPDPType                   = 36
	IEIPDPAddress                = 24
	IEIAccessPointName           = 63
	IEITeardownInd               = 248
	IEINSAPI                     = 34
	IEILinkedTI                  = 23
	IEITrafficFlowTemplate       = 136
	IEIReorderingRequired        = 137
	IEIQualityOfServiceProfile   = 3
	IEIFlowLabelDataI            = 38
	IEIFlowLabelSignalling       = 39
	IEIPrivateExtension          = 255
)

type InformationElement struct {
	Type   uint8
	Length uint16
	Data   []byte
}

type PDPAddress struct {
	PDPTypeOrg  uint8
	PDPTypeNum  uint8
	PDPAddress  []byte
}

type QoSProfile struct {
	AllocationRetentionPriority uint8
	TrafficClass                uint8
	TransferDelay               uint8
	Reliability                 uint8
	PeakThroughput              uint8
	Precedence                  uint8
	MeanThroughput              uint8
}

type CreatePDPContextRequest struct {
	IMSI        string
	TLLI        uint32
	RAI         string
	PDPType     uint8
	PDPAddress  PDPAddress
	APN         string
	QoSProfile  QoSProfile
	NSAPI       uint8
}

type CreatePDPContextResponse struct {
	Cause       uint8
	PDPAddress  PDPAddress
	QoSProfile  QoSProfile
}

func EncodePDPAddress(addr PDPAddress) []byte {
	buf := make([]byte, 2+len(addr.PDPAddress))
	buf[0] = addr.PDPTypeOrg
	buf[1] = addr.PDPTypeNum
	copy(buf[2:], addr.PDPAddress)
	return buf
}

func DecodePDPAddress(data []byte) (PDPAddress, error) {
	if len(data) < 2 {
		return PDPAddress{}, errors.New("PDP address data too short")
	}
	return PDPAddress{
		PDPTypeOrg: data[0],
		PDPTypeNum: data[1],
		PDPAddress: data[2:],
	}, nil
}

func EncodeQoSProfile(qos QoSProfile) []byte {
	buf := make([]byte, 3)
	buf[0] = qos.AllocationRetentionPriority & 0x03
	buf[0] |= (qos.TrafficClass & 0x07) << 2
	buf[1] = qos.TransferDelay & 0x3F
	buf[1] |= (qos.Reliability & 0x03) << 6
	buf[2] = qos.PeakThroughput & 0x0F
	buf[2] |= (qos.Precedence & 0x03) << 4
	buf[2] |= (qos.MeanThroughput & 0x1F) << 6
	return buf
}

func DecodeQoSProfile(data []byte) (QoSProfile, error) {
	if len(data) < 3 {
		return QoSProfile{}, errors.New("QoS profile data too short")
	}
	return QoSProfile{
		AllocationRetentionPriority: data[0] & 0x03,
		TrafficClass:                (data[0] >> 2) & 0x07,
		TransferDelay:               data[1] & 0x3F,
		Reliability:                 (data[1] >> 6) & 0x03,
		PeakThroughput:              data[2] & 0x0F,
		Precedence:                  (data[2] >> 4) & 0x03,
		MeanThroughput:              (data[2] >> 6) & 0x1F,
	}, nil
}

func EncodeIE(ie InformationElement) []byte {
	buf := make([]byte, 3+len(ie.Data))
	buf[0] = ie.Type
	binary.BigEndian.PutUint16(buf[1:3], ie.Length)
	copy(buf[3:], ie.Data)
	return buf
}

func DecodeIE(data []byte) (*InformationElement, error) {
	if len(data) < 3 {
		return nil, errors.New("IE data too short")
	}
	ie := &InformationElement{
		Type:   data[0],
		Length: binary.BigEndian.Uint16(data[1:3]),
	}
	if len(data) < int(3+ie.Length) {
		return nil, errors.New("IE data incomplete")
	}
	ie.Data = make([]byte, ie.Length)
	copy(ie.Data, data[3:3+ie.Length])
	return ie, nil
}

func BuildCreatePDPContextRequest(seq uint16, teid uint32, req CreatePDPContextRequest) ([]byte, error) {
	header := &Header{
		Version:        VersionGTPv1,
		PT:             1,
		MessageType:    MsgTypeCreatePDPContextRequest,
		TEID:           teid,
		SN:             1,
		SequenceNumber: seq,
	}

	var ies []byte

	if req.IMSI != "" {
		imsiData := []byte(req.IMSI)
		ies = append(ies, EncodeIE(InformationElement{
			Type:   IEIIMSI,
			Length: uint16(len(imsiData)),
			Data:   imsiData,
		})...)
	}

	tlliData := make([]byte, 4)
	binary.BigEndian.PutUint32(tlliData, req.TLLI)
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEITLLI,
		Length: 4,
		Data:   tlliData,
	})...)

	raiData := []byte(req.RAI)
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEIRAI,
		Length: uint16(len(raiData)),
		Data:   raiData,
	})...)

	nsapiData := []byte{req.NSAPI}
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEINSAPI,
		Length: 1,
		Data:   nsapiData,
	})...)

	pdpTypeData := []byte{req.PDPType}
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEIPDPType,
		Length: 1,
		Data:   pdpTypeData,
	})...)

	pdpAddrData := EncodePDPAddress(req.PDPAddress)
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEIPDPAddress,
		Length: uint16(len(pdpAddrData)),
		Data:   pdpAddrData,
	})...)

	apnData := []byte(req.APN)
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEIAccessPointName,
		Length: uint16(len(apnData)),
		Data:   apnData,
	})...)

	qosData := EncodeQoSProfile(req.QoSProfile)
	ies = append(ies, EncodeIE(InformationElement{
		Type:   IEIQualityOfServiceProfile,
		Length: 3,
		Data:   qosData,
	})...)

	header.Length = uint16(8 + len(ies))

	headerBytes, err := MarshalHeader(header)
	if err != nil {
		return nil, err
	}

	return append(headerBytes, ies...), nil
}

func ParseCreatePDPContextResponse(data []byte) (*Header, *CreatePDPContextResponse, error) {
	header, err := UnmarshalHeader(data)
	if err != nil {
		return nil, nil, err
	}

	offset := GTPv1HeaderLen
	if header.Ext == 1 || header.SN == 1 || header.PN == 1 {
		offset += 4
	}

	resp := &CreatePDPContextResponse{}

	for offset < len(data) {
		ie, err := DecodeIE(data[offset:])
		if err != nil {
			break
		}

		switch ie.Type {
		case IEICause:
			if ie.Length > 0 {
				resp.Cause = ie.Data[0]
			}
		case IEIPDPAddress:
			addr, err := DecodePDPAddress(ie.Data)
			if err == nil {
				resp.PDPAddress = addr
			}
		case IEIQualityOfServiceProfile:
			qos, err := DecodeQoSProfile(ie.Data)
			if err == nil {
				resp.QoSProfile = qos
			}
		}

		offset += int(3 + ie.Length)
	}

	return header, resp, nil
}
