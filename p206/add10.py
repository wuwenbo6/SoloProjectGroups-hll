f=open("main.go","a")
f.write("""
switch spec.Type {
case FTFixed:
if spec.Encoding == "bcd" {
				l := (spec.MaxLen + 1) / 2
				if offset+l > len(data) {
					return nil
				}
				v := decBCD(data[offset : offset+l])
				if len(v) > spec.MaxLen {
					v = v[len(v)-spec.MaxLen:]
				}
				m.Fields[id] = v
				offset += l
			} else {
""")
f.close()
