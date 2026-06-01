f=open("main.go","a")
f.write("""
type Host struct{}

func NewHost() *Host { return &Host{} }

func (h *Host) ProcessAuth(req *Message) *Message {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp := NewMessage()
	resp.MTI = "0110"
	for k, v := range req.Fields { resp.Fields[k] = v }
	resp.SetField(37, fmt.Sprintf("000000000000", r.Int63n(999999999999)))
	if r.Intn(100) < 80 {
		resp.SetField(39, "00")
		resp.SetField(38, fmt.Sprintf("000000", r.Intn(999999)))
	} else {
		resp.SetField(39, "05")
		resp.SetField(38, "      ")
	}
	return resp
}

func (h *Host) ProcessReversal(req *Message) *Message {
	resp := NewMessage()
	resp.MTI = "0410"
	for k, v := range req.Fields { resp.Fields[k] = v }
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	return resp
}
""")
f.close()
