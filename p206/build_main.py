#!/usr/bin/env python3
import os

outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.go")

s1 = r'''package main

import (
	"crypto/cipher"
	"crypto/des"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
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
	2:  {2, "PAN", FTLLVAR, 19, "bcd"},
	3:  {3, "Processing Code", FTFixed, 6, "bcd"},
	4:  {4, "Amount", FTFixed, 12, "bcd"},
	7:  {7, "Transmission DateTime", FTFixed, 10, "bcd"},
	11: {11, "STAN", FTFixed, 6, "bcd"},
	12: {12, "Time Local", FTFixed, 6, "bcd"},
	13: {13, "Date Local", FTFixed, 4, "bcd"},
	14: {14, "Expiry Date", FTFixed, 4, "bcd"},
	18: {18, "Merchant Type", FTFixed, 4, "bcd"},
	22: {22, "POS Entry Mode", FTFixed, 3, "bcd"},
	23: {23, "Card Seq", FTFixed, 3, "bcd"},
	25: {25, "POS Condition", FTFixed, 2, "bcd"},
	32: {32, "Acquirer ID", FTLLVAR, 11, "bcd"},
	37: {37, "RRN", FTFixed, 12, "ascii"},
	38: {38, "Auth Code", FTFixed, 6, "ascii"},
	39: {39, "Response Code", FTFixed, 2, "ascii"},
	41: {41, "Terminal ID", FTFixed, 8, "ascii"},
	42: {42, "Merchant ID", FTFixed, 15, "ascii"},
	43: {43, "Merchant Name", FTFixed, 40, "ascii"},
	48: {48, "Additional Data", FTLLLVAR, 999, "ascii"},
	49: {49, "Currency Code", FTFixed, 3, "bcd"},
	64: {64, "MAC", FTFixed, 8, "hex"},
	81: {81, "Original Amount", FTFixed, 12, "bcd"},
	128: {128, "MAC-2", FTFixed, 8, "hex"},
}

type ParsedField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	HexValue string `json:"hex_value"`
}

type Message struct {
	MTI    string
	Fields map[int]string
}

func NewMessage() *Message {
	return &Message{Fields: make(map[int]string)}
}

func (m *Message) SetField(id int, v string) { m.Fields[id] = v }
func (m *Message) GetField(id int) string    { return m.Fields[id] }
'''

s2 = r'''
func bitmapCount(mf int) int {
	if mf > 128 {
		return 3
	}
	if mf > 64 {
		return 2
	}
	return 1
}

func (m *Message) maxFieldID() int {
	mf := 0
	for id := range m.Fields {
		if id > mf {
			mf = id
		}
	}
	return mf
}

func (m *Message) bitmap() []byte {
	maxField := m.maxFieldID()
	bc := bitmapCount(maxField)
	size := bc * 8
	bm := make([]byte, size)
	for id := range m.Fields {
		if id < 2 || id > 192 {
			continue
		}
		byteIdx := (id - 1) / 8
		bitIdx := uint(7 - ((id - 1) % 8))
		bm[byteIdx] |= 1 << bitIdx
	}
	if bc >= 2 {
		bm[0] |= 0x80
	}
	if bc >= 3 {
		bm[8] |= 0x80
	}
	return bm
}
'''

s3 = r'''
func encBCD(s string, bl int) []byte {
	p := s
	if len(s)%2 != 0 {
		p = "0" + s
	}
	for len(p)/2 < bl {
		p = "0" + p
	}
	if len(p)/2 > bl {
		p = p[len(p)-bl*2:]
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
'''

s4 = r'''
func packField(spec FieldSpec, v string) ([]byte, error) {
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			l := (spec.MaxLen + 1) / 2
			return encBCD(v, l), nil
		} else if spec.Encoding == "hex" {
			b, err := hex.DecodeString(v)
			if err != nil {
				return nil, fmt.Errorf("hex decode field %d: %w", spec.ID, err)
			}
			return b, nil
		}
		return []byte(padRight(v, spec.MaxLen)), nil
	case FTLLVAR:
		l := len(v)
		lb := []byte(fmt.Sprintf("%02d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lb, data...), nil
	case FTLLLVAR:
		l := len(v)
		lll := []byte(fmt.Sprintf("%03d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lll, data...), nil
	}
	return nil, fmt.Errorf("unknown field type for field %d", spec.ID)
}

func (m *Message) Pack() ([]byte, error) {
	var out []byte
	out = append(out, encBCD(m.MTI, 2)...)
	bm := m.bitmap()
	out = append(out, bm...)
	maxId := bitmapCount(m.maxFieldID()) * 64
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
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
		fb, err := packField(spec, v)
		if err != nil {
			return nil, fmt.Errorf("packing field %d: %w", id, err)
		}
		out = append(out, fb...)
	}
	return out, nil
}
'''

s5 = r'''
func unpackField(spec FieldSpec, data []byte) (string, int, error) {
	offset := 0
	dataLen := 0
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			dataLen = (spec.MaxLen + 1) / 2
		} else if spec.Encoding == "hex" {
			dataLen = spec.MaxLen
		} else {
			dataLen = spec.MaxLen
		}
	case FTLLVAR:
		if len(data) < 2 {
			return "", 0, fmt.Errorf("data too short for LLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:2]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLVAR length: %w", err)
		}
		dataLen = l
		offset = 2
	case FTLLLVAR:
		if len(data) < 3 {
			return "", 0, fmt.Errorf("data too short for LLLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:3]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLLVAR length: %w", err)
		}
		dataLen = l
		offset = 3
	}
	if offset+dataLen > len(data) {
		return "", 0, fmt.Errorf("data too short for field %d content", spec.ID)
	}
	raw := data[offset : offset+dataLen]
	hexVal := hex.EncodeToString(raw)
	var val string
	switch spec.Encoding {
	case "bcd":
		val = strings.TrimLeft(hexVal, "0")
		if val == "" {
			val = "0"
		}
	case "ascii":
		val = strings.TrimRight(string(raw), " ")
	case "hex":
		val = strings.ToUpper(hexVal)
	default:
		val = string(raw)
	}
	return val, offset + dataLen, nil
}

func (m *Message) Unpack(data []byte) error {
	m.Fields = make(map[int]string)
	if len(data) < 2 {
		return fmt.Errorf("data too short for MTI")
	}
	m.MTI = decBCD(data[0:2])
	offset := 2
	if offset >= len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasSecondary := (data[offset] & 0x80) != 0
	bmLen := 8
	if hasSecondary {
		bmLen = 16
	}
	if offset+bmLen > len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasTertiary := false
	if hasSecondary && len(data) > offset+8 {
		hasTertiary = (data[offset+8] & 0x80) != 0
	}
	if hasTertiary {
		bmLen = 24
	}
	if offset+bmLen > len(data) {
		bmLen = 16
		hasTertiary = false
	}
	bm := data[offset : offset+bmLen]
	offset += bmLen
	maxId := bmLen * 8
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		if offset >= len(data) {
			break
		}
		v, n, err := unpackField(spec, data[offset:])
		if err != nil {
			break
		}
		m.Fields[id] = v
		offset += n
	}
	return nil
}
'''

