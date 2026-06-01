f=open("main.go","a")
f.write("""
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
""")
f.close()
