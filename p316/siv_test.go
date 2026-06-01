package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"testing"
)

func TestRFC5297_AES128_SIV(t *testing.T) {
	key, _ := hex.DecodeString("fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
	ad, _ := hex.DecodeString("101112131415161718191a1b1c1d1e1f2021222324252627")
	pt, _ := hex.DecodeString("112233445566778899aabbccddeeff")
	nonce, _ := hex.DecodeString("0a0b0c0d0e0f10111213141516171819")
	expectedSIV, _ := hex.DecodeString("0ac479ac07cb91d44ecb759b44ed06ab")
	expectedCT, _ := hex.DecodeString("ef5de0199ba99f7829975701088bc0")

	siv, err := NewAESSIV(key)
	if err != nil {
		t.Fatalf("NewAESSIV: %v", err)
	}

	ct, err := siv.Encrypt([][]byte{ad}, nonce, pt)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	if hex.EncodeToString(ct[:16]) != hex.EncodeToString(expectedSIV) {
		t.Errorf("SIV mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(ct[:16]), hex.EncodeToString(expectedSIV))
	}
	if hex.EncodeToString(ct[16:]) != hex.EncodeToString(expectedCT) {
		t.Errorf("Ciphertext mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(ct[16:]), hex.EncodeToString(expectedCT))
	}

	dec, err := siv.Decrypt([][]byte{ad}, nonce, ct)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if hex.EncodeToString(dec) != hex.EncodeToString(pt) {
		t.Errorf("Decryption mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(dec), hex.EncodeToString(pt))
	}
}

func TestRFC5297_AES256_SIV(t *testing.T) {
	key, _ := hex.DecodeString("fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfefffffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
	ad, _ := hex.DecodeString("101112131415161718191a1b1c1d1e1f2021222324252627")
	pt, _ := hex.DecodeString("112233445566778899aabbccddeeff")
	nonce, _ := hex.DecodeString("0a0b0c0d0e0f10111213141516171819")
	expectedSIV, _ := hex.DecodeString("5437f263f1c761003ce93950cc7b9af4")
	expectedCT, _ := hex.DecodeString("409dce34cb99ff6ea8c2c190643cf8")

	siv, err := NewAESSIV(key)
	if err != nil {
		t.Fatalf("NewAESSIV: %v", err)
	}

	ct, err := siv.Encrypt([][]byte{ad}, nonce, pt)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	if hex.EncodeToString(ct[:16]) != hex.EncodeToString(expectedSIV) {
		t.Errorf("SIV mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(ct[:16]), hex.EncodeToString(expectedSIV))
	}
	if hex.EncodeToString(ct[16:]) != hex.EncodeToString(expectedCT) {
		t.Errorf("Ciphertext mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(ct[16:]), hex.EncodeToString(expectedCT))
	}

	dec, err := siv.Decrypt([][]byte{ad}, nonce, ct)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}
	if hex.EncodeToString(dec) != hex.EncodeToString(pt) {
		t.Errorf("Decryption mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(dec), hex.EncodeToString(pt))
	}
}

func TestDecryptRejectsTamperedCiphertext(t *testing.T) {
	key := make([]byte, 32)
	siv, _ := NewAESSIV(key)
	nonce := make([]byte, 12)

	ct, err := siv.Encrypt(nil, nonce, []byte("hello world"))
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	ct[16] ^= 0xFF
	_, err = siv.Decrypt(nil, nonce, ct)
	if err == nil {
		t.Error("expected authentication failure for tampered ciphertext")
	}
}

func TestCookieRoundTrip(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	siv, _ := NewAESSIV(key)

	payload := []byte("user_id=42&role=admin&session=abc123")
	nonce := make([]byte, 12)
	for i := range nonce {
		nonce[i] = byte(i + 0xA0)
	}

	aad := append([]byte{}, nonce...)

	ct, _ := siv.Encrypt(nil, nonce, payload)

	cookieBinary := make([]byte, 0, 1+2+len(aad)+len(ct))
	cookieBinary = append(cookieBinary, CookieVersion1)
	aadLenBuf := make([]byte, 2)
	binary.BigEndian.PutUint16(aadLenBuf, uint16(len(aad)))
	cookieBinary = append(cookieBinary, aadLenBuf...)
	cookieBinary = append(cookieBinary, aad...)
	cookieBinary = append(cookieBinary, ct...)

	encoded := base64.StdEncoding.EncodeToString(cookieBinary)

	plaintext, err := DecryptCookie(siv, encoded)
	if err != nil {
		t.Fatalf("DecryptCookie: %v", err)
	}
	if string(plaintext) != string(payload) {
		t.Errorf("round-trip mismatch:\n  got:  %q\n  want: %q", string(plaintext), string(payload))
	}
}

func TestCookieParseBoundsChecks(t *testing.T) {
	tests := []struct {
		name    string
		data    []byte
		wantErr bool
	}{
		{"empty", []byte{}, true},
		{"1 byte", []byte{0x01}, true},
		{"3 bytes no SIV", []byte{0x01, 0x00, 0x00}, true},
		{"bad version", append([]byte{0x02, 0x00, 0x00}, make([]byte, 16)...), true},
		{"AAD overflow", func() []byte {
			b := []byte{0x01, 0x10, 0x00}
			b = append(b, make([]byte, 16+3)...)
			return b
		}(), true},
		{"SIV field missing", []byte{0x01, 0x00, 0x05, 'h', 'e', 'l', 'l', 'o'}, true},
		{"valid minimum", func() []byte {
			b := []byte{0x01, 0x00, 0x0C}
			b = append(b, make([]byte, 12)...)
			b = append(b, make([]byte, 16)...)
			return b
		}(), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoded := base64.StdEncoding.EncodeToString(tt.data)
			_, err := ParseCookie(encoded)
			if tt.wantErr && err == nil {
				t.Errorf("expected error for %q, got nil", tt.name)
			}
			if !tt.wantErr && err != nil {
				t.Errorf("unexpected error for %q: %v", tt.name, err)
			}
		})
	}
}

func TestCookieRejectsTruncatedSIV(t *testing.T) {
	data := []byte{0x01, 0x00, 0x0C}
	nonce := make([]byte, 12)
	data = append(data, nonce...)
	data = append(data, make([]byte, 8)...)

	encoded := base64.StdEncoding.EncodeToString(data)
	_, err := ParseCookie(encoded)
	if err == nil {
		t.Error("expected error for truncated SIV field")
	}
}

func TestCookieRejectsHugeAAD(t *testing.T) {
	data := []byte{0x01, 0x10, 0x01}
	data = append(data, make([]byte, 4097+16)...)

	encoded := base64.StdEncoding.EncodeToString(data)
	_, err := ParseCookie(encoded)
	if err == nil {
		t.Error("expected error for AAD exceeding max")
	}
}

func TestInvalidKeyLength(t *testing.T) {
	_, err := NewAESSIV(make([]byte, 16))
	if err == nil {
		t.Error("expected error for 16-byte key")
	}
	_, err = NewAESSIV(make([]byte, 48))
	if err == nil {
		t.Error("expected error for 48-byte key")
	}
}

func TestDecryptTooShort(t *testing.T) {
	siv, _ := NewAESSIV(make([]byte, 32))
	_, err := siv.Decrypt(nil, make([]byte, 12), []byte{0x01, 0x02, 0x03})
	if err == nil {
		t.Error("expected error for ciphertext shorter than SIV tag")
	}
}
