lines = open("main.go").readlines()
new_func = """func (m *Message) ParseFields(data []byte) []ParsedField {
	var result []ParsedField
	result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	for id, v := range m.Fields {
		spec, ok := FieldSpecs[id]
		if ok {
			result = append(result, ParsedField{id, spec.Name, v, ""})
		}
	}
	return result
}
"""
out = []
i = 0
while i < len(lines):
    if "func (m *Message) ParseFields" in lines[i]:
        out.append(new_func)
        i += 5
    else:
        out.append(lines[i])
        i += 1
open("main.go", "w").writelines(out)
print("done")