s6 = r'''
func encBCDtoHex(v string, maxLen int) string {
	bl := (maxLen + 1) / 2
	b := encBCD(v, bl)
	return strings.ToUpper(hex.EncodeToString(b))
}

func (m *Message) ParseFields(data []byte) []ParsedField {
	var result []ParsedField
	bc := 1
	if len(data) > 3 {
		bitmapStart := 2
		hasSecondary := (data[bitmapStart] & 0x80) != 0
		hasTertiary := false
		if hasSecondary && len(data) > bitmapStart+8 {
			hasTertiary = (data[bitmapStart+8] & 0x80) != 0
		}
		if hasTertiary {
			bc = 3
		} else if hasSecondary {
			bc = 2
		}
	}
	var bmName string
	switch bc {
	case 1:
		bmName = "Bitmap (Primary)"
	case 2:
		bmName = "Bitmap (Primary+Secondary)"
	case 3:
		bmName = "Bitmap (Primary+Secondary+Tertiary)"
	}
	result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	bmEnd := 2 + bc*8
	if bmEnd > len(data) {
		bmEnd = len(data)
	}
	result = append(result, ParsedField{1, bmName, "", strings.ToUpper(hex.EncodeToString(data[2:bmEnd]))})
	for id := 2; id <= 192; id++ {
		v, ok := m.Fields[id]
		if !ok {
			continue
		}
		spec, exists := FieldSpecs[id]
		if !exists {
			continue
		}
		hv := ""
		if spec.Encoding == "hex" {
			hv = strings.ToUpper(v)
		} else if spec.Encoding == "bcd" {
			hv = encBCDtoHex(v, spec.MaxLen)
		} else {
			hv = hex.EncodeToString([]byte(v))
		}
		result = append(result, ParsedField{id, spec.Name, v, hv})
	}
	return result
}
'''

s7 = r'''
func calcANSIX99(data []byte, keyHex string) ([]byte, error) {
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid MAC key hex: %w", err)
	}
	if len(keyBytes) != 8 {
		return nil, fmt.Errorf("MAC key must be 8 bytes, got %d", len(keyBytes))
	}
	block, err := des.NewCipher(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("DES cipher init: %w", err)
	}
	padded := make([]byte, len(data))
	copy(padded, data)
	for len(padded)%8 != 0 {
		padded = append(padded, 0x00)
	}
	var prev [8]byte
	dst := make([]byte, 8)
	for i := 0; i < len(padded); i += 8 {
		var xored [8]byte
		for j := 0; j < 8; j++ {
			xored[j] = padded[i+j] ^ prev[j]
		}
		block.Encrypt(dst, xored[:])
		copy(prev[:], dst)
	}
	mac := make([]byte, 8)
	copy(mac, prev[:])
	return mac, nil
}

func getMACKey() string {
	key := os.Getenv("EFTPOS_MAC_KEY")
	if key == "" {
		return "0123456789ABCDEF"
	}
	return strings.ToUpper(key)
}

func (m *Message) PackWithMAC() ([]byte, error) {
	delete(m.Fields, 64)
	delete(m.Fields, 128)
	packed, err := m.Pack()
	if err != nil {
		return nil, err
	}
	macKey := getMACKey()
	mac, err := calcANSIX99(packed, macKey)
	if err != nil {
		return nil, fmt.Errorf("MAC calculation: %w", err)
	}
	m.SetField(64, strings.ToUpper(hex.EncodeToString(mac)))
	return m.Pack()
}
'''

s8 = r'''
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
'''

s9 = r'''
type Terminal struct {
	TerminalID   string
	MerchantID   string
	MerchantName string
	STAN         int
	InstID       string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:   "TERM0010",
		MerchantID:   "123456789012345",
		MerchantName: "ACM STORE      SYDNEY    AU",
		STAN:         1,
		InstID:       "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func (t *Terminal) BuildAuth(pan, amount, expiry string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}

func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(37, rrn)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}
'''

s10 = r'''
type Host struct{}

func NewHost() *Host { return &Host{} }

func (h *Host) ProcessAuth(req *Message, useMAC bool) *Message {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp := NewMessage()
	resp.MTI = "0110"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(37, fmt.Sprintf("%012d", r.Int63n(10000000000000)))
	if r.Intn(100) < 80 {
		resp.SetField(39, "00")
		resp.SetField(38, fmt.Sprintf("%06d", r.Intn(1000000)))
	} else {
		resp.SetField(39, "05")
		resp.SetField(38, "      ")
	}
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}

func (h *Host) ProcessReversal(req *Message, useMAC bool) *Message {
	resp := NewMessage()
	resp.MTI = "0410"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}
'''

s11 = r'''
type TxRequest struct {
	Type   string `json:"type"`
	PAN    string `json:"pan"`
	Amount string `json:"amount"`
	Expiry string `json:"expiry"`
	RRN    string `json:"rrn"`
	UseMAC bool   `json:"use_mac"`
}

type TxResponse struct {
	RequestHex      string        `json:"request_hex"`
	RequestHexDump  string        `json:"request_hexdump"`
	RequestFields   []ParsedField `json:"request_fields"`
	ResponseHex     string        `json:"response_hex"`
	ResponseHexDump string        `json:"response_hexdump"`
	ResponseFields  []ParsedField `json:"response_fields"`
	MACKey          string        `json:"mac_key,omitempty"`
	MACAlgorithm    string        `json:"mac_algorithm,omitempty"`
	BitmapCount     int           `json:"bitmap_count"`
}

var terminalInst = NewTerminal()
var hostInst = NewHost()
'''

s12 = r'''
func handleTx(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	var tx TxRequest
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
		return
	}
	useMAC := tx.UseMAC
	var reqMsg, respMsg *Message
	if tx.Type == "reversal" {
		reqMsg = terminalInst.BuildReversal(tx.PAN, tx.Amount, tx.Expiry, tx.RRN, useMAC)
		respMsg = hostInst.ProcessReversal(reqMsg, useMAC)
	} else {
		reqMsg = terminalInst.BuildAuth(tx.PAN, tx.Amount, tx.Expiry, useMAC)
		respMsg = hostInst.ProcessAuth(reqMsg, useMAC)
	}
	var reqData []byte
	var respData []byte
	var err error
	if useMAC {
		reqData, err = reqMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	} else {
		reqData, err = reqMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	}
	reqParsed := NewMessage()
	reqParsed.Unpack(reqData)
	respParsed := NewMessage()
	respParsed.Unpack(respData)
	bc := bitmapCount(reqParsed.maxFieldID())
	macKey := ""
	macAlgo := ""
	if useMAC {
		macKey = getMACKey()
		macAlgo = "ANSI X9.9"
	}
	result := TxResponse{
		RequestHex:      strings.ToUpper(hex.EncodeToString(reqData)),
		RequestHexDump:  HexDump(reqData),
		RequestFields:   reqParsed.ParseFields(reqData),
		ResponseHex:     strings.ToUpper(hex.EncodeToString(respData)),
		ResponseHexDump: HexDump(respData),
		ResponseFields:  respParsed.ParseFields(respData),
		MACKey:          macKey,
		MACAlgorithm:    macAlgo,
		BitmapCount:     bc,
	}
	json.NewEncoder(w).Encode(result)
}

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)
	http.HandleFunc("/api/tx", handleTx)
	fmt.Println("EFTPOS Simulator running on http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
'''

