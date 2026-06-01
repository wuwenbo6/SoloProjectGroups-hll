f=open("main.go","a")
f.write("""
func (m *Message) Unpack(data []byte) error {
m.Fields = make(map[int]string)
	m.MTI = decBCD(data[0:2])
	offset := 2
	has128 := (data[offset] & 0x80) != 0
	bmLen := 8
	if has128 {
		bmLen = 16
	}
	offset += bmLen
	maxId := 64
	if has128 {
		maxId = 128
	}
	bm := data[2 : 2+bmLen]
""")
f.close()
