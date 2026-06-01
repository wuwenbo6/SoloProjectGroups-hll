f=open("main.go","a")
f.write("""
type TxRequest struct {
	Type   string `json:"type"`
	PAN    string `json:"pan"`
	Amount string `json:"amount"`
	Expiry string `json:"expiry"`
	RRN    string `json:"rrn"`
}

type TxResponse struct {
	RequestHex      string        `json:"request_hex"`
	RequestHexDump  string        `json:"request_hexdump"`
	RequestFields   []ParsedField `json:"request_fields"`
	ResponseHex     string        `json:"response_hex"`
	ResponseHexDump string        `json:"response_hexdump"`
	ResponseFields  []ParsedField `json:"response_fields"`
}

var terminal = NewTerminal()
var host = NewHost()
""")
f.close()