sections = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12]

with open(outfile, "w") as f:
    for s in sections:
        f.write(s)

print(f"Generated {outfile} ({sum(len(s) for s in sections)} bytes)")
"""Generate main.go for the EFTPOS ISO 8583 Simulator."""

import os

outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.go")

s1 = r'''package main

import (
	"crypto/cipher"
	"crypto/des"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
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
	2:  {2, "PAN", FTLLVAR, 19, "bcd"},
	3:  {3, "Processing Code", FTFixed, 6, "bcd"},
	4:  {4, "Amount", FTFixed, 12, "bcd"},
	7:  {7, "Transmission DateTime", FTFixed, 10, "bcd"},
	11: {11, "STAN", FTFixed, 6, "bcd"},
	12: {12, "Time Local", FTFixed, 6, "bcd"},
	13: {13, "Date Local", FTFixed, 4, "bcd"},
	14: {14, "Expiry Date", FTFixed, 4, "bcd"},
	18: {18, "Merchant Type", FTFixed, 4, "bcd"},
	22: {22, "POS Entry Mode", FTFixed, 3, "bcd"},
	23: {23, "Card Seq", FTFixed, 3, "bcd"},
	25: {25, "POS Condition", FTFixed, 2, "bcd"},
	32: {32, "Acquirer ID", FTLLVAR, 11, "bcd"},
	37: {37, "RRN", FTFixed, 12, "ascii"},
	38: {38, "Auth Code", FTFixed, 6, "ascii"},
	39: {39, "Response Code", FTFixed, 2, "ascii"},
	41: {41, "Terminal ID", FTFixed, 8, "ascii"},
	42: {42, "Merchant ID", FTFixed, 15, "ascii"},
	43: {43, "Merchant Name", FTFixed, 40, "ascii"},
	48: {48, "Additional Data", FTLLLVAR, 999, "ascii"},
	49: {49, "Currency Code", FTFixed, 3, "bcd"},
	64: {64, "MAC", FTFixed, 8, "hex"},
	81: {81, "Original Amount", FTFixed, 12, "bcd"},
	128: {128, "MAC-2", FTFixed, 8, "hex"},
}

type ParsedField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	HexValue string `json:"hex_value"`
}

type Message struct {
	MTI    string
	Fields map[int]string
}

func NewMessage() *Message {
	return &Message{Fields: make(map[int]string)}
}

func (m *Message) SetField(id int, v string) { m.Fields[id] = v }
func (m *Message) GetField(id int) string    { return m.Fields[id] }
'''

s2 = r'''
func bitmapCount(mf int) int {
	if mf > 128 {
		return 3
	}
	if mf > 64 {
		return 2
	}
	return 1
}

func (m *Message) bitmap() []byte {
	maxField := 0
	for id := range m.Fields {
		if id > maxField {
			maxField = id
		}
	}
	bc := bitmapCount(maxField)
	size := bc * 8
	bm := make([]byte, size)
	for id := range m.Fields {
		if id < 2 || id > 192 {
			continue
		}
		byteIdx := (id - 1) / 8
		bitIdx := uint(7 - ((id - 1) % 8))
		bm[byteIdx] |= 1 << bitIdx
	}
	if bc >= 2 {
		bm[0] |= 0x80
	}
	if bc >= 3 {
		bm[8] |= 0x80
	}
	return bm
}

func (m *Message) maxFieldID() int {
	mf := 0
	for id := range m.Fields {
		if id > mf {
			mf = id
		}
	}
	return mf
}
'''

s3 = r'''
func encBCD(s string, bl int) []byte {
	p := s
	if len(s)%2 != 0 {
		p = "0" + s
	}
	for len(p)/2 < bl {
		p = "0" + p
	}
	if len(p)/2 > bl {
		p = p[len(p)-bl*2:]
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
'''

s4 = r'''
func packField(spec FieldSpec, v string) ([]byte, error) {
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			l := (spec.MaxLen + 1) / 2
			return encBCD(v, l), nil
		} else if spec.Encoding == "hex" {
			b, err := hex.DecodeString(v)
			if err != nil {
				return nil, fmt.Errorf("hex decode field %d: %w", spec.ID, err)
			}
			return b, nil
		}
		return []byte(padRight(v, spec.MaxLen)), nil
	case FTLLVAR:
		l := len(v)
		lb := []byte(fmt.Sprintf("%02d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lb, data...), nil
	case FTLLLVAR:
		l := len(v)
		lll := []byte(fmt.Sprintf("%03d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lll, data...), nil
	}
	return nil, fmt.Errorf("unknown field type for field %d", spec.ID)
}

func (m *Message) Pack() ([]byte, error) {
	var out []byte
	out = append(out, encBCD(m.MTI, 2)...)
	bm := m.bitmap()
	out = append(out, bm...)
	maxId := bitmapCount(m.maxFieldID()) * 64
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
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
		fb, err := packField(spec, v)
		if err != nil {
			return nil, fmt.Errorf("packing field %d: %w", id, err)
		}
		out = append(out, fb...)
	}
	return out, nil
}
'''

s5 = r'''
func unpackField(spec FieldSpec, data []byte) (string, int, error) {
	offset := 0
	dataLen := 0
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			dataLen = (spec.MaxLen + 1) / 2
		} else if spec.Encoding == "hex" {
			dataLen = spec.MaxLen
		} else {
			dataLen = spec.MaxLen
		}
	case FTLLVAR:
		if len(data) < 2 {
			return "", 0, fmt.Errorf("data too short for LLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:2]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLVAR length: %w", err)
		}
		dataLen = l
		offset = 2
	case FTLLLVAR:
		if len(data) < 3 {
			return "", 0, fmt.Errorf("data too short for LLLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:3]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLLVAR length: %w", err)
		}
		dataLen = l
		offset = 3
	}
	if offset+dataLen > len(data) {
		return "", 0, fmt.Errorf("data too short for field %d content", spec.ID)
	}
	raw := data[offset : offset+dataLen]
	hexVal := hex.EncodeToString(raw)
	var val string
	switch spec.Encoding {
	case "bcd":
		val = strings.TrimLeft(hexVal, "0")
		if val == "" {
			val = "0"
		}
	case "ascii":
		val = strings.TrimRight(string(raw), " ")
	case "hex":
		val = strings.ToUpper(hexVal)
	default:
		val = string(raw)
	}
	return val, offset + dataLen, nil
}

func (m *Message) Unpack(data []byte) error {
	m.Fields = make(map[int]string)
	if len(data) < 2 {
		return fmt.Errorf("data too short for MTI")
	}
	m.MTI = decBCD(data[0:2])
	offset := 2
	if offset >= len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasSecondary := (data[offset] & 0x80) != 0
	bmLen := 8
	if hasSecondary {
		bmLen = 16
	}
	if offset+bmLen > len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasTertiary := false
	if hasSecondary && len(data) > offset+8 {
		hasTertiary = (data[offset+8] & 0x80) != 0
	}
	if hasTertiary {
		bmLen = 24
	}
	if offset+bmLen > len(data) {
		bmLen = 16
		hasTertiary = false
	}
	bm := data[offset : offset+bmLen]
	offset += bmLen
	maxId := bmLen * 8
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		if offset >= len(data) {
			break
		}
		v, n, err := unpackField(spec, data[offset:])
		if err != nil {
			break
		}
		m.Fields[id] = v
		offset += n
	}
	return nil
}
'''

