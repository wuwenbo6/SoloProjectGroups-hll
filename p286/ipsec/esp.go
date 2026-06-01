package ipsec

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"io"
)

const (
	ESPHeaderLen  = 8
	ESPTrailerLen = 2
	ESPICVLen     = 16
	DefaultSPI    = 0x00001000
)

type ESPHeader struct {
	SPI    uint32
	SeqNum uint32
}

type ESPTrailer struct {
	PadLen     uint8
	NextHeader uint8
}

type ESPConfig struct {
	SPI     uint32
	Key     []byte
	AuthKey []byte
	UseAES  bool
}

type ESPPacket struct {
	Header     *ESPHeader
	IV         []byte
	Payload    []byte
	Trailer    *ESPTrailer
	ICV        []byte
	NextHeader uint8
}

func NewESPConfig(spi uint32, keyHex string, useAES bool) (*ESPConfig, error) {
	if spi == 0 {
		spi = DefaultSPI
	}

	var key []byte
	var err error
	if keyHex != "" {
		key, err = hex.DecodeString(keyHex)
		if err != nil {
			return nil, fmt.Errorf("invalid key hex: %w", err)
		}
		if useAES && len(key) != 16 && len(key) != 24 && len(key) != 32 {
			return nil, fmt.Errorf("AES key must be 16, 24, or 32 bytes")
		}
	} else {
		key = make([]byte, 16)
		if _, err := rand.Read(key); err != nil {
			return nil, fmt.Errorf("failed to generate key: %w", err)
		}
	}

	return &ESPConfig{
		SPI:    spi,
		Key:    key,
		UseAES: useAES,
	}, nil
}

func (h *ESPHeader) Marshal() []byte {
	buf := make([]byte, ESPHeaderLen)
	binary.BigEndian.PutUint32(buf[0:4], h.SPI)
	binary.BigEndian.PutUint32(buf[4:8], h.SeqNum)
	return buf
}

func ParseESPHeader(data []byte) (*ESPHeader, error) {
	if len(data) < ESPHeaderLen {
		return nil, fmt.Errorf("data too short for ESP header")
	}
	return &ESPHeader{
		SPI:    binary.BigEndian.Uint32(data[0:4]),
		SeqNum: binary.BigEndian.Uint32(data[4:8]),
	}, nil
}

func EncryptESP(plaintext []byte, cfg *ESPConfig, seqNum uint32, nextHeader uint8) ([]byte, error) {
	if cfg == nil {
		return nil, fmt.Errorf("ESP config is nil")
	}

	iv := make([]byte, aes.BlockSize)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return nil, fmt.Errorf("failed to generate IV: %w", err)
	}

	padLen := aes.BlockSize - (len(plaintext)+ESPTrailerLen)%aes.BlockSize
	if padLen == aes.BlockSize {
		padLen = 0
	}

	plaintextWithPad := make([]byte, 0, len(plaintext)+padLen+ESPTrailerLen)
	plaintextWithPad = append(plaintextWithPad, plaintext...)
	for i := 0; i < padLen; i++ {
		plaintextWithPad = append(plaintextWithPad, byte(i+1))
	}
	plaintextWithPad = append(plaintextWithPad, byte(padLen), nextHeader)

	var ciphertext []byte
	if cfg.UseAES && len(cfg.Key) >= 16 {
		block, err := aes.NewCipher(cfg.Key)
		if err != nil {
			return nil, fmt.Errorf("failed to create AES cipher: %w", err)
		}
		mode := cipher.NewCBCEncrypter(block, iv)
		ciphertext = make([]byte, len(plaintextWithPad))
		mode.CryptBlocks(ciphertext, plaintextWithPad)
	} else {
		ciphertext = make([]byte, len(plaintextWithPad))
		for i := range plaintextWithPad {
			ciphertext[i] = plaintextWithPad[i] ^ cfg.Key[i%len(cfg.Key)]
		}
	}

	header := &ESPHeader{
		SPI:    cfg.SPI,
		SeqNum: seqNum,
	}

	icv := make([]byte, ESPICVLen)
	if cfg.AuthKey != nil {
		copy(icv, cfg.AuthKey[:ESPICVLen])
	} else {
		for i := range icv {
			icv[i] = byte((int(cfg.SPI) + i) & 0xFF)
		}
	}

	result := make([]byte, 0, ESPHeaderLen+len(iv)+len(ciphertext)+ESPICVLen)
	result = append(result, header.Marshal()...)
	result = append(result, iv...)
	result = append(result, ciphertext...)
	result = append(result, icv...)

	return result, nil
}

