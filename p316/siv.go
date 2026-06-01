package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/subtle"
	"errors"
)

var (
	ErrInvalidKeyLength   = errors.New("aes-siv: key must be 32 or 64 bytes (AES-128-SIV or AES-256-SIV)")
	ErrInvalidTagLength   = errors.New("aes-siv: ciphertext must contain at least 16 bytes for the SIV tag")
	ErrAuthenticationFail = errors.New("aes-siv: authentication failed - tag mismatch")
)

type AESSIV struct {
	k1 []byte
	k2 []byte
}

func NewAESSIV(key []byte) (*AESSIV, error) {
	keyLen := len(key)
	if keyLen != 32 && keyLen != 64 {
		return nil, ErrInvalidKeyLength
	}

	half := keyLen / 2
	k1 := make([]byte, half)
	k2 := make([]byte, half)
	copy(k1, key[:half])
	copy(k2, key[half:])

	return &AESSIV{k1: k1, k2: k2}, nil
}

func (s *AESSIV) s2v(inputs ...[]byte) ([]byte, error) {
	if len(inputs) == 0 {
		zeroBlock := make([]byte, 16)
		return CMAC(s.k1, zeroBlock)
	}

	oneBlock := make([]byte, 16)
	for i := range oneBlock {
		oneBlock[i] = 0x01
	}

	d, err := CMAC(s.k1, oneBlock)
	if err != nil {
		return nil, err
	}

	for i := 0; i < len(inputs)-1; i++ {
		d = shiftLeft(d)
		cmacVal, err := CMAC(s.k1, inputs[i])
		if err != nil {
			return nil, err
		}
		xorBytes(d, d, cmacVal)
	}

	lastInput := inputs[len(inputs)-1]
	if len(lastInput) >= 16 {
		xorVal := make([]byte, len(lastInput))
		copy(xorVal, lastInput)
		xorBytes(xorVal[:16], xorVal[:16], d)
		return CMAC(s.k1, xorVal)
	}

	d = shiftLeft(d)
	padded := make([]byte, 16)
	copy(padded, lastInput)
	padded[len(lastInput)] = 0x80
	xorBytes(padded, padded, d)
	return CMAC(s.k1, padded)
}

func (s *AESSIV) ctrDecrypt(iv, ciphertext []byte) ([]byte, error) {
	block, err := aes.NewCipher(s.k2)
	if err != nil {
		return nil, err
	}

	ctrIV := make([]byte, 16)
	copy(ctrIV, iv)
	ctrIV[8] &= 0x7F

	stream := cipher.NewCTR(block, ctrIV)
	plaintext := make([]byte, len(ciphertext))
	stream.XORKeyStream(plaintext, ciphertext)

	return plaintext, nil
}

func (s *AESSIV) Encrypt(associatedData [][]byte, nonce, plaintext []byte) ([]byte, error) {
	inputs := make([][]byte, 0, len(associatedData)+2)
	inputs = append(inputs, associatedData...)
	inputs = append(inputs, nonce)
	inputs = append(inputs, plaintext)

	siv, err := s.s2v(inputs...)
	if err != nil {
		return nil, err
	}

	ciphertext, err := s.ctrEncrypt(siv, plaintext)
	if err != nil {
		return nil, err
	}

	result := make([]byte, 16+len(ciphertext))
	copy(result[:16], siv)
	copy(result[16:], ciphertext)

	return result, nil
}

func (s *AESSIV) ctrEncrypt(iv, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(s.k2)
	if err != nil {
		return nil, err
	}

	ctrIV := make([]byte, 16)
	copy(ctrIV, iv)
	ctrIV[8] &= 0x7F

	stream := cipher.NewCTR(block, ctrIV)
	ciphertext := make([]byte, len(plaintext))
	stream.XORKeyStream(ciphertext, plaintext)

	return ciphertext, nil
}

func (s *AESSIV) Decrypt(associatedData [][]byte, nonce, ciphertext []byte) ([]byte, error) {
	if len(ciphertext) < 16 {
		return nil, ErrInvalidTagLength
	}

	siv := ciphertext[:16]
	encryptedPayload := ciphertext[16:]

	plaintext, err := s.ctrDecrypt(siv, encryptedPayload)
	if err != nil {
		return nil, err
	}

	inputs := make([][]byte, 0, len(associatedData)+2)
	inputs = append(inputs, associatedData...)
	inputs = append(inputs, nonce)
	inputs = append(inputs, plaintext)

	computedSIV, err := s.s2v(inputs...)
	if err != nil {
		return nil, err
	}

	if subtle.ConstantTimeCompare(siv, computedSIV) != 1 {
		return nil, ErrAuthenticationFail
	}

	return plaintext, nil
}