s6 = r'''
func encBCDtoHex(v string, maxLen int) string {
	bl := (maxLen + 1) / 2
	b := encBCD(v, bl)
	return strings.ToUpper(hex.EncodeToString(b))
}

func (m *Message) ParseFields(data []byte) []ParsedField {
	var result []ParsedField
	bc := 1
	if len(data) > 3 {
		bitmapStart := 2
		hasSecondary := (data[bitmapStart] & 0x80) != 0
		hasTertiary := false
		if hasSecondary && len(data) > bitmapStart+8 {
			hasTertiary = (data[bitmapStart+8] & 0x80) != 0
		}
		if hasTertiary {
			bc = 3
		} else if hasSecondary {
			bc = 2
		}
	}
	var bmName string
	switch bc {
	case 1:
		bmName = "Bitmap (Primary)"
	case 2:
		bmName = "Bitmap (Primary+Secondary)"
	case 3:
		bmName = "Bitmap (Primary+Secondary+Tertiary)"
	}
	result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	bmEnd := 2 + bc*8
	if bmEnd > len(data) {
		bmEnd = len(data)
	}
	result = append(result, ParsedField{1, bmName, "", strings.ToUpper(hex.EncodeToString(data[2:bmEnd]))})
	for id := 2; id <= 192; id++ {
		v, ok := m.Fields[id]
		if !ok {
			continue
		}
		spec, exists := FieldSpecs[id]
		if !exists {
			continue
		}
		hv := ""
		if spec.Encoding == "hex" {
			hv = strings.ToUpper(v)
		} else if spec.Encoding == "bcd" {
			hv = encBCDtoHex(v, spec.MaxLen)
		} else {
			hv = hex.EncodeToString([]byte(v))
		}
		result = append(result, ParsedField{id, spec.Name, v, hv})
	}
	return result
}
'''

s7 = r'''
func calcANSIX99(data []byte, keyHex string) ([]byte, error) {
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid MAC key hex: %w", err)
	}
	if len(keyBytes) != 8 {
		return nil, fmt.Errorf("MAC key must be 8 bytes, got %d", len(keyBytes))
	}
	block, err := des.NewCipher(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("DES cipher init: %w", err)
	}
	padded := make([]byte, len(data))
	copy(padded, data)
	for len(padded)%8 != 0 {
		padded = append(padded, 0x00)
	}
	var prev [8]byte
	dst := make([]byte, 8)
	for i := 0; i < len(padded); i += 8 {
		var xored [8]byte
		for j := 0; j < 8; j++ {
			xored[j] = padded[i+j] ^ prev[j]
		}
		block.Encrypt(dst, xored[:])
		copy(prev[:], dst)
	}
	mac := make([]byte, 8)
	copy(mac, prev[:])
	return mac, nil
}

func getMACKey() string {
	key := os.Getenv("EFTPOS_MAC_KEY")
	if key == "" {
		return "0123456789ABCDEF"
	}
	return strings.ToUpper(key)
}

func (m *Message) PackWithMAC() ([]byte, error) {
	delete(m.Fields, 64)
	delete(m.Fields, 128)
	packed, err := m.Pack()
	if err != nil {
		return nil, err
	}
	macKey := getMACKey()
	mac, err := calcANSIX99(packed, macKey)
	if err != nil {
		return nil, fmt.Errorf("MAC calculation: %w", err)
	}
	m.SetField(64, strings.ToUpper(hex.EncodeToString(mac)))
	return m.Pack()
}
'''

s8 = r'''
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
'''

s9 = r'''
type Terminal struct {
	TerminalID   string
	MerchantID   string
	MerchantName string
	STAN         int
	InstID       string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:   "TERM0010",
		MerchantID:   "123456789012345",
		MerchantName: "ACM STORE      SYDNEY    AU",
		STAN:         1,
		InstID:       "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func (t *Terminal) BuildAuth(pan, amount, expiry string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}

func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(37, rrn)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}
'''

s10 = r'''
type Host struct{}

func NewHost() *Host { return &Host{} }

func (h *Host) ProcessAuth(req *Message, useMAC bool) *Message {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp := NewMessage()
	resp.MTI = "0110"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(37, fmt.Sprintf("%012d", r.Int63n(10000000000000)))
	if r.Intn(100) < 80 {
		resp.SetField(39, "00")
		resp.SetField(38, fmt.Sprintf("%06d", r.Intn(1000000)))
	} else {
		resp.SetField(39, "05")
		resp.SetField(38, "      ")
	}
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}

func (h *Host) ProcessReversal(req *Message, useMAC bool) *Message {
	resp := NewMessage()
	resp.MTI = "0410"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}
'''

s11 = r'''
type TxRequest struct {
	Type   string `json:"type"`
	PAN    string `json:"pan"`
	Amount string `json:"amount"`
	Expiry string `json:"expiry"`
	RRN    string `json:"rrn"`
	UseMAC bool   `json:"use_mac"`
}

type TxResponse struct {
	RequestHex      string        `json:"request_hex"`
	RequestHexDump  string        `json:"request_hexdump"`
	RequestFields   []ParsedField `json:"request_fields"`
	ResponseHex     string        `json:"response_hex"`
	ResponseHexDump string        `json:"response_hexdump"`
	ResponseFields  []ParsedField `json:"response_fields"`
	MACKey          string        `json:"mac_key,omitempty"`
	MACAlgorithm    string        `json:"mac_algorithm,omitempty"`
	BitmapCount     int           `json:"bitmap_count"`
}

var terminalInst = NewTerminal()
var hostInst = NewHost()
'''

