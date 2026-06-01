package server

import (
	"encoding/hex"
	"encoding/json"
	"eftpos-simulator/host"
	"eftpos-simulator/iso8583"
	"eftpos-simulator/terminal"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

var term = terminal.NewTerminal()
var bank = host.NewHost()
var macKey = getMACKey()

type PresetTx struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Type       string            `json:"type"`
	TPDU       string            `json:"tpdu"`
	PAN        string            `json:"pan"`
	Amount     string            `json:"amount"`
	Expiry     string            `json:"expiry"`
	RRN        string            `json:"rrn"`
	UseMAC     bool              `json:"use_mac"`
	AddField81 bool              `json:"add_field81"`
	OrigAmount string            `json:"orig_amount"`
	Fields     map[string]string `json:"fields,omitempty"`
}

type TxStat struct {
	TPDU      string    `json:"tpdu"`
	Count     int       `json:"count"`
	LastTime  time.Time `json:"last_time"`
	LastMTI   string    `json:"last_mti"`
	Success   int       `json:"success"`
	Failed    int       `json:"failed"`
}

var (
	statsMu sync.Mutex
	stats   = make(map[string]*TxStat)
)

var presets = []PresetTx{
	{
		ID:     "auth-visa-1000",
		Name:   "VISA Authorization $10.00",
		Type:   "auth",
		TPDU:   "6000010000",
		PAN:    "4111111111111111",
		Amount: "000000001000",
		Expiry: "2512",
		UseMAC: true,
	},
	{
		ID:     "auth-mastercard-5000",
		Name:   "MasterCard Authorization $50.00",
		Type:   "auth",
		TPDU:   "6000020000",
		PAN:    "5555555555554444",
		Amount: "000000005000",
		Expiry: "2606",
		UseMAC: true,
	},
	{
		ID:     "auth-amex-10000",
		Name:   "AMEX Authorization $100.00",
		Type:   "auth",
		TPDU:   "6000030000",
		PAN:    "378282246310005",
		Amount: "000000010000",
		Expiry: "2512",
		UseMAC: true,
	},
	{
		ID:     "auth-declined",
		Name:   "Declined Authorization",
		Type:   "auth",
		TPDU:   "6000010000",
		PAN:    "4000000000000002",
		Amount: "000000009999",
		Expiry: "2412",
		UseMAC: true,
	},
	{
		ID:     "auth-with-original",
		Name:   "Authorization with Original Amount (3-bitmap)",
		Type:   "auth",
		TPDU:   "6000010000",
		PAN:    "4111111111111111",
		Amount: "000000002000",
		Expiry: "2512",
		UseMAC: true,
		AddField81: true,
		OrigAmount: "000000002000",
	},
	{
		ID:     "reversal-full",
		Name:   "Full Reversal",
		Type:   "reversal",
		TPDU:   "6000010000",
		PAN:    "4111111111111111",
		Amount: "000000001000",
		Expiry: "2512",
		RRN:    "123456789012",
		UseMAC: true,
	},
	{
		ID:     "reversal-partial",
		Name:   "Partial Reversal",
		Type:   "reversal",
		TPDU:   "6000020000",
		PAN:    "5555555555554444",
		Amount: "000000002500",
		Expiry: "2606",
		RRN:    "987654321098",
		UseMAC: true,
	},
	{
		ID:     "auth-no-mac",
		Name:   "Authorization without MAC",
		Type:   "auth",
		TPDU:   "6000040000",
		PAN:    "4111111111111111",
		Amount: "000000001500",
		Expiry: "2512",
		UseMAC: false,
	},
}

func getMACKey() string {
	k := os.Getenv("EFTPOS_MAC_KEY")
	if k == "" {
		k = "0123456789ABCDEF"
	}
	return k
}

type Req struct {
	PresetID     string            `json:"preset_id"`
	Type         string            `json:"type"`
	TPDU         string            `json:"tpdu"`
	PAN          string            `json:"pan"`
	Amount       string            `json:"amount"`
	Expiry       string            `json:"expiry"`
	RRN          string            `json:"rrn"`
	UseMAC       bool              `json:"use_mac"`
	AddField81   bool              `json:"add_field81"`
	OrigAmount   string            `json:"orig_amount"`
	Fields       map[string]string `json:"fields,omitempty"`
}

type MsgInfo struct {
	TPDU    string                 `json:"tpdu"`
	MTI     string                 `json:"mti"`
	HexRaw  string                 `json:"hex_raw"`
	HexDump string                 `json:"hex_dump"`
	Fields  []iso8583.ParsedField  `json:"fields"`
}

type Resp struct {
	Request      *MsgInfo `json:"request"`
	Response     *MsgInfo `json:"response"`
	MACKey       string   `json:"mac_key,omitempty"`
	MACAlgorithm string   `json:"mac_algorithm,omitempty"`
	BitmapCount  int      `json:"bitmap_count"`
	Error        string   `json:"error,omitempty"`
}

