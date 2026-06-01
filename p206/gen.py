import os

lines = []
lines.append('<!DOCTYPE html>')
lines.append('<html lang="en">')
lines.append('<head>')
lines.append('<meta charset="UTF-8">')
lines.append('<title>EFTPOS ISO 8583 Simulator</title>')
lines.append('<style>')
lines.append('body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }')
lines.append('h1 { color: #333; text-align: center; }')
lines.append('.panel { background: white; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }')
lines.append(".hex { background: #1a1a2e; color: #0f0; padding: 15px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 12px; white-space: pre-wrap; word-break: break-all; line-height: 1.5; }")
lines.append('table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }')
lines.append('th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }')
lines.append('th { background: #4CAF50; color: white; }')
lines.append('tr:nth-child(even) { background: #f2f2f2; }')
lines.append('tr.mac-row { background: #fff3cd !important; }')
lines.append('button { background: #007bff; color: white; padding: 10px 24px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 10px 5px; }')
lines.append('button:hover { background: #0056b2; }')
lines.append('input, select { padding: 8px; width: 250px; border: 1px solid #ddd; border-radius: 4px; }')
lines.append('.req { border-left: 4px solid #28a745; padding-left: 10px; }')
lines.append('.resp { border-left: 4px solid #dc3545; padding-left: 10px; }')
lines.append('.info { background: #e3f2fd; padding: 10px; border-radius: 4px; margin: 10px 0; font-size: 13px; }')
lines.append('.info-mac { background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; font-size: 13px; }')
lines.append('label { margin-right: 10px; }')
lines.append('.checkbox-label { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }')
lines.append('</style>')
lines.append('</head>')
lines.append('<body>')
lines.append('<h1>EFTPOS ISO 8583 Simulator</h1>')
lines.append('<div class="panel">')
lines.append('<h3>Send Transaction</h3>')
lines.append('<p><strong>Type:</strong> <select id="txType" onchange="toggleRRN()">')
lines.append('<option value="auth">Authorization (0100/0110)</option>')
lines.append('<option value="reversal">Reversal (0400/0410)</option>')
lines.append('</select></p>')
lines.append('<p><strong>PAN:</strong> <input type="text" id="pan" value="4567123456789012"></p>')
lines.append('<p><strong>Amount:</strong> <input type="text" id="amount" value="000000001000"></p>')
lines.append('<p><strong>Expiry:</strong> <input type="text" id="expiry" value="2512"></p>')
lines.append('<p id="rrnGroup" style="display:none"><strong>RRN:</strong> <input type="text" id="rrn" value="123456789012"></p>')
lines.append('<p>')
lines.append('<label class="checkbox-label"><input type="checkbox" id="useMac"> Enable MAC (ANSI X9.9)</label>')
lines.append('</p>')
lines.append('<button onclick="sendTransaction()">Send Transaction</button>')
lines.append('</div>')
lines.append('<div id="resultArea" style="display:none">')
lines.append('<div id="infoPanel"></div>')
lines.append('<div class="panel req">')
lines.append('<h3>Request</h3>')
lines.append('<h4>Hex Dump:</h4>')
lines.append('<div class="hex" id="reqHex"></div>')
lines.append('<h4>Fields:</h4>')
lines.append('<table id="reqFields"><thead><tr><th>ID</th><th>Name</th><th>Value</th><th>Hex</th></tr></thead><tbody></tbody></table>')
lines.append('</div>')
lines.append('<div class="panel resp">')
lines.append('<h3>Response</h3>')
lines.append('<h4>Hex Dump:</h4>')
lines.append('<div class="hex" id="respHex"></div>')
lines.append('<h4>Fields:</h4>')
lines.append('<table id="respFields"><thead><tr><th>ID</th><th>Name</th><th>Value</th><th>Hex</th></tr></thead><tbody></tbody></table>')
lines.append('</div>')
lines.append('</div>')
lines.append('<script>')
lines.append('function toggleRRN() {')
lines.append('  document.getElementById("rrnGroup").style.display =')
lines.append('    document.getElementById("txType").value == "reversal" ? "block" : "none";')
lines.append('}')
lines.append('function sendTransaction() {')
lines.append('  var data = {')
lines.append('    type: document.getElementById("txType").value,')
lines.append('    pan: document.getElementById("pan").value,')
lines.append('    amount: document.getElementById("amount").value,')
lines.append('    expiry: document.getElementById("expiry").value,')
lines.append('    rrn: document.getElementById("rrn").value,')
lines.append('    use_mac: document.getElementById("useMac").checked')
lines.append('  };')
lines.append('  fetch("/api/tx", {')
lines.append('    method: "POST",')
lines.append('    headers: { "Content-Type": "application/json" },')
lines.append('    body: JSON.stringify(data)')
lines.append('  }).then(function(r) { return r.json(); }).then(displayResult).catch(function(e) { alert("Error: " + e); });')
lines.append('}')
lines.append('function displayResult(d) {')
lines.append('  document.getElementById("resultArea").style.display = "block";')
lines.append("  var infoHtml = '<div class=\"info\">Bitmap Count: <strong>' + d.bitmap_count + '</strong>';")
lines.append("  infoHtml += ' (' + (d.bitmap_count === 1 ? '64 fields' : d.bitmap_count === 2 ? '128 fields' : '192 fields') + ')</div>';")
lines.append('  if (d.mac_key) {')
lines.append("    infoHtml += '<div class=\"info-mac\">MAC Algorithm: <strong>' + d.mac_algorithm + '</strong> | MAC Key: <strong>' + d.mac_key + '</strong></div>';")
lines.append('  }')
lines.append('  document.getElementById("infoPanel").innerHTML = infoHtml;')
lines.append('  document.getElementById("reqHex").textContent = d.request_hexdump;')
lines.append('  document.getElementById("respHex").textContent = d.response_hexdump;')
lines.append('  populateTable("reqFields", d.request_fields);')
lines.append('  populateTable("respFields", d.response_fields);')
lines.append('}')
lines.append('function populateTable(tableId, fields) {')
lines.append('  var tbody = document.getElementById(tableId).querySelector("tbody");')
lines.append('  tbody.innerHTML = "";')
lines.append('  fields.forEach(function(f) {')
lines.append('    var tr = document.createElement("tr");')
lines.append('    if (f.name === "MAC" || f.name === "MAC-2") {')
lines.append('      tr.className = "mac-row";')
lines.append('    }')
lines.append('    tr.innerHTML = "<td>" + f.id + "</td><td>" + f.name + "</td><td>" + escHtml(f.value) + "</td><td>" + escHtml(f.hex_value) + "</td>";')
lines.append('    tbody.appendChild(tr);')
lines.append('  });')
lines.append('}')
lines.append('function escHtml(s) {')
lines.append('  if (!s) return "";')
lines.append('  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");')
lines.append('}')
lines.append('</script>')
lines.append('</body>')
lines.append('</html>')

outpath = '/Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p206/static/index.html'
with open(outpath, 'w') as f:
    f.write('\n'.join(lines) + '\n')
