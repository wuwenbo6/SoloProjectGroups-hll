package iso8583

import (
	"crypto/des"
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
)

type FieldType int

const (
	FTFixed   FieldType = iota
	FTLLVAR
	FTLLLVAR
)

type FieldSpec struct {
	ID       int
	Name     string
	Type     FieldType
	MaxLen   int
	Encoding string
}

var FieldSpecs = map[int]FieldSpec{
	2:   {2, "Primary Account Number", FTLLVAR, 19, "bcd"},
	3:   {3, "Processing Code", FTFixed, 6, "bcd"},
	4:   {4, "Amount Transaction", FTFixed, 12, "bcd"},
	5:   {5, "Amount Settlement", FTFixed, 12, "bcd"},
	7:   {7, "Transmission Date & Time", FTFixed, 10, "bcd"},
	11:  {11, "System Trace Audit Number", FTFixed, 6, "bcd"},
	12:  {12, "Time Local Transaction", FTFixed, 6, "bcd"},
	13:  {13, "Date Local Transaction", FTFixed, 4, "bcd"},
	14:  {14, "Date Expiration", FTFixed, 4, "bcd"},
	18:  {18, "Merchant Type", FTFixed, 4, "bcd"},
	22:  {22, "POS Entry Mode", FTFixed, 3, "bcd"},
	23:  {23, "Card Sequence Number", FTFixed, 3, "bcd"},
	24:  {24, "Function Code", FTFixed, 3, "bcd"},
	25:  {25, "POS Condition Code", FTFixed, 2, "bcd"},
	32:  {32, "Acquiring Institution ID", FTLLVAR, 11, "bcd"},
	35:  {35, "Track 2 Data", FTLLVAR, 37, "bcd"},
	37:  {37, "Retrieval Reference Number", FTFixed, 12, "ascii"},
	38:  {38, "Authorization ID Response", FTFixed, 6, "ascii"},
	39:  {39, "Response Code", FTFixed, 2, "ascii"},
	41:  {41, "Terminal ID", FTFixed, 8, "ascii"},
	42:  {42, "Merchant ID", FTFixed, 15, "ascii"},
	43:  {43, "Merchant Name/Location", FTFixed, 40, "ascii"},
	48:  {48, "Additional Data", FTLLLVAR, 999, "ascii"},
	49:  {49, "Currency Code", FTFixed, 3, "bcd"},
	55:  {55, "ICC Data", FTLLLVAR, 999, "binary"},
	64:  {64, "MAC", FTFixed, 8, "hex"},
	81:  {81, "Original Amount", FTFixed, 12, "bcd"},
	128: {128, "MAC-2", FTFixed, 8, "hex"},
}

type ParsedField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	HexValue string `json:"hex_value"`
}

type Message struct {
	TPDU   string
	MTI    string
	Fields map[int]string
}

func NewMessage() *Message {
	return &Message{Fields: make(map[int]string)}
}

func (m *Message) SetField(id int, v string) { m.Fields[id] = v }
func (m *Message) GetField(id int) string {
	if v, ok := m.Fields[id]; ok {
		return v
	}
	return ""
}

func encBCD(s string, byteLen int) []byte {
	p := s
	if len(s)%2 != 0 {
		p = "0" + s
	}
	for len(p)/2 < byteLen {
		p = "0" + p
	}
	if len(p)/2 > byteLen {
		p = p[len(p)-byteLen*2:]
	}
	r, _ := hex.DecodeString(p)
	return r
}

func decBCD(b []byte) string {
	return hex.EncodeToString(b)
}

func padRight(s string, l int) string {
	if len(s) >= l {
		return s[:l]
	}
	return s + strings.Repeat(" ", l-len(s))
}

func maxFieldID(fields map[int]string) int {
	mf := 0
	for id := range fields {
		if id > mf {
			mf = id
		}
	}
	return mf
}

func bitmapCount(fields map[int]string) int {
	_, hasField81 := fields[81]
	if hasField81 {
		return 3
	}
	mf := maxFieldID(fields)
	if mf > 128 {
		return 3
	}
	if mf > 64 {
		return 2
	}
	return 1
}

func (m *Message) bitmap() []byte {
	bc := bitmapCount(m.Fields)
	bs := bc * 8
	bm := make([]byte, bs)
	for id := range m.Fields {
		if id < 2 || id > bc*64 {
			continue
		}
		bi := (id - 1) / 8
		bt := uint(7-((id-1)%8))
		bm[bi] |= 1 << bt
	}
	if bc >= 2 {
		bm[0] |= 0x80
	}
	if bc >= 3 {
		bm[8] |= 0x80
	}
	return bm
}

