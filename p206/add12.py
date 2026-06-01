f=open("main.go","a")
f.write("""
if spec.Encoding == "bcd" {
				bl := (l + 1) / 2
				if offset+bl > len(data) {
					return nil
				}
				v := decBCD(data[offset : offset+bl])
				if len(v) > l {
					v = v[len(v)-l:]
				}
				m.Fields[id] = v
				offset += bl
			} else {
				if offset+l > len(data) {
					return nil
				}
				m.Fields[id] = string(data[offset : offset+l])
				offset += l
			}
		}
	}
	return nil
}
""")
f.close()