print('Written', len(lines), 'lines to', outpath)
w("}")
w("")
w("func decBCD(b []byte) string {")
w("\treturn hex.EncodeToString(b)")
w("}")
w("")
w("func padRight(s string, l int) string {")
w("\tif len(s) >= l {")
w("\t\treturn s[:l]")
w("\t}")
w('\treturn s + strings.Repeat(" ", l-len(s))')
w("}")
w("")
w("func maxFieldID(fields map[int]string) int {")
w("\tmf := 0")
w("\tfor id := range fields {")
w("\t\tif id > mf {")
w("\t\t\tmf = id")
w("\t\t}")
w("\t}")
w("\treturn mf")
w("}")
w("")
w("func bitmapCount(mf int) int {")
w("\tif mf > 128 {")
w("\t\treturn 3")
w("\t}")
w("\tif mf > 64 {")
w("\t\treturn 2")
w("\t}")
w("\treturn 1")
w("}")
w("")
w("func (m *Message) bitmap() []byte {")
w("\tmf := maxFieldID(m.Fields)")
w("\tbc := bitmapCount(mf)")
w("\tbs := bc * 8")
w("\tbm := make([]byte, bs)")
w("\tfor id := range m.Fields {")
w("\t\tif id < 2 || id > bc*64 {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tbi := (id - 1) / 8")
w("\t\tbt := uint(7 - ((id - 1) % 8))")
w("\t\tbm[bi] |= 1 << bt")
w("\t}")
w("\tif bc >= 2 {")
w("\t\tbm[0] |= 0x80")
w("\t}")
w("\tif bc >= 3 {")
w("\t\tbm[8] |= 0x80")
w("\t}")
w("\treturn bm")
w("}")
w("")
w("func (m *Message) Pack() []byte {")
w("\tvar out []byte")
w("\tout = append(out, encBCD(m.MTI, 2)...)")
w("\tbm := m.bitmap()")
w("\tout = append(out, bm...)")
w("\tbc := len(bm) / 8")
w("\tmaxId := bc * 64")
w("\tfor id := 2; id <= maxId; id++ {")
w("\t\tbi := (id - 1) / 8")
w("\t\tbt := uint(7 - ((id - 1) % 8))")
w("\t\tif (bm[bi] & (1 << bt)) == 0 {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tspec, ok := FieldSpecs[id]")
w("\t\tif !ok {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tv, has := m.Fields[id]")
w("\t\tif !has {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tswitch spec.Type {")
w("\t\tcase FTFixed:")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tl := (spec.MaxLen + 1) / 2")
w("\t\t\t\tout = append(out, encBCD(v, l)...)")
w('\t\t\t} else if spec.Encoding == "hex" {')
w("\t\t\t\tb, _ := hex.DecodeString(v)")
w("\t\t\t\tout = append(out, b...)")
w("\t\t\t} else {")
w("\t\t\t\tout = append(out, []byte(padRight(v, spec.MaxLen))...)")
w("\t\t\t}")
w("\t\tcase FTLLVAR:")
w("\t\t\tl := len(v)")
w('\t\t\tlb := []byte(fmt.Sprintf("%02d", l))')
w("\t\t\tout = append(out, lb...)")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tout = append(out, encBCD(v, (l+1)/2)...)")
w("\t\t\t} else {")
w("\t\t\t\tout = append(out, []byte(v)...)")
w("\t\t\t}")
w("\t\tcase FTLLLVAR:")
w("\t\t\tl := len(v)")
w('\t\t\tlb := []byte(fmt.Sprintf("%03d", l))')
w("\t\t\tout = append(out, lb...)")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tout = append(out, encBCD(v, (l+1)/2)...)")
w("\t\t\t} else {")
w("\t\t\t\tout = append(out, []byte(v)...)")
w("\t\t\t}")
w("\t\t}")
w("\t}")
w("\treturn out")
w("}")
w("")
w("func HexDump(b []byte) string {")
w("\tvar lines []string")
w("\tfor i := 0; i < len(b); i += 16 {")
w("\t\tend := i + 16")
w("\t\tif end > len(b) {")
w("\t\t\tend = len(b)")
w("\t\t}")
w("\t\trow := b[i:end]")
w('\t\thexStr := ""')
w("\t\tfor j, c := range row {")
w('\t\t\thexStr += fmt.Sprintf("%02X ", c)')
w("\t\t\tif j == 7 {")
w('\t\t\t\thexStr += " "')
w("\t\t\t}")
w("\t\t}")
w('\t\tascii := ""')
w("\t\tfor _, c := range row {")
w("\t\t\tif c >= 32 && c < 127 {")
w("\t\t\t\tascii += string(c)")
w("\t\t\t} else {")
w('\t\t\t\tascii += "."')
w("\t\t\t}")
w("\t\t}")
w('\t\tlines = append(lines, fmt.Sprintf("%04X: %-49s |%s|", i, hexStr, ascii))')
w("\t}")
w('\treturn strings.Join(lines, "\\n")')
w("}")
w("")
w("func (m *Message) Unpack(data []byte) error {")
w("\tm.Fields = make(map[int]string)")
w("\tif len(data) < 2 {")
w("\t\treturn nil")
w("\t}")
w("\tm.MTI = decBCD(data[0:2])")
w("\toffset := 2")
w("\tif offset >= len(data) {")
w("\t\treturn nil")
w("\t}")
w("\thasSecondary := (data[offset] & 0x80) != 0")
w("\tbmLen := 8")
w("\tif hasSecondary {")
w("\t\tbmLen = 16")
w("\t\tif offset+8 < len(data) {")
w("\t\t\thasTertiary := (data[offset+8] & 0x80) != 0")
w("\t\t\tif hasTertiary {")
w("\t\t\t\tbmLen = 24")
w("\t\t\t}")
w("\t\t}")
w("\t}")
w("\tbmStart := offset")
w("\tif offset+bmLen > len(data) {")
w("\t\treturn nil")
w("\t}")
w("\tbm := data[bmStart : bmStart+bmLen]")
w("\toffset += bmLen")
w("\tbc := bmLen / 8")
w("\tmaxId := bc * 64")
w("\tfor id := 2; id <= maxId; id++ {")
w("\t\tbi := (id - 1) / 8")
w("\t\tbt := uint(7 - ((id - 1) % 8))")
w("\t\tif (bm[bi] & (1 << bt)) == 0 {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tspec, ok := FieldSpecs[id]")
w("\t\tif !ok {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tswitch spec.Type {")
w("\t\tcase FTFixed:")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tl := (spec.MaxLen + 1) / 2")
w("\t\t\t\tif offset+l > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tv := decBCD(data[offset : offset+l])")
w("\t\t\t\tif len(v) > spec.MaxLen {")
w("\t\t\t\t\tv = v[len(v)-spec.MaxLen:]")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = v")
w("\t\t\t\toffset += l")
w('\t\t\t} else if spec.Encoding == "hex" {')
w("\t\t\t\tl := spec.MaxLen")
w("\t\t\t\tif offset+l > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = strings.ToUpper(hex.EncodeToString(data[offset : offset+l]))")
w("\t\t\t\toffset += l")
w("\t\t\t} else {")
w("\t\t\t\tl := spec.MaxLen")
w("\t\t\t\tif offset+l > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w('\t\t\t\tm.Fields[id] = strings.TrimRight(string(data[offset:offset+l]), " ")')
w("\t\t\t\toffset += l")
w("\t\t\t}")
w("\t\tcase FTLLVAR:")
w("\t\t\tif offset+2 > len(data) {")
w("\t\t\t\treturn nil")
w("\t\t\t}")
w("\t\t\tl, _ := strconv.Atoi(string(data[offset : offset+2]))")
w("\t\t\toffset += 2")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tbl := (l + 1) / 2")
w("\t\t\t\tif offset+bl > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tv := decBCD(data[offset : offset+bl])")
w("\t\t\t\tif len(v) > l {")
w("\t\t\t\t\tv = v[len(v)-l:]")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = v")
w("\t\t\t\toffset += bl")
w("\t\t\t} else {")
w("\t\t\t\tif offset+l > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = string(data[offset : offset+l])")
w("\t\t\t\toffset += l")
w("\t\t\t}")
w("\t\tcase FTLLLVAR:")
w("\t\t\tif offset+3 > len(data) {")
w("\t\t\t\treturn nil")
w("\t\t\t}")
w("\t\t\tl, _ := strconv.Atoi(string(data[offset : offset+3]))")
w("\t\t\toffset += 3")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\tbl := (l + 1) / 2")
w("\t\t\t\tif offset+bl > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tv := decBCD(data[offset : offset+bl])")
w("\t\t\t\tif len(v) > l {")
w("\t\t\t\tv = v[len(v)-l:]")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = v")
w("\t\t\t\toffset += bl")
w("\t\t\t} else {")
w("\t\t\t\tif offset+l > len(data) {")
w("\t\t\t\t\treturn nil")
w("\t\t\t\t}")
w("\t\t\t\tm.Fields[id] = string(data[offset : offset+l])")
w("\t\t\t\toffset += l")
w("\t\t\t}")
w("\t\t}")
w("\t}")
w("\treturn nil")
w("}")
w("")
w("func (m *Message) ParseFields(data []byte) []ParsedField {")
w("\tvar result []ParsedField")
w('\tresult = append(result, ParsedField{0, "MTI", m.MTI, hex.EncodeToString(data[0:2])})')
w("\tif len(data) < 3 {")
w("\t\treturn result")
w("\t}")
w("\toffset := 2")
w("\thasSecondary := (data[offset] & 0x80) != 0")
w("\tbmLen := 8")
w("\tif hasSecondary {")
w("\t\tbmLen = 16")
w("\t\tif offset+8 < len(data) {")
w("\t\t\thasTertiary := (data[offset+8] & 0x80) != 0")
w("\t\t\tif hasTertiary {")
w("\t\t\t\tbmLen = 24")
w("\t\t\t}")
w("\t\t}")
w("\t}")
w("\tbmHex := hex.EncodeToString(data[offset : offset+bmLen])")
w('\tbitmapName := "Bitmap"')
w("\tif bmLen == 16 {")
w('\t\tbitmapName = "Bitmap (Primary+Secondary)"')
w("\t} else if bmLen == 24 {")
w('\t\tbitmapName = "Bitmap (Primary+Secondary+Tertiary)"')
w("\t}")
w("\tresult = append(result, ParsedField{1, bitmapName, bmHex, bmHex})")
w("\tbm := data[offset : offset+bmLen]")
w("\toffset += bmLen")
w("\tbc := bmLen / 8")
w("\tmaxId := bc * 64")
w("\tfor id := 2; id <= maxId; id++ {")
w("\t\tbi := (id - 1) / 8")
w("\t\tbt := uint(7 - ((id - 1) % 8))")
w("\t\tif (bm[bi] & (1 << bt)) == 0 {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tspec, ok := FieldSpecs[id]")
w("\t\tif !ok {")
w("\t\t\tcontinue")
w("\t\t}")
w("\t\tstart := offset")
w("\t\tswitch spec.Type {")
w("\t\tcase FTFixed:")
w('\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\toffset += (spec.MaxLen + 1) / 2")
w('\t\t\t} else if spec.Encoding == "hex" {')
w("\t\t\t\toffset += spec.MaxLen")
w("\t\t\t} else {")
w("\t\t\t\toffset += spec.MaxLen")
w("\t\t\t}")
w("\t\tcase FTLLVAR:")
w("\t\t\tif offset+2 <= len(data) {")
w("\t\t\t\tl, _ := strconv.Atoi(string(data[offset : offset+2]))")
w("\t\t\t\toffset += 2")
w('\t\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\t\toffset += (l + 1) / 2")
w("\t\t\t\t} else {")
w("\t\t\t\t\toffset += l")
w("\t\t\t\t}")
w("\t\t\t}")
w("\t\tcase FTLLLVAR:")
w("\t\t\tif offset+3 <= len(data) {")
w("\t\t\t\tl, _ := strconv.Atoi(string(data[offset : offset+3]))")
w("\t\t\t\toffset += 3")
w('\t\t\t\tif spec.Encoding == "bcd" {')
w("\t\t\t\t\toffset += (l + 1) / 2")
w("\t\t\t\t} else {")
w("\t\t\t\t\toffset += l")
w("\t\t\t\t}")
w("\t\t\t}")
w("\t\t}")
w("\t\tif start < len(data) {")
w("\t\t\tend := offset")
w("\t\t\tif end > len(data) {")
w("\t\t\t\tend = len(data)")
w("\t\t\t}")
w("\t\t\tf, _ := m.Fields[id]")
w("\t\t\tresult = append(result, ParsedField{id, spec.Name, f, strings.ToUpper(hex.EncodeToString(data[start:end]))})")
w("\t\t}")
w("\t}")
w("\treturn result")
w("}")
w("")
w("var macKey = getMACKey()")
w("")
w("func getMACKey() string {")
w('\tk := os.Getenv("EFTPOS_MAC_KEY")')
w('\tif k == "" {')
w('\t\tk = "0123456789ABCDEF"')
w("\t}")
w("\treturn k")
w("}")
w("")
w("func calcANSIX99(data []byte, keyHex string) ([]byte, error) {")
w("\tkeyBytes, err := hex.DecodeString(keyHex)")
w("\tif err != nil || len(keyBytes) != 8 {")
w('\t\treturn nil, fmt.Errorf("invalid MAC key: must be 16 hex chars (8 bytes)")')
w("\t}")
w("\tblock, err := des.NewCipher(keyBytes)")
w("\tif err != nil {")
w("\t\treturn nil, err")
w("\t}")
w("\tpadded := make([]byte, len(data))")
w("\tcopy(padded, data)")
w("\tfor len(padded)%8 != 0 {")
w("\t\tpadded = append(padded, 0x00)")
w("\t}")
w("\tvar prev [8]byte")
w("\tfor i := 0; i < len(padded); i += 8 {")
w("\t\tvar block8 [8]byte")
w("\t\tcopy(block8[:], padded[i:i+8])")
w("\t\tfor j := 0; j < 8; j++ {")
w("\t\t\tblock8[j] ^= prev[j]")
w("\t\t}")
w("\t\tblock.Encrypt(prev[:], block8[:])")
w("\t}")
w("\tmac := make([]byte, 8)")
w("\tcopy(mac, prev[:])")
w("\treturn mac, nil")
w("}")
w("")
w("func (m *Message) PackWithMAC() []byte {")
w("\tmacFieldID := 64")
w("\tmf := maxFieldID(m.Fields)")
w("\tif mf > 128 {")
w("\t\tmacFieldID = 128")
w("\t}")
w("\tdelete(m.Fields, 64)")
w("\tdelete(m.Fields, 128)")
w("\tpacked := m.Pack()")
w("\tmac, err := calcANSIX99(packed, macKey)")
w("\tif err != nil {")
w("\t\treturn packed")
w("\t}")
w("\tm.Fields[macFieldID] = strings.ToUpper(hex.EncodeToString(mac))")
w("\tpacked = m.Pack()")
w("\treturn packed")
w("}")
w("")
w("type Terminal struct {")
w("\tTerminalID   string")
w("\tMerchantID   string")
w("\tMerchantName string")
w("\tSTAN         int")
w("\tInstID       string")
w("}")
w("")
w("func NewTerminal() *Terminal {")
w("\treturn &Terminal{")
w('\t\tTerminalID:   "TERM0010",')
w('\t\tMerchantID:   "123456789012345",')
w('\t\tMerchantName: "ACM STORE      SYDNEY    AU",')
w("\t\tSTAN:         1,")
w('\t\tInstID:       "123456",')
w("\t}")
w("}")
w("")
w("func (t *Terminal) NextSTAN() int {")
w("\tt.STAN++")
w("\tif t.STAN > 999999 {")
w("\t\tt.STAN = 1")
w("\t}")
w("\treturn t.STAN")
w("}")
w("")
w('func (t *Terminal) BuildAuth(pan, amount, expiry string) *Message {')
w("\tnow := time.Now()")
w("\tstan := t.NextSTAN()")
w("\tmsg := NewMessage()")
w('\tmsg.MTI = "0100"')
w("\tmsg.SetField(2, pan)")
w('\tmsg.SetField(3, "000000")')
w("\tmsg.SetField(4, amount)")
w('\tmsg.SetField(7, now.Format("060102")+"1200")')
w('\tmsg.SetField(11, fmt.Sprintf("%06d", stan))')
w('\tmsg.SetField(12, now.Format("150405"))')
w('\tmsg.SetField(13, now.Format("0102"))')
w("\tmsg.SetField(14, expiry)")
w('\tmsg.SetField(18, "5411")')
w('\tmsg.SetField(22, "011")')
w('\tmsg.SetField(23, "001")')
w('\tmsg.SetField(25, "00")')
w("\tmsg.SetField(32, t.InstID)")
w("\tmsg.SetField(41, t.TerminalID)")
w("\tmsg.SetField(42, t.MerchantID)")
w("\tmsg.SetField(43, t.MerchantName)")
w('\tmsg.SetField(49, "840")')
w("\treturn msg")
w("}")
w("")
w('func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string) *Message {')
w("\tnow := time.Now()")
w("\tstan := t.NextSTAN()")
w("\tmsg := NewMessage()")
w('\tmsg.MTI = "0400"')
w("\tmsg.SetField(2, pan)")
w('\tmsg.SetField(3, "000000")')
w("\tmsg.SetField(4, amount)")
w('\tmsg.SetField(7, now.Format("060102")+"1200")')
w('\tmsg.SetField(11, fmt.Sprintf("%06d", stan))')
w('\tmsg.SetField(12, now.Format("150405"))')
w('\tmsg.SetField(13, now.Format("0102"))')
w("\tmsg.SetField(14, expiry)")
w('\tmsg.SetField(18, "5411")')
w('\tmsg.SetField(22, "011")')
w('\tmsg.SetField(23, "001")')
w('\tmsg.SetField(25, "00")')
w("\tmsg.SetField(32, t.InstID)")
w("\tmsg.SetField(37, rrn)")
w("\tmsg.SetField(41, t.TerminalID)")
w("\tmsg.SetField(42, t.MerchantID)")
w("\tmsg.SetField(43, t.MerchantName)")
w('\tmsg.SetField(49, "840")')
w("\treturn msg")
w("}")
w("")
w("type Host struct{}")
w("")
w("func NewHost() *Host { return &Host{} }")
w("")
w("func (h *Host) ProcessAuth(req *Message) *Message {")
w("\tr := rand.New(rand.NewSource(time.Now().UnixNano()))")
w("\tresp := NewMessage()")
w('\tresp.MTI = "0110"')
w("\tfor k, v := range req.Fields {")
w("\t\tresp.Fields[k] = v")
w("\t}")
w('\tresp.SetField(37, fmt.Sprintf("%012d", r.Int63n(999999999999)))')
w("\tif r.Intn(100) < 80 {")
w('\t\tresp.SetField(39, "00")')
w('\t\tresp.SetField(38, fmt.Sprintf("%06d", r.Intn(999999)))')
w("\t} else {")
w('\t\tresp.SetField(39, "05")')
w('\t\tresp.SetField(38, "      ")')
w("\t}")
w("\treturn resp")
w("}")
w("")
w("func (h *Host) ProcessReversal(req *Message) *Message {")
w("\tresp := NewMessage()")
w('\tresp.MTI = "0410"')
w("\tfor k, v := range req.Fields {")
w("\t\tresp.Fields[k] = v")
w("\t}")
w('\tresp.SetField(39, "00")')
w('\tresp.SetField(38, "REVRSD")')
w("\treturn resp")
w("}")
w("")
w("type TxRequest struct {")
w('\tType   string `json:"type"`')
w('\tPAN    string `json:"pan"`')
w('\tAmount string `json:"amount"`')
w('\tExpiry string `json:"expiry"`')
w('\tRRN    string `json:"rrn"`')
w('\tUseMAC bool   `json:"use_mac"`')
w("}")
w("")
w("type TxResponse struct {")
w('\tRequestHex      string        `json:"request_hex"`')
w('\tRequestHexDump  string        `json:"request_hexdump"`')
w('\tRequestFields   []ParsedField `json:"request_fields"`')
w('\tResponseHex     string        `json:"response_hex"`')
w('\tResponseHexDump string        `json:"response_hexdump"`')
w('\tResponseFields  []ParsedField `json:"response_fields"`')
w('\tMACKey          string        `json:"mac_key,omitempty"`')
w('\tMACAlgorithm    string        `json:"mac_algorithm,omitempty"`')
w('\tBitmapCount     int           `json:"bitmap_count"`')
w("}")
w("")
w("var terminal = NewTerminal()")
w("var host = NewHost()")
w("")
w("func handleTx(w http.ResponseWriter, r *http.Request) {")
w('\tw.Header().Set("Access-Control-Allow-Origin", "*")')
w('\tw.Header().Set("Content-Type", "application/json")')
w("\tvar tx TxRequest")
w("\tjson.NewDecoder(r.Body).Decode(&tx)")
w("\tvar reqMsg, respMsg *Message")
w('\tif tx.Type == "auth" {')
w("\t\treqMsg = terminal.BuildAuth(tx.PAN, tx.Amount, tx.Expiry)")
w("\t\trespMsg = host.ProcessAuth(reqMsg)")
w("\t} else {")
w("\t\treqMsg = terminal.BuildReversal(tx.PAN, tx.Amount, tx.Expiry, tx.RRN)")
w("\t\trespMsg = host.ProcessReversal(reqMsg)")
w("\t}")
w("\tvar reqData, respData []byte")
w("\tif tx.UseMAC {")
w("\t\treqData = reqMsg.PackWithMAC()")
w("\t\trespData = respMsg.PackWithMAC()")
w("\t} else {")
w("\t\treqData = reqMsg.Pack()")
w("\t\trespData = respMsg.Pack()")
w("\t}")
w("\treqParsed := NewMessage()")
w("\treqParsed.Unpack(reqData)")
w("\trespParsed := NewMessage()")
w("\trespParsed.Unpack(respData)")
w("\tmf := maxFieldID(reqMsg.Fields)")
w("\tbc := bitmapCount(mf)")
w("\tresult := TxResponse{")
w("\t\tRequestHex:      strings.ToUpper(hex.EncodeToString(reqData)),")
w("\t\tRequestHexDump:  HexDump(reqData),")
w("\t\tRequestFields:   reqParsed.ParseFields(reqData),")
w("\t\tResponseHex:     strings.ToUpper(hex.EncodeToString(respData)),")
w("\t\tResponseHexDump: HexDump(respData),")
w("\t\tResponseFields:  respParsed.ParseFields(respData),")
w("\t\tBitmapCount:     bc,")
w("\t}")
w("\tif tx.UseMAC {")
w("\t\tresult.MACKey = macKey")
w('\t\tresult.MACAlgorithm = "ANSI X9.9 (DES CBC 64-bit)"')
w("\t}")
w("\tjson.NewEncoder(w).Encode(result)")
w("}")
w("")
w("func main() {")
w('\tfs := http.FileServer(http.Dir("./static"))')
w('\thttp.Handle("/", fs)')
w('\thttp.HandleFunc("/api/tx", handleTx)')
w('\tfmt.Printf("Server starting on :8080\\n")')
w('\tfmt.Printf("MAC Key: %s (set EFTPOS_MAC_KEY env to change)\\n", macKey)')
w('\thttp.ListenAndServe(":8080", nil)')
w("}")

out.close()
print("main.go generated successfully")
	for id := range m.Fields {
		if id > maxField {
			maxField = id
		}
	}
	bitmapSize := 8
	if maxField > 64 {
		bitmapSize = 16
	}
	bitmap := make([]byte, bitmapSize)
	for id := range m.Fields {
		if id < 2 || id > 128 {
			continue
		}
		byteIdx := (id - 1) / 8
		bitIdx := uint(7 - ((id - 1) % 8))
		bitmap[byteIdx] |= 1 << bitIdx
	}
	if maxField > 64 {
		bitmap[0] |= 0x80
	}
	return bitmap
}

func encodeBCD(value string, byteLen int) ([]byte, error) {
	padded := value
	if len(value)%2 != 0 {
		padded = "0" + value
	}
	for len(padded)/2 < byteLen {
		padded = "0" + padded
	}
	if len(padded)/2 > byteLen {
		padded = padded[len(padded)-byteLen*2:]
	}
	return hex.DecodeString(padded)
}

func (m *Message) Pack() ([]byte, error) {
	var buf []byte
	mti, err := encodeBCD(m.MTI, 2)
	if err != nil {
		return nil, fmt.Errorf("packing MTI: %w", err)
	}
	buf = append(buf, mti...)
	bitmap := m.bitmap()
	buf = append(buf, bitmap...)
	for i := 2; i <= 128; i++ {
		val, ok := m.Fields[i]
		if !ok {
			continue
		}
		spec, exists := FieldSpecs[i]
		if !exists {
			return nil, fmt.Errorf("no spec for field %d", i)
		}
		fb, err := packField(spec, val)
		if err != nil {
			return nil, fmt.Errorf("packing field %d: %w", i, err)
		}
		buf = append(buf, fb...)
	}
	msgLen := make([]byte, 2)
	binary.BigEndian.PutUint16(msgLen, uint16(len(buf)))
	return append(msgLen, buf...), nil
}

func packField(spec FieldSpec, value string) ([]byte, error) {
	var data []byte
	var err error
	switch spec.Encoding {
	case "bcd":
		bl := (spec.MaxLen + 1) / 2
		data, err = encodeBCD(value, bl)
	case "ascii":
		data = []byte(value)
	case "binary":
		data, err = hex.DecodeString(value)
	default:
		data = []byte(value)
	}
	if err != nil {
		return nil, err
	}
	switch spec.Type {
	case FTFixed:
		return data, nil
	case FTLLVAR:
		ll := []byte{byte(len(value))}
		return append(ll, data...), nil
	case FTLLLVAR:
		lll := make([]byte, 2)
		binary.BigEndian.PutUint16(lll, uint16(len(value)))
		return append(lll, data...), nil
	}
	return nil, fmt.Errorf("unknown field type")
}

func Unpack(data []byte) (*Message, []ParsedField, error) {
	if len(data) < 2 {
		return nil, nil, fmt.Errorf("data too short")
	}
	msgLen := int(binary.BigEndian.Uint16(data[0:2]))
	if len(data)-2 < msgLen {
		return nil, nil, fmt.Errorf("length mismatch: need %d got %d", msgLen, len(data)-2)
	}
	buf := data[2 : 2+msgLen]
	var fields []ParsedField
	msg := NewMessage()
	offset := 0

	mtiHex := hex.EncodeToString(buf[offset : offset+2])
	msg.MTI = mtiHex
	fields = append(fields, ParsedField{
		ID: 0, Name: "Message Type Indicator", Value: mtiHex, HexValue: mtiHex, RawLen: 2,
	})
	offset += 2

	bitmapSize := 8
	if len(buf) > offset && buf[offset]&0x80 != 0 {
		bitmapSize = 16
	}
	bitmap := buf[offset : offset+bitmapSize]
	fields = append(fields, ParsedField{
		ID: 1, Name: "Bitmap", Value: formatBitmap(bitmap),
		HexValue: hex.EncodeToString(bitmap), RawLen: bitmapSize,
	})
	offset += bitmapSize

	for i := 2; i <= bitmapSize*8; i++ {
		byteIdx := (i - 1) / 8
		bitIdx := uint(7 - ((i - 1) % 8))
		if byteIdx >= len(bitmap) || bitmap[byteIdx]&(1<<bitIdx) == 0 {
			continue
		}
		spec, exists := FieldSpecs[i]
		if !exists {
			return nil, nil, fmt.Errorf("no spec for field %d", i)
		}
		val, valHex, consumed, err := unpackField(spec, buf[offset:])
		if err != nil {
			return nil, nil, fmt.Errorf("field %d: %w", i, err)
		}
		msg.Fields[i] = val
		fields = append(fields, ParsedField{
			ID: i, Name: spec.Name, Value: val, HexValue: valHex, RawLen: consumed,
		})
		offset += consumed
	}
	return msg, fields, nil
}

func unpackField(spec FieldSpec, data []byte) (string, string, int, error) {
	offset := 0
	dataLen := 0
	switch spec.Type {
	case FTFixed:
		if spec.Encoding == "bcd" {
			dataLen = (spec.MaxLen + 1) / 2
		} else {
			dataLen = spec.MaxLen
		}
	case FTLLVAR:
		if len(data) < 1 {
			return "", "", 0, fmt.Errorf("no LL")
		}
		dataLen = int(data[0])
		offset = 1
	case FTLLLVAR:
		if len(data) < 2 {
			return "", "", 0, fmt.Errorf("no LLL")
		}
		dataLen = int(binary.BigEndian.Uint16(data[0:2]))
		offset = 2
	}
	if offset+dataLen > len(data) {
		return "", "", 0, fmt.Errorf("short data for %s", spec.Name)
	}
	raw := data[offset : offset+dataLen]
	hexVal := hex.EncodeToString(raw)
	var val string
	switch spec.Encoding {
	case "bcd":
		val = strings.TrimLeft(hexVal, "0")
		if val == "" {
			val = "0"
		}
		if spec.Type == FTFixed && len(val) > spec.MaxLen {
			val = val[len(val)-spec.MaxLen:]
		}
	case "ascii":
		val = string(raw)
	case "binary":
		val = hexVal
	default:
		val = string(raw)
	}
	return val, hexVal, offset + dataLen, nil
}

func formatBitmap(bitmap []byte) string {
	var sb strings.Builder
	for i, b := range bitmap {
		if i > 0 {
			sb.WriteString(" ")
		}
		sb.WriteString(fmt.Sprintf("%08b", b))
	}
	return sb.String()
}

func HexDump(data []byte) string {
	var sb strings.Builder
	for i := 0; i < len(data); i += 16 {
		sb.WriteString(fmt.Sprintf("%04X  ", i))
		hp := ""
		ap := ""
		for j := 0; j < 16; j++ {
			if i+j < len(data) {
				hp += fmt.Sprintf("%02X ", data[i+j])
				if data[i+j] >= 0x20 && data[i+j] <= 0x7E {
					ap += string(data[i+j])
				} else {
					ap += "."
				}
			} else {
				hp += "   "
				ap += " "
			}
			if j == 7 {
				hp += " "
			}
		}
		sb.WriteString(fmt.Sprintf("%-49s  %s\n", hp, ap))
	}
	return sb.String()
}
''')

# --- terminal/terminal.go ---
write_file("terminal/terminal.go", r'''package terminal

import (
	"eftpos-simulator/iso8583"
	"fmt"
	"math/rand"
	"time"
)

type TransactionType int

const (
	Authorization TransactionType = iota
	Reversal
)

type Terminal struct {
	TerminalID    string
	MerchantID    string
	MerchantName  string
	STAN          int
	InstitutionID string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:    "TERM0010",
		MerchantID:    "123456789012345",
		MerchantName:  "ACME STORE       SYDNEY   AU",
		STAN:          1,
		InstitutionID: "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func (t *Terminal) BuildAuthorization(pan, amount, expiry string) (*iso8583.Message, error) {
	now := time.Now()
	stan := t.NextSTAN()

	msg := iso8583.NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstitutionID)
	msg.SetField(35, pan+"="+expiry)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")

	return msg, nil
}

func (t *Terminal) BuildReversal(originalMTI, pan, amount, expiry, stan, retrievalRef string) (*iso8583.Message, error) {
	now := time.Now()

	msg := iso8583.NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("0601")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstitutionID)
	msg.SetField(35, pan+"="+expiry)
	msg.SetField(37, retrievalRef)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")

	return msg, nil
}