s12 = r'''
func handleTx(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	var tx TxRequest
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
		return
	}
	useMAC := tx.UseMAC
	var reqMsg, respMsg *Message
	if tx.Type == "reversal" {
		reqMsg = terminalInst.BuildReversal(tx.PAN, tx.Amount, tx.Expiry, tx.RRN, useMAC)
		respMsg = hostInst.ProcessReversal(reqMsg, useMAC)
	} else {
		reqMsg = terminalInst.BuildAuth(tx.PAN, tx.Amount, tx.Expiry, useMAC)
		respMsg = hostInst.ProcessAuth(reqMsg, useMAC)
	}
	var reqData []byte
	var respData []byte
	var err error
	if useMAC {
		reqData, err = reqMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	} else {
		reqData, err = reqMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	}
	reqParsed := NewMessage()
	reqParsed.Unpack(reqData)
	respParsed := NewMessage()
	respParsed.Unpack(respData)
	bc := bitmapCount(reqParsed.maxFieldID())
	macKey := ""
	macAlgo := ""
	if useMAC {
		macKey = getMACKey()
		macAlgo = "ANSI X9.9"
	}
	result := TxResponse{
		RequestHex:      strings.ToUpper(hex.EncodeToString(reqData)),
		RequestHexDump:  HexDump(reqData),
		RequestFields:   reqParsed.ParseFields(reqData),
		ResponseHex:     strings.ToUpper(hex.EncodeToString(respData)),
		ResponseHexDump: HexDump(respData),
		ResponseFields:  respParsed.ParseFields(respData),
		MACKey:          macKey,
		MACAlgorithm:    macAlgo,
		BitmapCount:     bc,
	}
	json.NewEncoder(w).Encode(result)
}

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)
	http.HandleFunc("/api/tx", handleTx)
	fmt.Println("EFTPOS Simulator running on http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
'''

sections = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12]

with open(outfile, "w") as f:
    for s in sections:
        f.write(s)

print(f"Generated {outfile} ({sum(len(s) for s in sections)} bytes)")
"""Generate main.go for the EFTPOS ISO 8583 Simulator."""

import os

outfile = os.path.join(os.path.dirname(os.path.abspath(__file__)), "main.go")

s1 = r'''package main

import (
	"crypto/cipher"
	"crypto/des"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
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
	2:  {2, "PAN", FTLLVAR, 19, "bcd"},
	3:  {3, "Processing Code", FTFixed, 6, "bcd"},
	4:  {4, "Amount", FTFixed, 12, "bcd"},
	7:  {7, "Transmission DateTime", FTFixed, 10, "bcd"},
	11: {11, "STAN", FTFixed, 6, "bcd"},
	12: {12, "Time Local", FTFixed, 6, "bcd"},
	13: {13, "Date Local", FTFixed, 4, "bcd"},
	14: {14, "Expiry Date", FTFixed, 4, "bcd"},
	18: {18, "Merchant Type", FTFixed, 4, "bcd"},
	22: {22, "POS Entry Mode", FTFixed, 3, "bcd"},
	23: {23, "Card Seq", FTFixed, 3, "bcd"},
	25: {25, "POS Condition", FTFixed, 2, "bcd"},
	32: {32, "Acquirer ID", FTLLVAR, 11, "bcd"},
	37: {37, "RRN", FTFixed, 12, "ascii"},
	38: {38, "Auth Code", FTFixed, 6, "ascii"},
	39: {39, "Response Code", FTFixed, 2, "ascii"},
	41: {41, "Terminal ID", FTFixed, 8, "ascii"},
	42: {42, "Merchant ID", FTFixed, 15, "ascii"},
	43: {43, "Merchant Name", FTFixed, 40, "ascii"},
	48: {48, "Additional Data", FTLLLVAR, 999, "ascii"},
	49: {49, "Currency Code", FTFixed, 3, "bcd"},
	64: {64, "MAC", FTFixed, 8, "hex"},
	81: {81, "Original Amount", FTFixed, 12, "bcd"},
	128: {128, "MAC-2", FTFixed, 8, "hex"},
}

type ParsedField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	HexValue string `json:"hex_value"`
}

type Message struct {
	MTI    string
	Fields map[int]string
}

func NewMessage() *Message {
	return &Message{Fields: make(map[int]string)}
}

func (m *Message) SetField(id int, v string) { m.Fields[id] = v }
func (m *Message) GetField(id int) string    { return m.Fields[id] }
'''

s2 = r'''
func bitmapCount(mf int) int {
	if mf > 128 {
		return 3
	}
	if mf > 64 {
		return 2
	}
	return 1
}

func (m *Message) bitmap() []byte {
	maxField := 0
	for id := range m.Fields {
		if id > maxField {
			maxField = id
		}
	}
	bc := bitmapCount(maxField)
	size := bc * 8
	bm := make([]byte, size)
	for id := range m.Fields {
		if id < 2 || id > 192 {
			continue
		}
		byteIdx := (id - 1) / 8
		bitIdx := uint(7 - ((id - 1) % 8))
		bm[byteIdx] |= 1 << bitIdx
	}
	if bc >= 2 {
		bm[0] |= 0x80
	}
	if bc >= 3 {
		bm[8] |= 0x80
	}
	return bm
}
'''

s3 = r'''
func encBCD(s string, bl int) []byte {
	p := s
	if len(s)%2 != 0 {
		p = "0" + s
	}
	for len(p)/2 < bl {
		p = "0" + p
	}
	if len(p)/2 > bl {
		p = p[len(p)-bl*2:]
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
'''

s4 = r'''
func (m *Message) Pack() ([]byte, error) {
	var out []byte
	out = append(out, encBCD(m.MTI, 2)...)
	bm := m.bitmap()
	out = append(out, bm...)
	maxId := bitmapCount(m.maxFieldID()) * 64
	if maxId < 64 {
		maxId = 64
	}
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
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
		fb, err := packField(spec, v)
		if err != nil {
			return nil, fmt.Errorf("packing field %d: %w", id, err)
		}
		out = append(out, fb...)
	}
	return out, nil
}

func (m *Message) maxFieldID() int {
	mf := 0
	for id := range m.Fields {
		if id > mf {
			mf = id
		}
	}
	return mf
}

func packField(spec FieldSpec, v string) ([]byte, error) {
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			l := (spec.MaxLen + 1) / 2
			return encBCD(v, l), nil
		} else if spec.Encoding == "hex" {
			b, err := hex.DecodeString(v)
			if err != nil {
				return nil, fmt.Errorf("hex decode field %d: %w", spec.ID, err)
			}
			return b, nil
		}
		return []byte(padRight(v, spec.MaxLen)), nil
	case FTLLVAR:
		l := len(v)
		lb := []byte(fmt.Sprintf("%02d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lb, data...), nil
	case FTLLLVAR:
		l := len(v)
		lll := make([]byte, 3)
		copy(lll, fmt.Sprintf("%03d", l))
		var data []byte
		if spec.Encoding == "bcd" {
			data = encBCD(v, (l+1)/2)
		} else {
			data = []byte(v)
		}
		return append(lll, data...), nil
	}
	return nil, fmt.Errorf("unknown field type for field %d", spec.ID)
}
'''

