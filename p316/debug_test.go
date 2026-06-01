package main

import (
	"crypto/aes"
	"encoding/hex"
	"testing"
)

func TestDebugLValue(t *testing.T) {
	key, _ := hex.DecodeString("2b7e151628aed2a6abf7158809cf4f3c")
	block, _ := aes.NewCipher(key)

	var l [16]byte
	block.Encrypt(l[:], l[:])
	t.Logf("L = %s", hex.EncodeToString(l[:]))

	k1Shifted := shiftLeft(l[:])
	t.Logf("shiftLeft(L) = %s", hex.EncodeToString(k1Shifted))

	if l[0]&0x80 != 0 {
		k1Shifted[15] ^= 0x87
		t.Logf("K1 (with Rb) = %s", hex.EncodeToString(k1Shifted))
	} else {
		t.Logf("K1 (no Rb) = %s", hex.EncodeToString(k1Shifted))
	}
}