func RandomPAN() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	prefix := "4567"
	for i := 0; i < 12; i++ {
		prefix += fmt.Sprintf("%d", r.Intn(10))
	}
	return prefix
}

func RandomAmount() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	amount := r.Intn(999999)
	return fmt.Sprintf("%012d", amount)
}
''')

# --- host/host.go ---
write_file("host/host.go", r'''package host

import (
	"eftpos-simulator/iso8583"
	"fmt"
	"math/rand"
	"time"
)

type Host struct{}

func NewHost() *Host {
	return &Host{}
}

func (h *Host) ProcessAuthorization(msg *iso8583.Message) (*iso8583.Message, error) {
	resp := iso8583.NewMessage()
	resp.MTI = "0110"

	resp.SetField(2, msg.GetField(2))
	resp.SetField(3, msg.GetField(3))
	resp.SetField(4, msg.GetField(4))
	resp.SetField(7, msg.GetField(7))
	resp.SetField(11, msg.GetField(11))
	resp.SetField(12, msg.GetField(12))
	resp.SetField(13, msg.GetField(13))
	resp.SetField(18, msg.GetField(18))
	resp.SetField(22, msg.GetField(22))
	resp.SetField(23, msg.GetField(23))
	resp.SetField(25, msg.GetField(25))
	resp.SetField(32, msg.GetField(32))
	resp.SetField(41, msg.GetField(41))
	resp.SetField(42, msg.GetField(42))
	resp.SetField(43, msg.GetField(43))
	resp.SetField(49, msg.GetField(49))

	rrn := generateRRN()
	resp.SetField(37, rrn)

	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	if r.Intn(10) < 8 {
		authCode := fmt.Sprintf("%06d", r.Intn(1000000))
		resp.SetField(38, authCode)
		resp.SetField(39, "00")
	} else {
		resp.SetField(38, "")
		resp.SetField(39, "05")
	}

	return resp, nil
}

