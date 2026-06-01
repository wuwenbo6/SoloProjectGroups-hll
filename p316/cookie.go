package main

import (
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	CookieVersion1     = 0x01
	minCookieBinaryLen = 1 + 2 + 16
	versionFieldLen    = 1
	aadLenFieldLen     = 2
	sivFieldLen        = 16
	maxAADLen          = 4096
	maxCiphertextLen   = 65536
)

var (
	ErrCookieTooShort     = errors.New("cookie: binary data too short")
	ErrUnsupportedVersion = errors.New("cookie: unsupported version")
	ErrAADLengthOverflow  = errors.New("cookie: AAD length exceeds remaining data")
	ErrAADLengthTooLarge  = errors.New("cookie: AAD length exceeds maximum allowed")
	ErrSIVFieldMissing    = errors.New("cookie: not enough data for SIV field")
	ErrCiphertextTooLarge = errors.New("cookie: ciphertext exceeds maximum allowed length")
	ErrBase64DecodeFailed = errors.New("cookie: base64 decode failed")
	ErrNoNonceInAAD       = errors.New("cookie: AAD too short to contain nonce")
)

type CookieData struct {
	Version    byte
	AAD        []byte
	Nonce      []byte
	SIV        []byte
	Ciphertext []byte
}

func ParseCookie(encoded string) (*CookieData, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(encoded)
		if err != nil {
			return nil, fmt.Errorf("%w: %v", ErrBase64DecodeFailed, err)
		}
	}

	return ParseCookieBinary(raw)
}

func ParseCookieBinary(raw []byte) (*CookieData, error) {
	if len(raw) < minCookieBinaryLen {
		return nil, fmt.Errorf("%w: got %d bytes, need at least %d", ErrCookieTooShort, len(raw), minCookieBinaryLen)
	}

	offset := 0

	version := raw[offset]
	offset += versionFieldLen

	if version != CookieVersion1 {
		return nil, fmt.Errorf("%w: got 0x%02x", ErrUnsupportedVersion, version)
	}

	if len(raw)-offset < aadLenFieldLen {
		return nil, fmt.Errorf("%w: need %d bytes for AAD length, have %d", ErrCookieTooShort, aadLenFieldLen, len(raw)-offset)
	}
	aadLen := int(binary.BigEndian.Uint16(raw[offset : offset+aadLenFieldLen]))
	offset += aadLenFieldLen

	if aadLen > maxAADLen {
		return nil, fmt.Errorf("%w: %d bytes (max %d)", ErrAADLengthTooLarge, aadLen, maxAADLen)
	}

	if len(raw)-offset < aadLen {
		return nil, fmt.Errorf("%w: AAD length %d but only %d bytes remain", ErrAADLengthOverflow, aadLen, len(raw)-offset)
	}

	aad := make([]byte, aadLen)
	copy(aad, raw[offset:offset+aadLen])
	offset += aadLen

	if len(raw)-offset < sivFieldLen {
		return nil, fmt.Errorf("%w: need %d bytes for SIV, have %d", ErrSIVFieldMissing, sivFieldLen, len(raw)-offset)
	}

	siv := make([]byte, sivFieldLen)
	copy(siv, raw[offset:offset+sivFieldLen])
	offset += sivFieldLen

	ciphertextLen := len(raw) - offset
	if ciphertextLen > maxCiphertextLen {
		return nil, fmt.Errorf("%w: %d bytes (max %d)", ErrCiphertextTooLarge, ciphertextLen, maxCiphertextLen)
	}

	ciphertext := make([]byte, ciphertextLen)
	if ciphertextLen > 0 {
		copy(ciphertext, raw[offset:])
	}

	var nonce []byte
	if aadLen >= 12 {
		nonce = aad[:12]
	} else if aadLen > 0 {
		nonce = aad
	} else {
		return nil, ErrNoNonceInAAD
	}

	return &CookieData{
		Version:    version,
		AAD:        aad,
		Nonce:      nonce,
		SIV:        siv,
		Ciphertext: ciphertext,
	}, nil
}

func DecryptCookie(siv *AESSIV, encoded string) ([]byte, error) {
	cookie, err := ParseCookie(encoded)
	if err != nil {
		return nil, fmt.Errorf("cookie parse error: %w", err)
	}

	combined := make([]byte, 0, len(cookie.SIV)+len(cookie.Ciphertext))
	combined = append(combined, cookie.SIV...)
	combined = append(combined, cookie.Ciphertext...)

	var aad [][]byte
	if len(cookie.AAD) > len(cookie.Nonce) {
		extraAAD := cookie.AAD[len(cookie.Nonce):]
		if len(extraAAD) > 0 {
			aad = [][]byte{extraAAD}
		}
	}

	plaintext, err := siv.Decrypt(aad, cookie.Nonce, combined)
	if err != nil {
		return nil, fmt.Errorf("cookie decrypt error: %w", err)
	}

	return plaintext, nil
}
