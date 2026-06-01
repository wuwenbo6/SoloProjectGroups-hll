package protocol

import (
	"encoding/binary"
	"fmt"
)

type ASDU struct {
	TypeID             byte
	SQ                 bool
	NumObj             byte
	CauseTrans         byte
	OA                 byte
	CommonAddr         uint16
	InformationObjects []InformationObject
}

type InformationObject struct {
	IOA      uint32
	Elements []byte
}

func ParseASDU(data []byte) (*ASDU, error) {
	if len(data) < 6 {
		return nil, fmt.Errorf("ASDU data too short: %d", len(data))
	}
	asdu := &ASDU{
		TypeID:     data[0],
		SQ:         (data[1] & 0x80) != 0,
		NumObj:     data[1] & 0x7F,
		CauseTrans: data[2],
		OA:         data[3],
		CommonAddr: binary.LittleEndian.Uint16(data[4:6]),
	}

	offset := 6
	elemSize := elementSizeForType(asdu.TypeID, asdu.SQ)

	if asdu.SQ {
		if asdu.NumObj > 0 && offset+IOASize <= len(data) {
			ioaLow := uint32(data[offset])
			ioaMid := uint32(data[offset+1]) << 8
			ioaHigh := uint32(data[offset+2]) << 16
			baseIOA := ioaLow | ioaMid | ioaHigh
			offset += IOASize

			for i := byte(0); i < asdu.NumObj; i++ {
				if elemSize < 0 || offset+elemSize > len(data) {
					break
				}
				asdu.InformationObjects = append(asdu.InformationObjects, InformationObject{
					IOA:      baseIOA + uint32(i),
					Elements: data[offset : offset+elemSize],
				})
				offset += elemSize
			}
		}
	} else {
		for i := byte(0); i < asdu.NumObj && offset < len(data); i++ {
			if offset+IOASize > len(data) {
				break
			}
			ioaLow := uint32(data[offset])
			ioaMid := uint32(data[offset+1]) << 8
			ioaHigh := uint32(data[offset+2]) << 16
			ioa := ioaLow | ioaMid | ioaHigh
			offset += IOASize

			if elemSize < 0 || offset+elemSize > len(data) {
				if offset <= len(data) {
					asdu.InformationObjects = append(asdu.InformationObjects, InformationObject{
						IOA:      ioa,
						Elements: data[offset:],
					})
				}
				break
			}
			asdu.InformationObjects = append(asdu.InformationObjects, InformationObject{
				IOA:      ioa,
				Elements: data[offset : offset+elemSize],
			})
			offset += elemSize
		}
	}
	return asdu, nil
}

func elementSizeForType(typeID byte, sq bool) int {
	switch typeID {
	case ASDU_M_SP_NA_1:
		return 1
	case ASDU_M_SP_TB_1:
		return 1 + 7
	case ASDU_M_DP_NA_1:
		return 1
	case ASDU_M_DP_TB_1:
		return 1 + 7
	case ASDU_M_ME_NC_1:
		return 5
	case ASDU_M_ME_TF_1:
		return 5 + 7
	case ASDU_C_IC_NA_1:
		return 1
	case ASDU_C_CI_NA_1:
		return 1
	case ASDU_C_CS_NA_1:
		return 7
	case ASDU_F_FR_NA_1:
		return -2
	case ASDU_F_SR_NA_1:
		return 2 + 1 + 2 + 7 + 1
	case ASDU_F_SC_NA_1:
		return 1 + 2 + 1 + 4 + 2
	case ASDU_F_LS_NA_1:
		return 2 + 1 + 2 + 2 + 7
	case ASDU_F_AF_NA_1:
		return 1 + 2 + 1 + 1
	case ASDU_F_SG_NA_1:
		return -2
	default:
		return -1
	}
}

func (a *ASDU) Marshal() []byte {
	buf := make([]byte, 0, 128)
	buf = append(buf, a.TypeID)
	sqNum := a.NumObj & 0x7F
	if a.SQ {
		sqNum |= 0x80
	}
	buf = append(buf, sqNum)
	buf = append(buf, a.CauseTrans)
	buf = append(buf, a.OA)
	buf = append(buf, byte(a.CommonAddr&0xFF))
	buf = append(buf, byte((a.CommonAddr>>8)&0xFF))

	if a.SQ {
		if len(a.InformationObjects) > 0 {
			firstIOA := a.InformationObjects[0].IOA
			buf = append(buf, byte(firstIOA&0xFF))
			buf = append(buf, byte((firstIOA>>8)&0xFF))
			buf = append(buf, byte((firstIOA>>16)&0xFF))
			for i, obj := range a.InformationObjects {
				if i == 0 {
					expectedIOA := firstIOA
					if obj.IOA != expectedIOA {
					}
				}
				buf = append(buf, obj.Elements...)
			}
		}
	} else {
		for _, obj := range a.InformationObjects {
			buf = append(buf, byte(obj.IOA&0xFF))
			buf = append(buf, byte((obj.IOA>>8)&0xFF))
			buf = append(buf, byte((obj.IOA>>16)&0xFF))
			buf = append(buf, obj.Elements...)
		}
	}
	return buf
}

