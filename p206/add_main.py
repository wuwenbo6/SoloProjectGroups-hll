f=open("main.go","a")
f.write("""
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
""")
f.close()