s5 = r'''
func (m *Message) Unpack(data []byte) error {
	m.Fields = make(map[int]string)
	if len(data) < 2 {
		return fmt.Errorf("data too short for MTI")
	}
	m.MTI = decBCD(data[0:2])
	offset := 2
	if offset >= len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasSecondary := (data[offset] & 0x80) != 0
	bmLen := 8
	if hasSecondary {
		bmLen = 16
	}
	if offset+bmLen > len(data) {
		return fmt.Errorf("data too short for bitmap")
	}
	hasTertiary := false
	if hasSecondary && len(data) > offset+8 {
		hasTertiary = (data[offset+8] & 0x80) != 0
	}
	if hasTertiary {
		bmLen = 24
	}
	if offset+bmLen > len(data) {
		bmLen = 16
		hasTertiary = false
	}
	bm := data[offset : offset+bmLen]
	offset += bmLen
	maxId := bmLen * 8
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if bi >= len(bm) {
			continue
		}
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		v, n, err := unpackField(spec, data[offset:])
		if err != nil {
			return fmt.Errorf("unpacking field %d: %w", id, err)
		}
		m.Fields[id] = v
		offset += n
	}
	return nil
}

func unpackField(spec FieldSpec, data []byte) (string, int, error) {
	offset := 0
	dataLen := 0
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			dataLen = (spec.MaxLen + 1) / 2
		} else if spec.Encoding == "hex" {
			dataLen = spec.MaxLen
		} else {
			dataLen = spec.MaxLen
		}
	case FTLLVAR:
		if len(data) < 2 {
			return "", 0, fmt.Errorf("data too short for LLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:2]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLVAR length: %w", err)
		}
		dataLen = l
		offset = 2
	case FTLLLVAR:
		if len(data) < 3 {
			return "", 0, fmt.Errorf("data too short for LLLVAR length")
		}
		l, err := strconv.Atoi(string(data[0:3]))
		if err != nil {
			return "", 0, fmt.Errorf("invalid LLLVAR length: %w", err)
		}
		dataLen = l
		offset = 3
	}
	if offset+dataLen > len(data) {
		return "", 0, fmt.Errorf("data too short for field %d content", spec.ID)
	}
	raw := data[offset : offset+dataLen]
	hexVal := hex.EncodeToString(raw)
	var val string
	switch spec.Encoding {
	case "bcd":
		val = strings.TrimLeft(hexVal, "0")
		if val == "" {
			val = "0"
		}
	case "ascii":
		val = strings.TrimRight(string(raw), " ")
	case "hex":
		val = strings.ToUpper(hexVal)
	default:
		val = string(raw)
	}
	return val, offset + dataLen, nil
}
'''

s6 = r'''
func (m *Message) ParseFields(data []byte) []ParsedField {
	var result []ParsedField
	bc := 1
	if len(data) > 3 {
		bitmapStart := 2
		hasSecondary := (data[bitmapStart] & 0x80) != 0
		hasTertiary := false
		if hasSecondary && len(data) > bitmapStart+8 {
			hasTertiary = (data[bitmapStart+8] & 0x80) != 0
		}
		if hasTertiary {
			bc = 3
		} else if hasSecondary {
			bc = 2
		}
	}
	var bmName string
	switch bc {
	case 1:
		bmName = "Bitmap (Primary)"
	case 2:
		bmName = "Bitmap (Primary+Secondary)"
	case 3:
		bmName = "Bitmap (Primary+Secondary+Tertiary)"
	}
	result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	result = append(result, ParsedField{1, bmName, "", hex.EncodeToString(data[2 : 2+bc*8])})
	for id := 2; id <= 192; id++ {
		v, ok := m.Fields[id]
		if !ok {
			continue
		}
		spec, exists := FieldSpecs[id]
		if !exists {
			continue
		}
		hv := ""
		if spec.Encoding == "hex" {
			hv = strings.ToUpper(v)
		} else if spec.Encoding == "bcd" {
			hv = encBCDtoHex(v, spec.MaxLen)
		} else {
			hv = hex.EncodeToString([]byte(v))
		}
		result = append(result, ParsedField{id, spec.Name, v, hv})
	}
	return result
}

func encBCDtoHex(v string, maxLen int) string {
	bl := (maxLen + 1) / 2
	b := encBCD(v, bl)
	return strings.ToUpper(hex.EncodeToString(b))
}
'''

s7 = r'''
func calcANSIX99(data []byte, keyHex string) ([]byte, error) {
	keyBytes, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid MAC key hex: %w", err)
	}
	if len(keyBytes) != 8 {
		return nil, fmt.Errorf("MAC key must be 8 bytes, got %d", len(keyBytes))
	}
	block, err := des.NewCipher(keyBytes)
	if err != nil {
		return nil, fmt.Errorf("DES cipher init: %w", err)
	}
	padded := make([]byte, len(data))
	copy(padded, data)
	for len(padded)%8 != 0 {
		padded = append(padded, 0x00)
	}
	var prev [8]byte
	dst := make([]byte, 8)
	for i := 0; i < len(padded); i += 8 {
		var xored [8]byte
		for j := 0; j < 8; j++ {
			xored[j] = padded[i+j] ^ prev[j]
		}
		block.Encrypt(dst, xored[:])
		copy(prev[:], dst)
	}
	mac := make([]byte, 8)
	copy(mac, prev[:])
	return mac, nil
}

func getMACKey() string {
	key := os.Getenv("EFTPOS_MAC_KEY")
	if key == "" {
		return "0123456789ABCDEF"
	}
	return strings.ToUpper(key)
}

func (m *Message) PackWithMAC() ([]byte, error) {
	delete(m.Fields, 64)
	delete(m.Fields, 128)
	packed, err := m.Pack()
	if err != nil {
		return nil, err
	}
	macKey := getMACKey()
	mac, err := calcANSIX99(packed, macKey)
	if err != nil {
		return nil, fmt.Errorf("MAC calculation: %w", err)
	}
	m.SetField(64, strings.ToUpper(hex.EncodeToString(mac)))
	return m.Pack()
}
'''

s8 = r'''
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
'''

s9 = r'''
type Terminal struct {
	TerminalID   string
	MerchantID   string
	MerchantName string
	STAN         int
	InstID       string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:   "TERM0010",
		MerchantID:   "123456789012345",
		MerchantName: "ACM STORE      SYDNEY    AU",
		STAN:         1,
		InstID:       "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func (t *Terminal) BuildAuth(pan, amount, expiry string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}

func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string, useMAC bool) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(37, rrn)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	if useMAC {
		msg.SetField(64, "0000000000000000")
	}
	return msg
}
'''

s10 = r'''
type Host struct{}

func NewHost() *Host { return &Host{} }

func (h *Host) ProcessAuth(req *Message, useMAC bool) *Message {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp := NewMessage()
	resp.MTI = "0110"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(37, fmt.Sprintf("%012d", r.Int63n(10000000000000)))
	if r.Intn(100) < 80 {
		resp.SetField(39, "00")
		resp.SetField(38, fmt.Sprintf("%06d", r.Intn(1000000)))
	} else {
		resp.SetField(39, "05")
		resp.SetField(38, "      ")
	}
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}

func (h *Host) ProcessReversal(req *Message, useMAC bool) *Message {
	resp := NewMessage()
	resp.MTI = "0410"
	for k, v := range req.Fields {
		if k != 64 && k != 128 {
			resp.Fields[k] = v
		}
	}
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	if useMAC {
		resp.SetField(64, "0000000000000000")
	}
	return resp
}
'''