func (h *Host) ProcessReversal(msg *iso8583.Message) (*iso8583.Message, error) {
	resp := iso8583.NewMessage()
	resp.MTI = "0410"

	resp.SetField(2, msg.GetField(2))
	resp.SetField(3, msg.GetField(3))
	resp.SetField(4, msg.GetField(4))
	resp.SetField(7, msg.GetField(7))
	resp.SetField(11, msg.GetField(11))
	resp.SetField(12, msg.GetField(12))
	resp.SetField(13, msg.GetField(13))
	resp.SetField(18, msg.GetField(18))
	resp.SetField(22, msg.GetField(22))
	resp.SetField(23, msg.GetField(23))
	resp.SetField(25, msg.GetField(25))
	resp.SetField(32, msg.GetField(32))
	resp.SetField(37, msg.GetField(37))
	resp.SetField(41, msg.GetField(41))
	resp.SetField(42, msg.GetField(42))
	resp.SetField(43, msg.GetField(43))
	resp.SetField(49, msg.GetField(49))

	resp.SetField(38, "")
	resp.SetField(39, "00")

	return resp, nil
}

func generateRRN() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%012d", r.Intn(1000000000000))
}
''')

# --- server/server.go ---
write_file("server/server.go", r'''package server

import (
	"eftpos-simulator/host"
	"eftpos-simulator/iso8583"
	"eftpos-simulator/terminal"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type MessageEvent struct {
	Direction   string                ` + "`" + `json:"direction"` + "`" + `
	MTI         string                ` + "`" + `json:"mti"` + "`" + `
	HexRaw      string                ` + "`" + `json:"hex_raw"` + "`" + `
	HexDump     string                ` + "`" + `json:"hex_dump"` + "`" + `
	Fields      []iso8583.ParsedField ` + "`" + `json:"fields"` + "`" + `
	Timestamp   string                ` + "`" + `json:"timestamp"` + "`" + `
	Description string                ` + "`" + `json:"description"` + "`" + `
}

type SimRequest struct {
	Type   string ` + "`" + `json:"type"` + "`" + `
	PAN    string ` + "`" + `json:"pan"` + "`" + `
	Amount string ` + "`" + `json:"amount"` + "`" + `
	Expiry string ` + "`" + `json:"expiry"` + "`" + `
}

var clients = make(map[*websocket.Conn]bool)
var term = terminal.NewTerminal()
var bankHost = host.NewHost()

func handleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WS upgrade error:", err)
		return
	}
	defer conn.Close()
	clients[conn] = true
	defer delete(clients, conn)

	for {
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var req SimRequest
		if err := json.Unmarshal(msgBytes, &req); err != nil {
			conn.WriteJSON(map[string]string{"error": err.Error()})
			continue
		}

		go processTransaction(req)
	}
}

