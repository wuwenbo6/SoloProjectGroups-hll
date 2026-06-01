package protocol

import (
	"crypto/md5"
	"encoding/binary"
)

type TacacsCrypto struct {
	secret string
}

func NewTacacsCrypto(secret string) *TacacsCrypto {
	return &TacacsCrypto{secret: secret}
}

func (c *TacacsCrypto) Encrypt(header *TacacsHeader, body []byte) []byte {
	return c.xorPad(header, body)
}

func (c *TacacsCrypto) Decrypt(header *TacacsHeader, body []byte) []byte {
	return c.xorPad(header, body)
}

func (c *TacacsCrypto) xorPad(header *TacacsHeader, data []byte) []byte {
	if len(data) == 0 {
		return []byte{}
	}

	result := make([]byte, len(data))
	pad := c.generatePad(header, len(data))

	for i := range data {
		result[i] = data[i] ^ pad[i]
	}

	return result
}

func (c *TacacsCrypto) generatePad(header *TacacsHeader, length int) []byte {
	pad := make([]byte, 0, length)
	secretBytes := []byte(c.secret)

	sessionIDBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(sessionIDBytes, header.SessionID)

	versionByte := []byte{header.Version}
	seqNoByte := []byte{header.SeqNo}

	var prevHash []byte

	for len(pad) < length {
		h := md5.New()

		h.Write(secretBytes)
		h.Write(sessionIDBytes)
		h.Write(versionByte)
		h.Write(seqNoByte)

		if prevHash != nil {
			h.Write(prevHash)
		}

		prevHash = h.Sum(nil)
		pad = append(pad, prevHash...)
	}

	return pad[:length]
}

func BytesToHex(data []byte) string {
	hex := ""
	for _, b := range data {
		hex += byteToHex(b) + " "
	}
	if len(hex) > 0 {
		hex = hex[:len(hex)-1]
	}
	return hex
}

func HexToBytes(hexStr string) ([]byte, error) {
	var result []byte
	for i := 0; i < len(hexStr); i += 2 {
		if i+1 >= len(hexStr) {
			break
		}
		b, err := hexByte(hexStr[i], hexStr[i+1])
		if err != nil {
			return nil, err
		}
		result = append(result, b)
	}
	return result, nil
}

func hexByte(c1, c2 byte) (byte, error) {
	n1, err := hexNibble(c1)
	if err != nil {
		return 0, err
	}
	n2, err := hexNibble(c2)
	if err != nil {
		return 0, err
	}
	return (n1 << 4) | n2, nil
}

func hexNibble(c byte) (byte, error) {
	switch {
	case c >= '0' && c <= '9':
		return c - '0', nil
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10, nil
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10, nil
	default:
		return 0, nil
	}
}