s11 = r'''
type TxRequest struct {
	Type   string `json:"type"`
	PAN    string `json:"pan"`
	Amount string `json:"amount"`
	Expiry string `json:"expiry"`
	RRN    string `json:"rrn"`
	UseMAC bool   `json:"use_mac"`
}

type TxResponse struct {
	RequestHex      string        `json:"request_hex"`
	RequestHexDump  string        `json:"request_hexdump"`
	RequestFields   []ParsedField `json:"request_fields"`
	ResponseHex     string        `json:"response_hex"`
	ResponseHexDump string        `json:"response_hexdump"`
	ResponseFields  []ParsedField `json:"response_fields"`
	MACKey          string        `json:"mac_key,omitempty"`
	MACAlgorithm    string        `json:"mac_algorithm,omitempty"`
	BitmapCount     int           `json:"bitmap_count"`
}

var terminalInst = NewTerminal()
var hostInst = NewHost()
'''

s12 = r'''
func handleTx(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	var tx TxRequest
	if err := json.NewDecoder(r.Body).Decode(&tx); err != nil {
		json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
		return
	}
	useMAC := tx.UseMAC
	var reqMsg, respMsg *Message
	if tx.Type == "reversal" {
		reqMsg = terminalInst.BuildReversal(tx.PAN, tx.Amount, tx.Expiry, tx.RRN, useMAC)
		respMsg = hostInst.ProcessReversal(reqMsg, useMAC)
	} else {
		reqMsg = terminalInst.BuildAuth(tx.PAN, tx.Amount, tx.Expiry, useMAC)
		respMsg = hostInst.ProcessAuth(reqMsg, useMAC)
	}
	var reqData []byte
	var respData []byte
	var err error
	if useMAC {
		reqData, err = reqMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.PackWithMAC()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	} else {
		reqData, err = reqMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
		respData, err = respMsg.Pack()
		if err != nil {
			json.NewEncoder(w).Encode(TxResponse{BitmapCount: 1})
			return
		}
	}
	reqParsed := NewMessage()
	reqParsed.Unpack(reqData)
	respParsed := NewMessage()
	respParsed.Unpack(respData)
	bc := bitmapCount(reqParsed.maxFieldID())
	macKey := ""
	macAlgo := ""
	if useMAC {
		macKey = getMACKey()
		macAlgo = "ANSI X9.9"
	}
	result := TxResponse{
		RequestHex:      strings.ToUpper(hex.EncodeToString(reqData)),
		RequestHexDump:  HexDump(reqData),
		RequestFields:   reqParsed.ParseFields(reqData),
		ResponseHex:     strings.ToUpper(hex.EncodeToString(respData)),
		ResponseHexDump: HexDump(respData),
		ResponseFields:  respParsed.ParseFields(respData),
		MACKey:          macKey,
		MACAlgorithm:    macAlgo,
		BitmapCount:     bc,
	}
	json.NewEncoder(w).Encode(result)
}

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)
	http.HandleFunc("/api/tx", handleTx)
	fmt.Println("EFTPOS Simulator running on http://localhost:8080")
	http.ListenAndServe(":8080", nil)
}
'''

sections = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12]

with open(outfile, "w") as f:
    for s in sections:
        f.write(s)

print(f"Generated {outfile} ({sum(len(s) for s in sections)} bytes)")

part1 = '''package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type FieldType int

const (
	FTFixed FieldType = iota
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
	2:  {2, "PAN", FTLLVAR, 19, "bcd"},
	3:  {3, "Processing Code", FTFixed, 6, "bcd"},
	4:  {4, "Amount", FTFixed, 12, "bcd"},
	7:  {7, "Transmission DateTime", FTFixed, 10, "bcd"},
	11: {11, "STAN", FTFixed, 6, "bcd"},
	12: {12, "Time Local", FTFixed, 6, "bcd"},
	13: {13, "Date Local", FTFixed, 4, "bcd"},
	14: {14, "Expiry Date", FTFixed, 4, "bcd"},
	18: {18, "Merchant Type", FTFixed, 4, "bcd"},
	22: {22, "POS Entry Mode", FTFixed, 3, "bcd"},
	23: {23, "Card Seq", FTFixed, 3, "bcd"},
	25: {25, "POS Condition", FTFixed, 2, "bcd"},
	32: {32, "Acquirer ID", FTLLVAR, 11, "bcd"},
	37: {37, "RRN", FTFixed, 12, "ascii"},
	38: {38, "Auth Code", FTFixed, 6, "ascii"},
	39: {39, "Response Code", FTFixed, 2, "ascii"},
	41: {41, "Terminal ID", FTFixed, 8, "ascii"},
	42: {42, "Merchant ID", FTFixed, 15, "ascii"},
	43: {43, "Merchant Name", FTFixed, 40, "ascii"},
	49: {49, "Currency Code", FTFixed, 3, "bcd"},
}

type ParsedField struct {
	ID       int    `json:"id"`
	Name     string `json:"name"`
	Value    string `json:"value"`
	HexValue string `json:"hex_value"`
}

type Message struct {
	MTI    string
	Fields map[int]string
}

func NewMessage() *Message {
	return &Message{Fields: make(map[int]string)}
}

func (m *Message) SetField(id int, v string) { m.Fields[id] = v }
func (m *Message) GetField(id int) string   { return m.Fields[id] }

func encBCD(s string, bl int) []byte {
	p := s
	if len(s)%2 != 0 {
		p = "0" + s
	}
	for len(p)/2 < bl {
		p = "0" + p
	}
	if len(p)/2 > bl {
		p = p[len(p)-bl*2:]
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

func padLeft(s string, l int) string {
	if len(s) >= l {
		return s[:l]
	}
	return strings.Repeat("0", l-len(s)) + s
}
'''

part2 = '''
func (m *Message) bitmap() []byte {
	mf := 0
	for id := range m.Fields {
		if id > mf {
			mf = id
		}
	}
	bs := 8
	if mf > 64 {
		bs = 16
	}
	bm := make([]byte, bs)
	for id := range m.Fields {
		if id < 2 || id > 128 {
			continue
		}
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		bm[bi] |= 1 << bt
	}
	if mf > 64 {
		bm[0] |= 0x80
	}
	return bm
}

func (m *Message) Pack() []byte {
	var out []byte
	out = append(out, encBCD(m.MTI, 2)...)
	bm := m.bitmap()
	out = append(out, bm...)
	maxId := 64
	if len(bm) > 8 {
		maxId = 128
	}
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
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
			} else {
				out = append(out, []byte(padRight(v, spec.MaxLen))...)
			}
		case FTLLVAR:
			l := len(v)
			lb := []byte(fmt.Sprintf("%02d", l))
			out = append(out, lb...)
			if spec.Encoding == "bcd" {
				out = append(out, encBCD(v, (l+1)/2)...)
			} else {
				out = append(out, []byte(v)...)
			}
		}
	}
	return out
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
	return strings.Join(lines, "\\n")
}
'''

