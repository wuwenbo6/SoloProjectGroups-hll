package main

import (
	"crypto/aes"
	"crypto/subtle"
)

const rb128 = 0x87

func cmacGenerateSubkeys(key []byte) (k1, k2 []byte, err error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}

	var l [16]byte
	block.Encrypt(l[:], l[:])

	k1 = make([]byte, 16)
	k2 = make([]byte, 16)

	k1 = shiftLeft(l[:])
	if l[0]&0x80 != 0 {
		k1[15] ^= rb128
	}

	k2 = shiftLeft(k1)
	if k1[0]&0x80 != 0 {
		k2[15] ^= rb128
	}

	return k1, k2, nil
}

func shiftLeft(b []byte) []byte {
	out := make([]byte, len(b))
	carry := byte(0)

	for i := len(b) - 1; i >= 0; i-- {
		out[i] = (b[i] << 1) | carry
		carry = (b[i] >> 7) & 1
	}

	return out
}

func xorBytes(dst, a, b []byte) {
	for i := 0; i < len(a) && i < len(b); i++ {
		dst[i] = a[i] ^ b[i]
	}
}

func CMAC(key, message []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	k1, k2, err := cmacGenerateSubkeys(key)
	if err != nil {
		return nil, err
	}

	msgLen := len(message)

	if msgLen == 0 {
		padded := make([]byte, 16)
		padded[0] = 0x80
		xorBytes(padded, padded, k2)
		var result [16]byte
		block.Encrypt(result[:], padded)
		return result[:], nil
	}

	n := (msgLen + 15) / 16
	complete := msgLen%16 == 0

	var lastBlock [16]byte
	if complete {
		start := (n - 1) * 16
		copy(lastBlock[:], message[start:])
		xorBytes(lastBlock[:], lastBlock[:], k1)
	} else {
		start := (n - 1) * 16
		remaining := msgLen - start
		copy(lastBlock[:], message[start:])
		lastBlock[remaining] = 0x80
		xorBytes(lastBlock[:], lastBlock[:], k2)
	}

	var x [16]byte
	for i := 0; i < n-1; i++ {
		var tmp [16]byte
		copy(tmp[:], message[i*16:(i+1)*16])
		xorBytes(tmp[:], tmp[:], x[:])
		block.Encrypt(x[:], tmp[:])
	}

	xorBytes(lastBlock[:], lastBlock[:], x[:])
	var result [16]byte
	block.Encrypt(result[:], lastBlock[:])

	return result[:], nil
}

func CMACVerify(key, message, expectedMAC []byte) (bool, error) {
	computed, err := CMAC(key, message)
	if err != nil {
		return false, err
	}
	return subtle.ConstantTimeCompare(computed, expectedMAC) == 1, nil
}