func packMsg(m *iso8583.Message, tpdu string, useMAC bool) *MsgInfo {
	var packed []byte
	var err error
	if tpdu != "" && useMAC {
		packed, err = m.PackWithTPDUAndMAC(tpdu, macKey)
	} else if tpdu != "" {
		packed, err = m.PackWithTPDU(tpdu)
	} else if useMAC {
		packed, err = m.PackWithMAC(macKey)
	} else {
		packed, err = m.Pack()
	}
	if err != nil {
		return &MsgInfo{TPDU: tpdu, MTI: m.MTI}
	}
	_, fields, err := iso8583.Unpack(packed)
	if err != nil {
		return &MsgInfo{TPDU: tpdu, MTI: m.MTI}
	}
	return &MsgInfo{
		TPDU:    tpdu,
		MTI:     m.MTI,
		HexRaw:  strings.ToUpper(hex.EncodeToString(packed)),
		HexDump: iso8583.HexDump(packed),
		Fields:  fields,
	}
}

func updateStats(tpdu, mti string, success bool) {
	if tpdu == "" {
		tpdu = "NONE"
	}
	statsMu.Lock()
	defer statsMu.Unlock()
	if _, ok := stats[tpdu]; !ok {
		stats[tpdu] = &TxStat{TPDU: tpdu}
	}
	s := stats[tpdu]
	s.Count++
	s.LastTime = time.Now()
	s.LastMTI = mti
	if success {
		s.Success++
	} else {
		s.Failed++
	}
}

func handleTX(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	var req Req
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		json.NewEncoder(w).Encode(Resp{Error: err.Error()})
		return
	}
	if req.PresetID != "" {
		for _, p := range presets {
			if p.ID == req.PresetID {
				req.Type = p.Type
				req.TPDU = p.TPDU
				req.PAN = p.PAN
				req.Amount = p.Amount
				req.Expiry = p.Expiry
				req.RRN = p.RRN
				req.UseMAC = p.UseMAC
				req.AddField81 = p.AddField81
				req.OrigAmount = p.OrigAmount
				break
			}
		}
	}
	pan := req.PAN
	if pan == "" {
		pan = terminal.RandomPAN()
	}
	amount := req.Amount
	if amount == "" {
		amount = terminal.RandomAmount()
	}
	expiry := req.Expiry
	if expiry == "" {
		expiry = "2512"
	}
	var reqMsg *iso8583.Message
	var respMsg *iso8583.Message
	switch req.Type {
	case "reversal":
		rrn := req.RRN
		if rrn == "" {
			rrn = "123456789012"
		}
		reqMsg = term.BuildReversal(pan, amount, expiry, rrn)
		respMsg = bank.ProcessReversal(reqMsg)
	default:
		reqMsg = term.BuildAuth(pan, amount, expiry)
		respMsg = bank.ProcessAuth(reqMsg)
	}
	if req.AddField81 {
		origAmount := req.OrigAmount
		if origAmount == "" {
			origAmount = "000000001000"
		}
		reqMsg.SetField(81, origAmount)
		respMsg.SetField(81, origAmount)
	}
	if req.Fields != nil {
		for k, v := range req.Fields {
			id, _ := strconv.Atoi(k)
			if id > 0 {
				reqMsg.SetField(id, v)
				respMsg.SetField(id, v)
			}
		}
	}
	result := Resp{
		Request:     packMsg(reqMsg, req.TPDU, req.UseMAC),
		Response:    packMsg(respMsg, req.TPDU, req.UseMAC),
		BitmapCount: iso8583.BitmapCount(reqMsg.Fields),
	}
	if req.UseMAC {
		result.MACKey = macKey
		result.MACAlgorithm = "ANSI X9.9 (DES CBC 64-bit)"
	}
	success := respMsg.GetField(39) == "00"
	updateStats(req.TPDU, reqMsg.MTI, success)
	json.NewEncoder(w).Encode(result)
}

func handlePresets(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(presets)
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	statsMu.Lock()
	defer statsMu.Unlock()
	result := make([]*TxStat, 0, len(stats))
	for _, s := range stats {
		result = append(result, s)
	}
	json.NewEncoder(w).Encode(result)
}

func handleStatsReset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	statsMu.Lock()
	defer statsMu.Unlock()
	stats = make(map[string]*TxStat)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func Start(port int) {
	http.HandleFunc("/api/tx", handleTX)
	http.HandleFunc("/api/presets", handlePresets)
	http.HandleFunc("/api/stats", handleStats)
	http.HandleFunc("/api/stats/reset", handleStatsReset)
	http.Handle("/", http.FileServer(http.Dir("static")))
	addr := ":" + strconv.Itoa(port)
	fmt.Printf("EFTPOS Simulator running on http://localhost%s\n", addr)
	fmt.Printf("MAC Key: %s (set EFTPOS_MAC_KEY env to change)\n", macKey)
	fmt.Printf("API Endpoints:\n")
	fmt.Printf("  POST   /api/tx          - Send transaction\n")
	fmt.Printf("  GET    /api/presets     - List preset transactions\n")
	fmt.Printf("  GET    /api/stats       - Get transaction statistics\n")
	fmt.Printf("  POST   /api/stats/reset - Reset statistics\n")
	http.ListenAndServe(addr, nil)
}
