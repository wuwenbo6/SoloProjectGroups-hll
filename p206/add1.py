f=open("main.go","a")
f.write("""
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
""")
f.close()