func BuildCICNA1(commonAddr uint16, ioa uint32, qoi byte) []byte {
	asdu := &ASDU{
		TypeID:     ASDU_C_IC_NA_1,
		SQ:         false,
		NumObj:     1,
		CauseTrans: CauseActivation,
		OA:         0,
		CommonAddr: commonAddr,
		InformationObjects: []InformationObject{
			{IOA: ioa, Elements: []byte{qoi}},
		},
	}
	return asdu.Marshal()
}

func BuildMSPNA1(commonAddr uint16, cause byte, objects []InformationObject) []byte {
	asdu := &ASDU{
		TypeID:             ASDU_M_SP_NA_1,
		SQ:                 false,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func BuildMSPNA1SQ(commonAddr uint16, cause byte, baseIOA uint32, elements [][]byte) []byte {
	objects := make([]InformationObject, len(elements))
	for i, elem := range elements {
		objects[i] = InformationObject{
			IOA:      baseIOA + uint32(i),
			Elements: elem,
		}
	}
	asdu := &ASDU{
		TypeID:             ASDU_M_SP_NA_1,
		SQ:                 true,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func BuildMSPTB1(commonAddr uint16, cause byte, objects []InformationObject) []byte {
	asdu := &ASDU{
		TypeID:             ASDU_M_SP_TB_1,
		SQ:                 false,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func BuildMDPTB1(commonAddr uint16, cause byte, objects []InformationObject) []byte {
	asdu := &ASDU{
		TypeID:             ASDU_M_DP_TB_1,
		SQ:                 false,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func BuildMENCTF1(commonAddr uint16, cause byte, objects []InformationObject) []byte {
	asdu := &ASDU{
		TypeID:             ASDU_M_ME_TF_1,
		SQ:                 false,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func BuildMENCTF1SQ(commonAddr uint16, cause byte, baseIOA uint32, elements [][]byte) []byte {
	objects := make([]InformationObject, len(elements))
	for i, elem := range elements {
		objects[i] = InformationObject{
			IOA:      baseIOA + uint32(i),
			Elements: elem,
		}
	}
	asdu := &ASDU{
		TypeID:             ASDU_M_ME_TF_1,
		SQ:                 true,
		NumObj:             byte(len(objects)),
		CauseTrans:         cause,
		OA:                 0,
		CommonAddr:         commonAddr,
		InformationObjects: objects,
	}
	return asdu.Marshal()
}

func (a *ASDU) TypeName() string {
	switch a.TypeID {
	case ASDU_M_SP_NA_1:
		return "M_SP_NA_1"
	case ASDU_M_SP_TB_1:
		return "M_SP_TB_1"
	case ASDU_M_DP_NA_1:
		return "M_DP_NA_1"
	case ASDU_M_DP_TB_1:
		return "M_DP_TB_1"
	case ASDU_M_ME_NC_1:
		return "M_ME_NC_1"
	case ASDU_M_ME_TF_1:
		return "M_ME_TF_1"
	case ASDU_C_IC_NA_1:
		return "C_IC_NA_1"
	case ASDU_C_CI_NA_1:
		return "C_CI_NA_1"
	case ASDU_C_CS_NA_1:
		return "C_CS_NA_1"
	case ASDU_F_FR_NA_1:
		return "F_FR_NA_1"
	case ASDU_F_SR_NA_1:
		return "F_SR_NA_1"
	case ASDU_F_SC_NA_1:
		return "F_SC_NA_1"
	case ASDU_F_LS_NA_1:
		return "F_LS_NA_1"
	case ASDU_F_AF_NA_1:
		return "F_AF_NA_1"
	case ASDU_F_SG_NA_1:
		return "F_SG_NA_1"
	default:
		return fmt.Sprintf("Unknown(0x%02X)", a.TypeID)
	}
}

func (a *ASDU) CauseName() string {
	switch a.CauseTrans {
	case CausePeriodic:
		return "Periodic"
	case CauseBackground:
		return "Background"
	case CauseSpontaneous:
		return "Spontaneous"
	case CauseInitialized:
		return "Initialized"
	case CauseRequest:
		return "Request"
	case CauseActivation:
		return "Activation"
	case CauseActivationCon:
		return "ActivationCon"
	case CauseDeactivation:
		return "Deactivation"
	case CauseInterrogated:
		return "Interrogated"
	case CauseFileTransfer:
		return "FileTransfer"
	default:
		return fmt.Sprintf("Cause(%d)", a.CauseTrans)
	}
}