func DecryptESP(ciphertext []byte, cfg *ESPConfig) ([]byte, uint8, *ESPHeader, error) {
	if cfg == nil {
		return nil, 0, nil, fmt.Errorf("ESP config is nil")
	}

	if len(ciphertext) < ESPHeaderLen+aes.BlockSize+ESPTrailerLen+ESPICVLen {
		return nil, 0, nil, fmt.Errorf("ciphertext too short")
	}

	header, err := ParseESPHeader(ciphertext[:ESPHeaderLen])
	if err != nil {
		return nil, 0, nil, err
	}

	offset := ESPHeaderLen
	iv := ciphertext[offset : offset+aes.BlockSize]
	offset += aes.BlockSize

	icv := ciphertext[len(ciphertext)-ESPICVLen:]
	ciphertextBody := ciphertext[offset : len(ciphertext)-ESPICVLen]

	var plaintext []byte
	if cfg.UseAES && len(cfg.Key) >= 16 {
		block, err := aes.NewCipher(cfg.Key)
		if err != nil {
			return nil, 0, nil, fmt.Errorf("failed to create AES cipher: %w", err)
		}
		if len(ciphertextBody)%aes.BlockSize != 0 {
			return nil, 0, nil, fmt.Errorf("ciphertext is not a multiple of AES block size")
		}
		mode := cipher.NewCBCDecrypter(block, iv)
		plaintext = make([]byte, len(ciphertextBody))
		mode.CryptBlocks(plaintext, ciphertextBody)
	} else {
		plaintext = make([]byte, len(ciphertextBody))
		for i := range ciphertextBody {
			plaintext[i] = ciphertextBody[i] ^ cfg.Key[i%len(cfg.Key)]
		}
	}

	padLen := int(plaintext[len(plaintext)-2])
	nextHeader := plaintext[len(plaintext)-1]

	if padLen+ESPTrailerLen > len(plaintext) {
		return nil, 0, nil, fmt.Errorf("invalid padding length")
	}

	payloadLen := len(plaintext) - padLen - ESPTrailerLen
	if payloadLen < 0 {
		return nil, 0, nil, fmt.Errorf("invalid payload length")
	}

	payload := plaintext[:payloadLen]

	_ = icv

	return payload, nextHeader, header, nil
}

func XORCrypt(data []byte, key []byte) []byte {
	result := make([]byte, len(data))
	for i := range data {
		result[i] = data[i] ^ key[i%len(key)]
	}
	return result
}

func GenerateKeyHex(length int) (string, error) {
	if length <= 0 {
		length = 16
	}
	key := make([]byte, length)
	if _, err := rand.Read(key); err != nil {
		return "", err
	}
	return hex.EncodeToString(key), nil
}

func HexKeyToBytes(keyHex string) ([]byte, error) {
	return hex.DecodeString(keyHex)
}

type IPSecPolicy struct {
	SPI      uint32
	SourceIP string
	DestIP   string
	Protocol string
	Key      []byte
	AuthKey  []byte
	Mode     string
	EncAlg   string
	SeqNum   uint32
}

func (p *IPSecPolicy) NextSeqNum() uint32 {
	p.SeqNum++
	return p.SeqNum
}

func NewIPSecPolicy(spi uint32, srcIP, dstIP string, keyHex string) (*IPSecPolicy, error) {
	key, err := hex.DecodeString(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid key hex: %w", err)
	}
	if len(key) != 16 && len(key) != 24 && len(key) != 32 {
		return nil, fmt.Errorf("AES key must be 16, 24, or 32 bytes, got %d", len(key))
	}
	return &IPSecPolicy{
		SPI:      spi,
		SourceIP: srcIP,
		DestIP:   dstIP,
		Protocol: "esp",
		Key:      key,
		Mode:     "tunnel",
		EncAlg:   "aes-cbc",
		SeqNum:   0,
	}, nil
}
