f=open("main.go","a")
f.write("""
func (t *Terminal) BuildAuth(pan, amount, expiry string) *Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("000000", stan))
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
""")
f.close()
