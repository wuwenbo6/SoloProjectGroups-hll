package stun

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/binary"
)

const (
	MagicCookie = 0x2112A442

	HeaderSize  = 20
	AttrHdrSize = 4

	AttrXORMappedAddress  = 0x0020
	AttrUsername          = 0x0006
	AttrRealm             = 0x0014
	AttrNonce             = 0x0015
	AttrMessageIntegrity  = 0x0008
	AttrErrorCode         = 0x0009
	AttrLifetime          = 0x000D
	AttrRequestedTransport = 0x0019
	AttrSoftware          = 0x8022
	AttrFingerprint       = 0x8028

	BindingRequest   = 0x0001
	BindingSuccess   = 0x0101
	BindingError     = 0x0111
	AllocateRequest  = 0x0003
	AllocateSuccess  = 0x0103
	AllocateError    = 0x0113

	CodeUnauthorized  = 401
	CodeStaleNonce    = 438
	CodeForbidden     = 403
	CodeAllocationMismatch = 437

	TransportUDP = 17
)

type Message struct {
	Type     uint16
	Length   uint16
	Cookie   uint32
	TransID  [12]byte
	Attrs    []Attribute
	RawAttrs []byte
}

type Attribute struct {
	Type   uint16
	Length uint16
	Value  []byte
}

func NewBindingRequest() *Message {
	var transID [12]byte
	rand.Read(transID[:])
	return &Message{
		Type:    BindingRequest,
		Length:  0,
		Cookie:  MagicCookie,
		TransID: transID,
	}
}

func NewAllocateRequest(username string, lifetime int) *Message {
	var transID [12]byte
	rand.Read(transID[:])
	m := &Message{
		Type:   AllocateRequest,
		Cookie: MagicCookie,
		TransID: transID,
	}
	m.AddAttr(AttrRequestedTransport, requestedTransportValue(TransportUDP))
	m.AddAttr(AttrLifetime, lifetimeValue(uint32(lifetime)))
	if username != "" {
		m.AddAttr(AttrUsername, Padded([]byte(username)))
	}
	m.AddAttr(AttrSoftware, Padded([]byte("stun-bench")))
	return m
}

func requestedTransportValue(proto byte) []byte {
	v := make([]byte, 4)
	v[0] = proto
	return v
}

func lifetimeValue(l uint32) []byte {
	v := make([]byte, 4)
	binary.BigEndian.PutUint32(v, l)
	return v
}

func Padded(b []byte) []byte {
	pad := (4 - len(b)%4) % 4
	out := make([]byte, len(b)+pad)
	copy(out, b)
	return out
}

func (m *Message) AddAttr(typ uint16, value []byte) {
	m.Attrs = append(m.Attrs, Attribute{Type: typ, Length: uint16(len(value)), Value: value})
}

func (m *Message) removeAttr(typ uint16) {
	out := m.Attrs[:0]
	for _, a := range m.Attrs {
		if a.Type != typ {
			out = append(out, a)
		}
	}
	m.Attrs = out
}

func (m *Message) GetAttr(typ uint16) (Attribute, bool) {
	for _, a := range m.Attrs {
		if a.Type == typ {
			return a, true
		}
	}
	return Attribute{}, false
}

func (m *Message) GetAttrString(typ uint16) (string, bool) {
	a, ok := m.GetAttr(typ)
	if !ok {
		return "", false
	}
	return string(a.Value), true
}

func (m *Message) GetErrorCode() (int, string) {
	a, ok := m.GetAttr(AttrErrorCode)
	if !ok || len(a.Value) < 4 {
		return 0, ""
	}
	class := int(a.Value[2] & 0x7)
	number := int(a.Value[3])
	code := class*100 + number
	reason := string(a.Value[4:])
	return code, reason
}

func (m *Message) computeLength() {
	var l int
	for _, a := range m.Attrs {
		l += AttrHdrSize + int(a.Length)
	}
	m.Length = uint16(l)
}

