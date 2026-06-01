f=open("main.go","a")
f.write("""
func (m *Message) ParseFields(data []byte) []ParsedField {
var result []ParsedField
result = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})
	return result
}
""")
f.close()
