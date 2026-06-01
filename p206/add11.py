f=open("main.go","a")
f.write("""
l := spec.MaxLen
				if offset+l > len(data) {
					return nil
				}
				m.Fields[id] = strings.TrimRight(string(data[offset:offset+l]), " ")
				offset += l
			}
		case FTLLVAR:
			if offset+2 > len(data) {
				return nil
			}
			l, _ := strconv.Atoi(string(data[offset : offset+2]))
			offset += 2
""")
f.close()