func processTransaction(req SimRequest) {
	pan := req.PAN
	if pan == "" {
		pan = terminal.RandomPAN()
	}
	amount := req.Amount
	if amount == "" {
		amount = terminal.RandomAmount()
	}
	expiry := req.Expiry
	if expiry == "" {
		expiry = "2512"
	}

	var reqMsg *iso8583.Message
	var err error
	var desc string

	switch req.Type {
	case "reversal":
		reqMsg, err = term.BuildReversal("0100", pan, amount, expiry, term.STAN, fmt.Sprintf("%012d", time.Now().UnixMilli()%1000000000000))
		desc = "Reversal Request"
	default:
		reqMsg, err = term.BuildAuthorization(pan, amount, expiry)
		desc = "Authorization Request"
	}

	if err != nil {
		broadcastError(fmt.Sprintf("Build error: %v", err))
		return
	}

	reqPacked, err := reqMsg.Pack()
	if err != nil {
		broadcastError(fmt.Sprintf("Pack error: %v", err))
		return
	}

	_, reqFields, err := iso8583.Unpack(reqPacked)
	if err != nil {
		broadcastError(fmt.Sprintf("Unpack error: %v", err))
		return
	}

	broadcast(MessageEvent{
		Direction:   "TERMINAL -> HOST",
		MTI:         reqMsg.MTI,
		HexRaw:      hex.EncodeToString(reqPacked),
		HexDump:     iso8583.HexDump(reqPacked),
		Fields:      reqFields,
		Timestamp:   time.Now().Format("15:04:05.000"),
		Description: desc,
	})

	time.Sleep(300 * time.Millisecond)

	var respMsg *iso8583.Message
	switch req.Type {
	case "reversal":
		respMsg, err = bankHost.ProcessReversal(reqMsg)
		desc = "Reversal Response"
	default:
		respMsg, err = bankHost.ProcessAuthorization(reqMsg)
		desc = "Authorization Response"
	}

	if err != nil {
		broadcastError(fmt.Sprintf("Host error: %v", err))
		return
	}

	respPacked, err := respMsg.Pack()
	if err != nil {
		broadcastError(fmt.Sprintf("Pack response error: %v", err))
		return
	}

	_, respFields, err := iso8583.Unpack(respPacked)
	if err != nil {
		broadcastError(fmt.Sprintf("Unpack response error: %v", err))
		return
	}

	broadcast(MessageEvent{
		Direction:   "HOST -> TERMINAL",
		MTI:         respMsg.MTI,
		HexRaw:      hex.EncodeToString(respPacked),
		HexDump:     iso8583.HexDump(respPacked),
		Fields:      respFields,
		Timestamp:   time.Now().Format("15:04:05.000"),
		Description: desc,
	})
}

