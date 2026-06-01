package mtp2

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"
)

type MessageFactory struct {
	sequence int
	fsn      int
	bsn      int
	fib      bool
	bib      bool
}

func NewMessageFactory() *MessageFactory {
	return &MessageFactory{
		sequence: 0,
		fsn:      0,
		bsn:      0,
		fib:      false,
		bib:      false,
	}
}

func (mf *MessageFactory) nextSequence() int {
	mf.sequence++
	return mf.sequence
}

func (mf *MessageFactory) nextFSN() int {
	current := mf.fsn
	mf.fsn = (mf.fsn + 1) % 128
	return current
}

func (mf *MessageFactory) toggleFIB() {
	mf.fib = !mf.fib
}

func (mf *MessageFactory) SetBSN(bsn int) {
	mf.bsn = bsn % 128
}

func (mf *MessageFactory) SetBIB(bib bool) {
	mf.bib = bib
}

func (mf *MessageFactory) CreateFISU() *SignalUnit {
	fsn := mf.fsn
	bsn := mf.bsn

	flags := byte(0)
	if mf.fib {
		flags |= 0x02
	}
	if mf.bib {
		flags |= 0x01
	}

	lengthByte := byte(1)

	hexStr := fmt.Sprintf("%02x%02x%02x",
		byte(fsn)|(byte(bsn)<<1),
		flags,
		lengthByte,
	)

	return &SignalUnit{
		Type:      FISU,
		Sequence:  mf.nextSequence(),
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
		FSN:       fsn,
		BSN:       bsn,
		FIB:       mf.fib,
		BIB:       mf.bib,
		Length:    1,
		Hex:       hexStr,
	}
}

func (mf *MessageFactory) CreateLSSU(status LSSUStatus) *SignalUnit {
	fsn := mf.nextFSN()
	bsn := mf.bsn

	flags := byte(0)
	if mf.fib {
		flags |= 0x02
	}
	if mf.bib {
		flags |= 0x01
	}

	var statusByte byte
	switch status {
	case LSSUOutOfService:
		statusByte = 0x01
	case LSSUInService:
		statusByte = 0x02
	case LSSUNormal:
		statusByte = 0x03
	case LSSUEmergency:
		statusByte = 0x04
	case LSSUBusy:
		statusByte = 0x05
	default:
		statusByte = 0x00
	}

	lengthByte := byte(2)
	sfByte := byte(0x01)

	hexStr := fmt.Sprintf("%02x%02x%02x%02x%02x",
		byte(fsn)|(byte(bsn)<<1),
		flags,
		lengthByte,
		sfByte,
		statusByte,
	)

	return &SignalUnit{
		Type:      LSSU,
		Sequence:  mf.nextSequence(),
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
		FSN:       fsn,
		BSN:       bsn,
		FIB:       mf.fib,
		BIB:       mf.bib,
		Length:    2,
		Status:    string(status),
		Hex:       hexStr,
	}
}

func (mf *MessageFactory) CreateMSU(si string, payload []byte) *SignalUnit {
	fsn := mf.nextFSN()
	bsn := mf.bsn

	flags := byte(0)
	if mf.fib {
		flags |= 0x02
	}
	if mf.bib {
		flags |= 0x01
	}

	var sioByte byte
	switch si {
	case "SCCP":
		sioByte = 0x03
	case "ISUP":
		sioByte = 0x05
	case "TUP":
		sioByte = 0x04
	case "MTP-TEST":
		sioByte = 0x02
	default:
		sioByte = 0x00
	}

	if len(payload) == 0 {
		payload = make([]byte, 16)
		rand.Read(payload)
	}

	length := 3 + len(payload)
	lengthByte := byte(length)
	sfByte := byte(0x02)

	hexParts := []string{
		fmt.Sprintf("%02x", byte(fsn)|(byte(bsn)<<1)),
		fmt.Sprintf("%02x", flags),
		fmt.Sprintf("%02x", lengthByte),
		fmt.Sprintf("%02x", sfByte),
		fmt.Sprintf("%02x", sioByte),
	}
	for _, b := range payload {
		hexParts = append(hexParts, fmt.Sprintf("%02x", b))
	}

	hexStr := ""
	for _, p := range hexParts {
		hexStr += p
	}

	return &SignalUnit{
		Type:      MSU,
		Sequence:  mf.nextSequence(),
		Timestamp: time.Now().UnixNano() / int64(time.Millisecond),
		FSN:       fsn,
		BSN:       bsn,
		FIB:       mf.fib,
		BIB:       mf.bib,
		Length:    length,
		SIO:       sioByte,
		SI:        si,
		Payload:   hex.EncodeToString(payload),
		Hex:       hexStr,
	}
}

func (mf *MessageFactory) GetState() (int, int, bool, bool) {
	return mf.fsn, mf.bsn, mf.fib, mf.bib
}