func (m *Message) Pack() ([]byte, error) {
	var out []byte
	if m.TPDU != "" {
		tpduBytes, err := hex.DecodeString(m.TPDU)
		if err != nil {
			return nil, fmt.Errorf("invalid TPDU: %w", err)
		}
		out = append(out, tpduBytes...)
	}
	out = append(out, encBCD(m.MTI, 2)...)
	bm := m.bitmap()
	out = append(out, bm...)
	bc := len(bm) / 8
	maxId := bc * 64
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7-((id-1)%8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		v, has := m.Fields[id]
		if !has {
			continue
		}
		switch spec.Type {
		case FTFixed:
			if spec.Encoding == "bcd" {
				l := (spec.MaxLen + 1) / 2
				out = append(out, encBCD(v, l)...)
			} else if spec.Encoding == "hex" {
				b, err := hex.DecodeString(v)
				if err != nil {
					return nil, fmt.Errorf("field %d hex decode: %w", id, err)
				}
				out = append(out, b...)
			} else if spec.Encoding == "binary" {
				b, err := hex.DecodeString(v)
				if err != nil {
					return nil, fmt.Errorf("field %d binary decode: %w", id, err)
				}
				out = append(out, b...)
			} else {
				out = append(out, []byte(padRight(v, spec.MaxLen))...)
			}
		case FTLLVAR:
			l := len(v)
			lb := []byte(fmt.Sprintf("%02d", l))
			out = append(out, lb...)
			if spec.Encoding == "bcd" {
				out = append(out, encBCD(v, (l+1)/2)...)
			} else if spec.Encoding == "binary" {
				b, err := hex.DecodeString(v)
				if err != nil {
					return nil, fmt.Errorf("field %d binary decode: %w", id, err)
				}
				out = append(out, b...)
			} else {
				out = append(out, []byte(v)...)
			}
		case FTLLLVAR:
			l := len(v)
			lb := []byte(fmt.Sprintf("%03d", l))
			out = append(out, lb...)
			if spec.Encoding == "bcd" {
				out = append(out, encBCD(v, (l+1)/2)...)
			} else if spec.Encoding == "binary" {
				b, err := hex.DecodeString(v)
				if err != nil {
					return nil, fmt.Errorf("field %d binary decode: %w", id, err)
				}
				out = append(out, b...)
			} else {
				out = append(out, []byte(v)...)
			}
		}
	}
	return out, nil
}

func (m *Message) PackWithMAC(macKey string) ([]byte, error) {
	bc := bitmapCount(m.Fields)
	macFieldID := 64
	if bc >= 2 {
		macFieldID = 128
	}
	delete(m.Fields, 64)
	delete(m.Fields, 128)
	packed, err := m.Pack()
	if err != nil {
		return nil, err
	}
	mac, err := CalcANSIX99(packed, macKey)
	if err != nil {
		return nil, err
	}
	m.Fields[macFieldID] = strings.ToUpper(hex.EncodeToString(mac))
	return m.Pack()
}

func CalcANSIX99(data []byte, keyHex string) ([]byte, error) {
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil || len(keyBytes) != 8 {
		return nil, fmt.Errorf("invalid MAC key: must be 16 hex chars (8 bytes)")
	}
	block, err := des.NewCipher(keyBytes)
	if err != nil {
		return nil, err
	}
	padded := make([]byte, len(data))
	copy(padded, data)
	for len(padded)%8 != 0 {
		padded = append(padded, 0x00)
	}
	var prev [8]byte
	for i := 0; i < len(padded); i += 8 {
		var blk [8]byte
		copy(blk[:], padded[i:i+8])
		for j := 0; j < 8; j++ {
			blk[j] ^= prev[j]
		}
		block.Encrypt(prev[:], blk[:])
	}
	mac := make([]byte, 8)
	copy(mac, prev[:])
	return mac, nil
}

func HexDump(b []byte) string {
	var lines []string
	for i := 0; i < len(b); i += 16 {
		end := i + 16
		if end > len(b) {
			end = len(b)
		}
		row := b[i:end]
		hexStr := ""
		for j, c := range row {
			hexStr += fmt.Sprintf("%02X ", c)
			if j == 7 {
				hexStr += " "
			}
		}
		ascii := ""
		for _, c := range row {
			if c >= 32 && c < 127 {
				ascii += string(c)
			} else {
				ascii += "."
			}
		}
		lines = append(lines, fmt.Sprintf("%04X: %-49s |%s|", i, hexStr, ascii))
	}
	return strings.Join(lines, "\n")
}