func broadcast(evt MessageEvent) {
	for client := range clients {
		err := client.WriteJSON(evt)
		if err != nil {
			client.Close()
			delete(clients, client)
		}
	}
}

func broadcastError(msg string) {
	broadcast(MessageEvent{
		Direction:   "ERROR",
		MTI:         "",
		HexRaw:      "",
		HexDump:     msg,
		Fields:      nil,
		Timestamp:   time.Now().Format("15:04:05.000"),
		Description: "Error",
	})
}

func Start(port int) {
	http.HandleFunc("/ws", handleWS)
	http.Handle("/", http.FileServer(http.Dir("static")))
	addr := fmt.Sprintf(":%d", port)
	log.Printf("EFTPOS Simulator running on http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
''')

# --- main.go ---
write_file("main.go", r'''package main

import (
	"eftpos-simulator/server"
)

func main() {
	server.Start(8080)
}
''')

# --- static/index.html ---
write_file("static/index.html", r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>EFTPOS ISO 8583 Simulator</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg: #0a0e17; --surface: #111827; --border: #1e293b;
    --text: #e2e8f0; --muted: #64748b; --accent: #3b82f6;
    --green: #10b981; --red: #ef4444; --orange: #f59e0b;
  }
  body { font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace; background: var(--bg); color: var(--text); min-height: 100vh; }
  .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header .badge { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
  .status-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .container { display: grid; grid-template-columns: 320px 1fr; height: calc(100vh - 57px); }
  .sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 20px; overflow-y: auto; }
  .sidebar h2 { font-size: 13px; text-transform: uppercase; color: var(--muted); margin-bottom: 12px; letter-spacing: 1px; }
  .form-group { margin-bottom: 14px; }
  .form-group label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  .form-group input, .form-group select { width: 100%; padding: 8px 10px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-family: inherit; font-size: 13px; }
  .form-group input:focus, .form-group select:focus { outline: none; border-color: var(--accent); }
  .btn { width: 100%; padding: 10px; border: none; border-radius: 6px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
  .btn-auth { background: var(--accent); color: #fff; }
  .btn-auth:hover { background: #2563eb; }
  .btn-reversal { background: var(--orange); color: #fff; margin-top: 8px; }
  .btn-reversal:hover { background: #d97706; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .main { overflow-y: auto; padding: 20px; }
  .event-card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 16px; overflow: hidden; animation: fadeIn 0.3s; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  .event-header { padding: 12px 16px; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border); }
  .direction { font-size: 12px; font-weight: 600; padding: 3px 8px; border-radius: 4px; }
  .direction.out { background: rgba(59,130,246,0.15); color: var(--accent); }
  .direction.in { background: rgba(16,185,129,0.15); color: var(--green); }
  .direction.err { background: rgba(239,68,68,0.15); color: var(--red); }
  .mti-badge { font-size: 13px; font-weight: 700; color: var(--text); }
  .timestamp { font-size: 11px; color: var(--muted); margin-left: auto; }
  .desc { font-size: 11px; color: var(--muted); }
  .event-body { padding: 0; }
  .hex-section { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .hex-section h3 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; letter-spacing: 1px; cursor: pointer; }
  .hex-content { font-size: 11px; line-height: 1.6; color: #94a3b8; white-space: pre; overflow-x: auto; }
  .hex-raw { font-size: 10px; color: var(--muted); word-break: break-all; margin-top: 6px; padding: 6px 8px; background: var(--bg); border-radius: 4px; cursor: pointer; }
  .fields-section { padding: 0; }
  .fields-section h3 { font-size: 11px; text-transform: uppercase; color: var(--muted); padding: 12px 16px 8px; letter-spacing: 1px; }
  .field-row { display: grid; grid-template-columns: 50px 200px 1fr; padding: 6px 16px; border-bottom: 1px solid rgba(30,41,59,0.5); font-size: 12px; align-items: center; }
  .field-row:hover { background: rgba(59,130,246,0.05); }
  .field-id { color: var(--accent); font-weight: 600; }
  .field-name { color: var(--muted); }
  .field-value { color: var(--text); word-break: break-all; }
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--muted); gap: 12px; }
  .empty-state svg { opacity: 0.3; }
  .empty-state p { font-size: 14px; }
  .mti-legend { margin-top: 20px; padding: 12px; background: var(--bg); border-radius: 6px; border: 1px solid var(--border); }
  .mti-legend h3 { font-size: 11px; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; letter-spacing: 1px; }
  .mti-legend-item { font-size: 11px; color: var(--muted); margin-bottom: 4px; }
  .mti-legend-item span { color: var(--accent); font-weight: 600; }
</style>
</head>
<body>
<div class="header">
  <div class="status-dot" id="statusDot"></div>
  <h1>EFTPOS ISO 8583 Simulator</h1>
  <span class="badge">v1.0</span>
</div>
<div class="container">
  <div class="sidebar">
    <h2>Transaction Parameters</h2>
    <div class="form-group">
      <label>Transaction Type</label>
      <select id="txType">
        <option value="auth">Authorization (0100)</option>
        <option value="reversal">Reversal (0400)</option>
      </select>
    </div>
    <div class="form-group">
      <label>Card Number (PAN)</label>
      <input id="pan" placeholder="4567xxxxxxxxxxxx" maxlength="19">
    </div>
    <div class="form-group">
      <label>Amount (cents)</label>
      <input id="amount" placeholder="000000001000" maxlength="12">
    </div>
    <div class="form-group">
      <label>Expiry Date (YYMM)</label>
      <input id="expiry" placeholder="2512" maxlength="4">
    </div>
    <button class="btn btn-auth" id="btnAuth" onclick="sendTx()">Send Authorization</button>
    <button class="btn btn-reversal" id="btnReversal" onclick="sendReversal()">Send Reversal</button>

    <div class="mti-legend">
      <h3>MTI Reference</h3>
      <div class="mti-legend-item"><span>0100</span> - Authorization Request</div>
      <div class="mti-legend-item"><span>0110</span> - Authorization Response</div>
      <div class="mti-legend-item"><span>0400</span> - Reversal Request</div>
      <div class="mti-legend-item"><span>0410</span> - Reversal Response</div>
    </div>
  </div>
  <div class="main" id="main">
    <div class="empty-state" id="emptyState">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>
      </svg>
      <p>Send a transaction to see ISO 8583 messages</p>
    </div>
  </div>
</div>
<script>
let ws;
const main = document.getElementById('main');
const emptyState = document.getElementById('emptyState');
const statusDot = document.getElementById('statusDot');

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(proto + '://' + location.host + '/ws');
  ws.onopen = () => { statusDot.classList.add('connected'); };
  ws.onclose = () => { statusDot.classList.remove('connected'); setTimeout(connect, 2000); };
  ws.onmessage = (e) => {
    const evt = JSON.parse(e.data);
    if (emptyState) emptyState.remove();
    renderEvent(evt);
  };
}

function sendTx() {
  if (!ws || ws.readyState !== 1) return;
  const type = document.getElementById('txType').value;
  ws.send(JSON.stringify({
    type: type === 'reversal' ? 'reversal' : 'auth',
    pan: document.getElementById('pan').value,
    amount: document.getElementById('amount').value,
    expiry: document.getElementById('expiry').value,
  }));
}

function sendReversal() {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({
    type: 'reversal',
    pan: document.getElementById('pan').value,
    amount: document.getElementById('amount').value,
    expiry: document.getElementById('expiry').value,
  }));
}

function renderEvent(evt) {
  const dirClass = evt.Direction.includes('TERMINAL') ? 'out' : evt.Direction === 'ERROR' ? 'err' : 'in';
  const dirArrow = evt.Direction.includes('TERMINAL') ? '>>>' : evt.Direction === 'ERROR' ? '!!!' : '<<<';

  let fieldsHTML = '';
  if (evt.Fields && evt.Fields.length > 0) {
    fieldsHTML = '<div class="fields-section"><h3>Field Parsing</h3>';
    evt.Fields.forEach(f => {
      fieldsHTML += '<div class="field-row">' +
        '<span class="field-id">F' + f.id + '</span>' +
        '<span class="field-name">' + escHTML(f.name) + '</span>' +
        '<span class="field-value">' + escHTML(f.value) + '</span>' +
        '</div>';
    });
    fieldsHTML += '</div>';
  }

  const card = document.createElement('div');
  card.className = 'event-card';
  card.innerHTML =
    '<div class="event-header">' +
      '<span class="direction ' + dirClass + '">' + dirArrow + ' ' + escHTML(evt.Direction) + '</span>' +
      (evt.MTI ? '<span class="mti-badge">MTI ' + escHTML(evt.MTI) + '</span>' : '') +
      '<span class="desc">' + escHTML(evt.Description) + '</span>' +
      '<span class="timestamp">' + escHTML(evt.Timestamp) + '</span>' +
    '</div>' +
    '<div class="event-body">' +
      '<div class="hex-section">' +
        '<h3>Hex Dump</h3>' +
        '<div class="hex-content">' + escHTML(evt.HexDump) + '</div>' +
        (evt.HexRaw ? '<div class="hex-raw" onclick="copyHex(this)" title="Click to copy">' + escHTML(evt.HexRaw) + '</div>' : '') +
      '</div>' +
      fieldsHTML +
    '</div>';

  main.prepend(card);
}

function escHTML(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function copyHex(el) {
  navigator.clipboard.writeText(el.textContent).then(() => {
    const orig = el.style.outline;
    el.style.outline = '1px solid #3b82f6';
    setTimeout(() => { el.style.outline = orig; }, 500);
  });
}

connect();
</script>
</body>
</html>
''')

print("\nAll files generated successfully!")
