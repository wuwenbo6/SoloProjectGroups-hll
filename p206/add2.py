f=open("main.go","a")
f.write("""
bi := (id - 1) / 8
		bt := uint(7 - ((id - 1) % 8))
		if (bm[bi] & (1 << bt)) == 0 {
			continue
		}
		spec, ok := FieldSpecs[id]
		if !ok {
			continue
		}
		v, has := m.Fields[id]
		if !has {
			continue
		}
""")
f.close()
