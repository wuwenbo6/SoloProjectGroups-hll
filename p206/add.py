f=open("main.go","a")
f.write("""
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
""")
f.close()