func (m *Message) Encode() []byte {
	m.computeLength()
	buf := make([]byte, HeaderSize+int(m.Length))
	binary.BigEndian.PutUint16(buf[0:2], m.Type)
	binary.BigEndian.PutUint16(buf[2:4], m.Length)
	binary.BigEndian.PutUint32(buf[4:8], m.Cookie)
	copy(buf[8:20], m.TransID[:])

	off := HeaderSize
	for _, a := range m.Attrs {
		binary.BigEndian.PutUint16(buf[off:off+2], a.Type)
		binary.BigEndian.PutUint16(buf[off+2:off+4], a.Length)
		copy(buf[off+4:off+4+int(a.Length)], a.Value)
		off += AttrHdrSize + int(a.Length)
	}
	return buf
}

func (m *Message) EncodeWithIntegrity(username, realm, password string) []byte {
	m.removeAttr(AttrMessageIntegrity)
	m.removeAttr(AttrFingerprint)

	key := longTermKey(username, realm, password)

	nonce, _ := m.GetAttrString(AttrNonce)
	m.removeAttr(AttrNonce)
	m.removeAttr(AttrRealm)
	m.removeAttr(AttrUsername)

	if username != "" {
		m.AddAttr(AttrUsername, Padded([]byte(username)))
	}
	if realm != "" {
		m.AddAttr(AttrRealm, Padded([]byte(realm)))
	}
	if nonce != "" {
		m.AddAttr(AttrNonce, Padded([]byte(nonce)))
	}

	m.computeLength()
	miLen := uint16(AttrHdrSize + 20)
	msgLen := m.Length + miLen
	fakeMsg := &Message{
		Type:    m.Type,
		Length:  msgLen,
		Cookie:  m.Cookie,
		TransID: m.TransID,
		Attrs:   m.Attrs,
	}

	headerAndAttrs := fakeMsg.Encode()
	mi := hmacSHA1(key, headerAndAttrs[:len(headerAndAttrs)-int(miLen)])
	m.AddAttr(AttrMessageIntegrity, mi)

	m.computeLength()
	return m.Encode()
}

func longTermKey(username, realm, password string) []byte {
	s := username + ":" + realm + ":" + password
	h := md5Hash([]byte(s))
	return h
}

func md5Hash(b []byte) []byte {
	s := make([]byte, 16)
	md5sum(s, b)
	return s
}

func hmacSHA1(key, msg []byte) []byte {
	mac := hmac.New(sha1.New, key)
	mac.Write(msg)
	return mac.Sum(nil)
}

func md5sum(out, in []byte) {
	var s [4]uint32
	s[0] = 0x67452301
	s[1] = 0xefcdab89
	s[2] = 0x98badcfe
	s[3] = 0x10325476

	var block [64]byte
	origLen := len(in)
	n := origLen / 64
	for i := 0; i < n; i++ {
		copy(block[:], in[i*64:(i+1)*64])
		md5Block(&s, &block)
	}

	rem := origLen % 64
	copy(block[:rem], in[n*64:])
	block[rem] = 0x80
	for i := rem + 1; i < 56; i++ {
		block[i] = 0
	}
	binary.LittleEndian.PutUint64(block[56:], uint64(origLen)*8)
	md5Block(&s, &block)

	for i := 0; i < 4; i++ {
		binary.LittleEndian.PutUint32(out[i*4:(i+1)*4], s[i])
	}
}

