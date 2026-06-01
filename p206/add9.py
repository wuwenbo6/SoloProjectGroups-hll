f=open("main.go","a")
f.write("""
for id := 2; id <= maxId; id++ {
		bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
""")
f.close()
