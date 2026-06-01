f=open("main.go","a")
f.write("""
func HexDump(b []byte) string {
var lines []string
for i := 0; i < len(b); i += 16 {
		end := i + 16
		if end > len(b) {
			end = len(b)
		}
		row := b[i:end]
""")
f.close()