func md5Block(s *[4]uint32, block *[64]byte) {
	var x [16]uint32
	for i := 0; i < 16; i++ {
		x[i] = binary.LittleEndian.Uint32(block[i*4 : (i+1)*4])
	}

	a, b, c, d := s[0], s[1], s[2], s[3]

	f := func(x, y, z uint32) uint32 { return (x & y) | ((^x) & z) }
	g := func(x, y, z uint32) uint32 { return (x & z) | (y & (^z)) }
	h := func(x, y, z uint32) uint32 { return x ^ y ^ z }
	i := func(x, y, z uint32) uint32 { return y ^ (x | (^z)) }

	rotl := func(v uint32, n uint) uint32 { return (v << n) | (v >> (32 - n)) }

	ff := func(a, b, c, d, x, s, ac uint32) uint32 {
		a += f(b, c, d) + x + ac
		a = rotl(a, uint(s))
		return a + b
	}
	gg := func(a, b, c, d, x, s, ac uint32) uint32 {
		a += g(b, c, d) + x + ac
		a = rotl(a, uint(s))
		return a + b
	}
	hh := func(a, b, c, d, x, s, ac uint32) uint32 {
		a += h(b, c, d) + x + ac
		a = rotl(a, uint(s))
		return a + b
	}
	ii := func(a, b, c, d, x, s, ac uint32) uint32 {
		a += i(b, c, d) + x + ac
		a = rotl(a, uint(s))
		return a + b
	}

	a = ff(a, b, c, d, x[0], 7, 0xd76aa478)
	d = ff(d, a, b, c, x[1], 12, 0xe8c7b756)
	c = ff(c, d, a, b, x[2], 17, 0x242070db)
	b = ff(b, c, d, a, x[3], 22, 0xc1bdceee)
	a = ff(a, b, c, d, x[4], 7, 0xf57c0faf)
	d = ff(d, a, b, c, x[5], 12, 0x4787c62a)
	c = ff(c, d, a, b, x[6], 17, 0xa8304613)
	b = ff(b, c, d, a, x[7], 22, 0xfd469501)
	a = ff(a, b, c, d, x[8], 7, 0x698098d8)
	d = ff(d, a, b, c, x[9], 12, 0x8b44f7af)
	c = ff(c, d, a, b, x[10], 17, 0xffff5bb1)
	b = ff(b, c, d, a, x[11], 22, 0x895cd7be)
	a = ff(a, b, c, d, x[12], 7, 0x6b901122)
	d = ff(d, a, b, c, x[13], 12, 0xfd987193)
	c = ff(c, d, a, b, x[14], 17, 0xa679438e)
	b = ff(b, c, d, a, x[15], 22, 0x49b40821)

	a = gg(a, b, c, d, x[1], 5, 0xf61e2562)
	d = gg(d, a, b, c, x[6], 9, 0xc040b340)
	c = gg(c, d, a, b, x[11], 14, 0x265e5a51)
	b = gg(b, c, d, a, x[0], 20, 0xe9b6c7aa)
	a = gg(a, b, c, d, x[5], 5, 0xd62f105d)
	d = gg(d, a, b, c, x[10], 9, 0x02441453)
	c = gg(c, d, a, b, x[15], 14, 0xd8a1e681)
	b = gg(b, c, d, a, x[4], 20, 0xe7d3fbc8)
	a = gg(a, b, c, d, x[9], 5, 0x21e1cde6)
	d = gg(d, a, b, c, x[14], 9, 0xc33707d6)
	c = gg(c, d, a, b, x[3], 14, 0xf4d50d87)
	b = gg(b, c, d, a, x[8], 20, 0x455a14ed)
	a = gg(a, b, c, d, x[13], 5, 0xa9e3e905)
	d = gg(d, a, b, c, x[2], 9, 0xfcefa3f8)
	c = gg(c, d, a, b, x[7], 14, 0x676f02d9)
	b = gg(b, c, d, a, x[12], 20, 0x8d2a4c8a)

	a = hh(a, b, c, d, x[5], 4, 0xfffa3942)
	d = hh(d, a, b, c, x[8], 11, 0x8771f681)
	c = hh(c, d, a, b, x[11], 16, 0x6d9d6122)
	b = hh(b, c, d, a, x[14], 23, 0xfde5380c)
	a = hh(a, b, c, d, x[1], 4, 0xa4beea44)
	d = hh(d, a, b, c, x[4], 11, 0x4bdecfa9)
	c = hh(c, d, a, b, x[7], 16, 0xf6bb4b60)
	b = hh(b, c, d, a, x[10], 23, 0xbebfbc70)
	a = hh(a, b, c, d, x[13], 4, 0x289b7ec6)
	d = hh(d, a, b, c, x[0], 11, 0xeaa127fa)
	c = hh(c, d, a, b, x[3], 16, 0xd4ef3085)
	b = hh(b, c, d, a, x[6], 23, 0x04881d05)
	a = hh(a, b, c, d, x[9], 4, 0xd9d4d039)
	d = hh(d, a, b, c, x[12], 11, 0xe6db99e5)
	c = hh(c, d, a, b, x[15], 16, 0x1fa27cf8)
	b = hh(b, c, d, a, x[2], 23, 0xc4ac5665)

	a = ii(a, b, c, d, x[0], 6, 0xf4292244)
	d = ii(d, a, b, c, x[7], 10, 0x432aff97)
	c = ii(c, d, a, b, x[14], 15, 0xab9423a7)
	b = ii(b, c, d, a, x[5], 21, 0xfc93a039)
	a = ii(a, b, c, d, x[12], 6, 0x655b59c3)
	d = ii(d, a, b, c, x[3], 10, 0x8f0ccc92)
	c = ii(c, d, a, b, x[10], 15, 0xffeff47d)
	b = ii(b, c, d, a, x[1], 21, 0x85845dd1)
	a = ii(a, b, c, d, x[8], 6, 0x6fa87e4f)
	d = ii(d, a, b, c, x[15], 10, 0xfe2ce6e0)
	c = ii(c, d, a, b, x[6], 15, 0xa3014314)
	b = ii(b, c, d, a, x[13], 21, 0x4e0811a1)
	a = ii(a, b, c, d, x[4], 6, 0xf7537e82)
	d = ii(d, a, b, c, x[11], 10, 0xbd3af235)
	c = ii(c, d, a, b, x[2], 15, 0x2ad7d2bb)
	b = ii(b, c, d, a, x[9], 21, 0xeb86d391)

	s[0] += a
	s[1] += b
	s[2] += c
	s[3] += d
}

