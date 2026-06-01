f=open("main.go","a")
f.write("""
hexStr := ""
		for j, c := range row {
			hexStr += fmt.Sprintf("%02X ", c)
			if j == 7 {
				hexStr += " "
			}
		}
""")
f.close()