func Unpack(data []byte) (string, []ParsedField, error) {
	m := NewMessage()
	if len(data) < 2 {
		return "", nil, fmt.Errorf("data too short")
	}
	offset := 0
	if len(data) >= 7 && data[0] == 0x60 {
		m.TPDU = strings.ToUpper(hex.EncodeToString(data[0:5]))
		offset = 5
	}
	if len(data)-offset < 2 {
		return "", nil, fmt.Errorf("data too short after TPDU")
	}
	m.MTI = decBCD(data[offset : offset+2])
	offset += 2
	if offset >= len(data) {
		return m.MTI, nil, nil
	}
	hasSecondary := (data[offset] & 0x80) != 0
	bmLen := 8
	if hasSecondary {
		bmLen = 16
		if offset+8 < len(data) {
			hasTertiary := (data[offset+8] & 0x80) != 0
			if hasTertiary {
				bmLen = 24
			}
		}
	}
	if offset+bmLen > len(data) {
		return m.MTI, nil, fmt.Errorf("bitmap extends past data")
	}
	bm := data[offset : offset+bmLen]
	offset += bmLen
	bc := bmLen / 8
	maxId := bc * 64
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7-((id-1)%8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		switch spec.Type {
		case FTFixed:
			if spec.Encoding == "bcd" {
				l := (spec.MaxLen + 1) / 2
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				v := decBCD(data[offset : offset+l])
				if len(v) > spec.MaxLen {
					v = v[len(v)-spec.MaxLen:]
				}
				m.Fields[id] = v
				offset += l
			} else if spec.Encoding == "hex" || spec.Encoding == "binary" {
				l := spec.MaxLen
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = strings.ToUpper(hex.EncodeToString(data[offset : offset+l]))
				offset += l
			} else {
				l := spec.MaxLen
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = strings.TrimRight(string(data[offset:offset+l]), " ")
				offset += l
			}
		case FTLLVAR:
			if offset+2 > len(data) {
				return m.MTI, nil, fmt.Errorf("field %d LLVAR length extends past data", id)
			}
			l, _ := strconv.Atoi(string(data[offset : offset+2]))
			offset += 2
			if spec.Encoding == "bcd" {
				bl := (l + 1) / 2
				if offset+bl > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				v := decBCD(data[offset : offset+bl])
				if len(v) > l {
					v = v[len(v)-l:]
				}
				m.Fields[id] = v
				offset += bl
			} else if spec.Encoding == "binary" {
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = strings.ToUpper(hex.EncodeToString(data[offset : offset+l]))
				offset += l
			} else {
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = string(data[offset : offset+l])
				offset += l
			}
		case FTLLLVAR:
			if offset+3 > len(data) {
				return m.MTI, nil, fmt.Errorf("field %d LLLVAR length extends past data", id)
			}
			l, _ := strconv.Atoi(string(data[offset : offset+3]))
			offset += 3
			if spec.Encoding == "bcd" {
				bl := (l + 1) / 2
				if offset+bl > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				v := decBCD(data[offset : offset+bl])
				if len(v) > l {
					v = v[len(v)-l:]
				}
				m.Fields[id] = v
				offset += bl
			} else if spec.Encoding == "binary" {
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = strings.ToUpper(hex.EncodeToString(data[offset : offset+l]))
				offset += l
			} else {
				if offset+l > len(data) {
					return m.MTI, nil, fmt.Errorf("field %d extends past data", id)
				}
				m.Fields[id] = string(data[offset : offset+l])
				offset += l
			}
		}
	}
	var fields []ParsedField
	dataOffset := 0
	if m.TPDU != "" {
		fields = append(fields, ParsedField{-1, "TPDU", m.TPDU, m.TPDU})
		dataOffset = 5
	}
	fields = append(fields, ParsedField{0, "MTI", m.MTI, strings.ToUpper(hex.EncodeToString(data[dataOffset : dataOffset+2]))})
	bmHex := strings.ToUpper(hex.EncodeToString(bm))
	bitmapName := "Bitmap"
	if bmLen == 16 {
		bitmapName = "Bitmap (Primary+Secondary)"
	} else if bmLen == 24 {
		bitmapName = "Bitmap (Primary+Secondary+Tertiary)"
	}
	fields = append(fields, ParsedField{1, bitmapName, bmHex, bmHex})
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7-((id-1)%8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		v, has := m.Fields[id]
		if !has {
			continue
		}
		fields = append(fields, ParsedField{id, spec.Name, v, ""})
	}
	return m.MTI, fields, nil
}

func BitmapCount(fields map[int]string) int {
	return bitmapCount(fields)
}

func (m *Message) PackWithTPDU(tpdu string) ([]byte, error) {
	m.TPDU = tpdu
	return m.Pack()
}

func (m *Message) PackWithTPDUAndMAC(tpdu, macKey string) ([]byte, error) {
	m.TPDU = tpdu
	return m.PackWithMAC(macKey)
}