func Decode(data []byte) (*Message, error) {
	if len(data) < HeaderSize {
		return nil, ErrMessageTooShort
	}

	msg := &Message{
		Type:   binary.BigEndian.Uint16(data[0:2]),
		Length: binary.BigEndian.Uint16(data[2:4]),
		Cookie: binary.BigEndian.Uint32(data[4:8]),
	}
	copy(msg.TransID[:], data[8:20])

	if uint16(len(data)-HeaderSize) < msg.Length {
		return nil, ErrMessageTruncated
	}

	if msg.Cookie != MagicCookie {
		return nil, ErrInvalidCookie
	}

	msg.RawAttrs = data[HeaderSize : HeaderSize+msg.Length]
	msg.Attrs = parseAttrs(msg.RawAttrs)
	return msg, nil
}

func parseAttrs(data []byte) []Attribute {
	var attrs []Attribute
	for i := 0; i+AttrHdrSize <= len(data); {
		t := binary.BigEndian.Uint16(data[i : i+2])
		l := binary.BigEndian.Uint16(data[i+2 : i+4])
		if i+AttrHdrSize+int(l) > len(data) {
			break
		}
		v := make([]byte, l)
		copy(v, data[i+AttrHdrSize:i+AttrHdrSize+int(l)])
		attrs = append(attrs, Attribute{Type: t, Length: l, Value: v})
		padded := int(l) + (4-int(l)%4)%4
		i += AttrHdrSize + padded
	}
	return attrs
}

func (m *Message) IsSuccess() bool {
	return m.Type == BindingSuccess || m.Type == AllocateSuccess
}

func (m *Message) IsError() bool {
	return m.Type == BindingError || m.Type == AllocateError
}

func (m *Message) IsAllocateSuccess() bool {
	return m.Type == AllocateSuccess
}

func (m *Message) GetXORMappedAddress() (string, int) {
	for _, a := range m.Attrs {
		if a.Type == AttrXORMappedAddress && len(a.Value) >= 8 {
			family := a.Value[1]
			port := binary.BigEndian.Uint16(a.Value[2:4]) ^ uint16(MagicCookie>>16)
			if family == 0x01 && len(a.Value) >= 8 {
				ip := make([]byte, 4)
				binary.BigEndian.PutUint32(ip, binary.BigEndian.Uint32(a.Value[4:8])^MagicCookie)
				return fmtIP(ip), int(port)
			}
		}
	}
	return "", 0
}

func fmtIP(b []byte) string {
	return formatIPv4(b[0], b[1], b[2], b[3])
}

func formatIPv4(a, b, c, d byte) string {
	return itoa(int(a)) + "." + itoa(int(b)) + "." + itoa(int(c)) + "." + itoa(int(d))
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var buf [3]byte
	pos := 3
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	return string(buf[pos:])
}

func GenerateNonce() string {
	b := make([]byte, 16)
	rand.Read(b)
	const hex = "0123456789abcdef"
	out := make([]byte, 32)
	for i, v := range b {
		out[i*2] = hex[v>>4]
		out[i*2+1] = hex[v&0x0f]
	}
	return string(out)
}
