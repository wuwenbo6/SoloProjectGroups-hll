f=open("main.go","a")
f.write("""
case FTLLVAR:
l := len(v)
			lb := []byte(fmt.Sprintf("%02d", l))
			out = append(out, lb...)
			if spec.Encoding == "bcd" {
				out = append(out, encBCD(v, (l+1)/2)...)
			} else {
				out = append(out, []byte(v)...)
			}
		}
	}
	return out
}
""")
f.close()