part3 = '''
func (m *Message) Unpack(data []byte) error {
	m.Fields = make(map[int]string)
	m.MTI = decBCD(data[0:2])
	offset := 2
	has128 := (data[offset] & 0x80) != 0
	bmLen := 8
	if has128 {
		bmLen = 16
	}
	bm := data[offset : offset+bmLen]
	offset += bmLen
	maxId := 64
	if has128 {
		maxId = 128
	}
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
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
					return nil
				}
				v := decBCD(data[offset : offset+l])
				if len(v) > spec.MaxLen {
					v = v[len(v)-spec.MaxLen:]
				}
				m.Fields[id] = v
				offset += l
			} else {
				l := spec.MaxLen
				if offset+l > len(data) {
					return nil
				}
				m.Fields[id] = strings.TrimRight(string(data[offset:offset+l]), " ")
				offset += l
			}
		case FTLLVAR:
			if offset+2 > len(data) {
				return nil
			}
			l, _ := strconv.Atoi(string(data[offset : offset+2]))
			offset += 2
			if spec.Encoding == "bcd" {
				bl := (l + 1) / 2
				if offset+bl > len(data) {
					return nil
				}
				v := decBCD(data[offset : offset+bl])
				if len(v) > l {
					v = v[len(v)-l:]
				}
				m.Fields[id] = v
				offset += bl
			} else {
				if offset+l > len(data) {
					return nil
				}
				m.Fields[id] = string(data[offset : offset+l])
				offset += l
			}
		}
	}
	return nil
}

func (m *Message) ParseFields(data []byte) []ParsedField {
	var result []ParsedField
	result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	offset := 2
	has128 := (data[offset] & 0x80) != 0
	bmLen := 8
	if has128 {
		bmLen = 16
	}
	bmHex := hex.EncodeToString(data[offset : offset+bmLen])
	result = append(result, ParsedField{1, "Bitmap", bmHex, bmHex})
	offset += bmLen
	maxId := 64
	if has128 {
		maxId = 128
	}
	bm := data[2 : 2+bmLen]
	for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		start := offset
		switch spec.Type {
		case FTFixed:
			if spec.Encoding == "bcd" {
				l := (spec.MaxLen + 1) / 2
				offset += l
			} else {
				offset += spec.MaxLen
			}
		case FTLLVAR:
			if offset+2 <= len(data) {
				l, _ := strconv.Atoi(string(data[offset : offset+2]))
				offset += 2
				if spec.Encoding == "bcd" {
					offset += (l + 1) / 2
				} else {
					offset += l
				}
			}
		}
		if start < len(data) {
			end := offset
			if end > len(data) {
				end = len(data)
			}
			v, _ := m.Fields[id]
			result = append(result, ParsedField{id, spec.Name, v, hex.EncodeToString(data[start:end])})
		}
	}
	return result
}
'''

part4 = '''
type Terminal struct {
	TerminalID   string
	MerchantID   string
	MerchantName string
	STAN         int
	InstID       string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:   "TERM0010",
		MerchantID:   "123456789012345",
		MerchantName: "ACM STORE      SYDNEY    AU",
		STAN:         1,
		InstID:       "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func (t *Terminal) BuildAuth(pan, amount, expiry string) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	return msg
}

func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(37, rrn)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	return msg
}

func RandomPAN() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	p := "4567"
	for i := 0; i < 12; i++ {
		p += fmt.Sprintf("%d", r.Intn(10))
	}
	return p
}

func RandomAmount() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%012d", r.Intn(999999))
}
'''

part5 = '''
type Host struct{}

func NewHost() *Host {
	return &Host{}
}

func (h *Host) ProcessAuth(req *Message) *Message {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp := NewMessage()
	resp.MTI = "0110"
	for k, v := range req.Fields {
		resp.Fields[k] = v
	}
	resp.SetField(37, fmt.Sprintf("%012d", r.Int63n(999999999999)))
	if r.Intn(100) < 80 {
		resp.SetField(39, "00")
		resp.SetField(38, fmt.Sprintf("%06d", r.Intn(999999)))
	} else {
		resp.SetField(39, "05")
		resp.SetField(38, "      ")
	}
	return resp
}

func (h *Host) ProcessReversal(req *Message) *Message {
	resp := NewMessage()
	resp.MTI = "0410"
	for k, v := range req.Fields {
		resp.Fields[k] = v
	}
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	return resp
}

type TxRequest struct {
	Type   string `json:"type"`
	PAN    string `json:"pan"`
	Amount string `json:"amount"`
	Expiry string `json:"expiry"`
	RRN    string `json:"rrn"`
}

type TxResponse struct {
	RequestHex     string        `json:"request_hex"`
	RequestHexDump string        `json:"request_hexdump"`
	RequestFields  []ParsedField `json:"request_fields"`
	ResponseHex    string        `json:"response_hex"`
	ResponseHexDump string       `json:"response_hexdump"`
	ResponseFields []ParsedField `json:"response_fields"`
}

var terminal = NewTerminal()
var host = NewHost()

func handleTx(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	var tx TxRequest
	json.NewDecoder(r.Body).Decode(&tx)
	var reqMsg, respMsg *Message
	if tx.Type == "auth" {
		reqMsg = terminal.BuildAuth(tx.PAN, tx.Amount, tx.Expiry)
		respMsg = host.ProcessAuth(reqMsg)
	} else {
		reqMsg = terminal.BuildReversal(tx.PAN, tx.Amount, tx.Expiry, tx.RRN)
		respMsg = host.ProcessReversal(reqMsg)
	}
	reqData := reqMsg.Pack()
	respData := respMsg.Pack()
	reqParsed := NewMessage()
	reqParsed.Unpack(reqData)
	respParsed := NewMessage()
	respParsed.Unpack(respData)
	result := TxResponse{
		RequestHex:      strings.ToUpper(hex.EncodeToString(reqData)),
		RequestHexDump:  HexDump(reqData),
		RequestFields:   reqParsed.ParseFields(reqData),
		ResponseHex:     strings.ToUpper(hex.EncodeToString(respData)),
		ResponseHexDump: HexDump(respData),
		ResponseFields:  respParsed.ParseFields(respData),
	}
	json.NewEncoder(w).Encode(result)
}

func main() {
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)
	http.HandleFunc("/api/tx", handleTx)
	fmt.Println("Server starting on :8080")
	http.ListenAndServe(":8080", nil)
}
'''

content = part1 + part2 + part3 + part4 + part5
open('main.go', 'w').write(content)
print('Generated main.go with', len(content), 'bytes')
