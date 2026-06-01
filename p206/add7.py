f=open("main.go","a")
f.write("""
ascii := ""
		for _, c := range row {
			if c >= 32 && c < 127 {
				ascii += string(c)
			} else {
				ascii += "."
			}
		}
		lines = append(lines, fmt.Sprintf("%04X: %-49s |%s|", i, hexStr, ascii))
	}
	return strings.Join(lines, "\n")
}
""")
f.close()
