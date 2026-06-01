f=open("main.go","a")
f.write("""
switch spec.Type {
case FTFixed:
if spec.Encoding == "bcd" {
				l := (spec.MaxLen + 1) / 2
				out = append(out, encBCD(v, l)...)
			} else {
				out = append(out, []byte(padRight(v, spec.MaxLen))...)
			}
""")
f.close()
