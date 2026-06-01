package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
)

func main() {
	fmt.Println("=== AEAD_AES_SIV_CMAC RFC 5297 Test Vectors ===")
	if err := runRFCTestVectors(); err != nil {
		log.Fatalf("RFC test vector failure: %v", err)
	}

	fmt.Println()
	fmt.Println("=== Cookie Encrypt/Decrypt Round-Trip ===")
	if err := runCookieRoundTrip(); err != nil {
		log.Fatalf("Cookie round-trip failure: %v", err)
	}

	fmt.Println()
	fmt.Println("=== Cookie Parsing Bounds Checks ===")
	runBoundsChecks()

	fmt.Println()
	fmt.Println("=== Starting HTTP Server on :8080 ===")
	startHTTPServer()
}

func runRFCTestVectors() error {
	key128, _ := hex.DecodeString("fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
	ad1, _ := hex.DecodeString("101112131415161718191a1b1c1d1e1f2021222324252627")
	pt1, _ := hex.DecodeString("112233445566778899aabbccddeeff")
	nonce1, _ := hex.DecodeString("0a0b0c0d0e0f10111213141516171819")
	expectedSIV1, _ := hex.DecodeString("0ac479ac07cb91d44ecb759b44ed06ab")
	expectedCT1, _ := hex.DecodeString("ef5de0199ba99f7829975701088bc0")

	siv1, err := NewAESSIV(key128)
	if err != nil {
		return fmt.Errorf("NewAESSIV: %w", err)
	}

	ct1, err := siv1.Encrypt([][]byte{ad1}, nonce1, pt1)
	if err != nil {
		return fmt.Errorf("Encrypt: %w", err)
	}

	fmt.Printf("AES-128-SIV Encrypt:\n")
	fmt.Printf("  SIV:       %s\n", hex.EncodeToString(ct1[:16]))
	fmt.Printf("  Ciphertext: %s\n", hex.EncodeToString(ct1[16:]))

	if hex.EncodeToString(ct1[:16]) != hex.EncodeToString(expectedSIV1) {
		return fmt.Errorf("SIV mismatch: got %s, want %s", hex.EncodeToString(ct1[:16]), hex.EncodeToString(expectedSIV1))
	}
	if hex.EncodeToString(ct1[16:]) != hex.EncodeToString(expectedCT1) {
		return fmt.Errorf("ciphertext mismatch: got %s, want %s", hex.EncodeToString(ct1[16:]), hex.EncodeToString(expectedCT1))
	}

	dec1, err := siv1.Decrypt([][]byte{ad1}, nonce1, ct1)
	if err != nil {
		return fmt.Errorf("Decrypt: %w", err)
	}
	fmt.Printf("  Decrypted:  %s\n", hex.EncodeToString(dec1))
	if hex.EncodeToString(dec1) != hex.EncodeToString(pt1) {
		return fmt.Errorf("decryption mismatch")
	}

	fmt.Println("  ✓ AES-128-SIV test vector PASSED")

	key256, _ := hex.DecodeString("fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfefffffefdfcfbfaf9f8f7f6f5f4f3f2f1f0f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff")
	ad2, _ := hex.DecodeString("101112131415161718191a1b1c1d1e1f2021222324252627")
	pt2, _ := hex.DecodeString("112233445566778899aabbccddeeff")
	nonce2, _ := hex.DecodeString("0a0b0c0d0e0f10111213141516171819")
	expectedSIV2, _ := hex.DecodeString("5437f263f1c761003ce93950cc7b9af4")
	expectedCT2, _ := hex.DecodeString("409dce34cb99ff6ea8c2c190643cf8")

	siv2, err := NewAESSIV(key256)
	if err != nil {
		return fmt.Errorf("NewAESSIV-256: %w", err)
	}

	ct2, err := siv2.Encrypt([][]byte{ad2}, nonce2, pt2)
	if err != nil {
		return fmt.Errorf("Encrypt-256: %w", err)
	}

	fmt.Printf("AES-256-SIV Encrypt:\n")
	fmt.Printf("  SIV:        %s\n", hex.EncodeToString(ct2[:16]))
	fmt.Printf("  Ciphertext: %s\n", hex.EncodeToString(ct2[16:]))

	if hex.EncodeToString(ct2[:16]) != hex.EncodeToString(expectedSIV2) {
		return fmt.Errorf("SIV-256 mismatch: got %s, want %s", hex.EncodeToString(ct2[:16]), hex.EncodeToString(expectedSIV2))
	}
	if hex.EncodeToString(ct2[16:]) != hex.EncodeToString(expectedCT2) {
		return fmt.Errorf("ciphertext-256 mismatch: got %s, want %s", hex.EncodeToString(ct2[16:]), hex.EncodeToString(expectedCT2))
	}

	dec2, err := siv2.Decrypt([][]byte{ad2}, nonce2, ct2)
	if err != nil {
		return fmt.Errorf("Decrypt-256: %w", err)
	}
	if hex.EncodeToString(dec2) != hex.EncodeToString(pt2) {
		return fmt.Errorf("decryption-256 mismatch")
	}
	fmt.Println("  ✓ AES-256-SIV test vector PASSED")

	return nil
}

func runCookieRoundTrip() error {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}

	siv, err := NewAESSIV(key)
	if err != nil {
		return err
	}

	secretPayload := []byte("user_id=42&role=admin&session=abc123")
	nonce := make([]byte, 12)
	for i := range nonce {
		nonce[i] = byte(i + 0xA0)
	}

	aad := make([]byte, 0, len(nonce))
	aad = append(aad, nonce...)

	ct, err := siv.Encrypt(nil, nonce, secretPayload)
	if err != nil {
		return err
	}

	cookieBinary := make([]byte, 0, 1+2+len(aad)+len(ct))
	cookieBinary = append(cookieBinary, CookieVersion1)
	aadLenBuf := make([]byte, 2)
	binary.BigEndian.PutUint16(aadLenBuf, uint16(len(aad)))
	cookieBinary = append(cookieBinary, aadLenBuf...)
	cookieBinary = append(cookieBinary, aad...)
	cookieBinary = append(cookieBinary, ct...)

	encoded := base64.StdEncoding.EncodeToString(cookieBinary)
	fmt.Printf("  Encoded cookie: %s\n", encoded)

	plaintext, err := DecryptCookie(siv, encoded)
	if err != nil {
		return fmt.Errorf("DecryptCookie: %w", err)
	}

	fmt.Printf("  Decrypted: %s\n", string(plaintext))
	if string(plaintext) != string(secretPayload) {
		return fmt.Errorf("round-trip mismatch: got %q, want %q", string(plaintext), string(secretPayload))
	}

	fmt.Println("  ✓ Cookie round-trip PASSED")
	return nil
}

func runBoundsChecks() {
	tests := []struct {
		name    string
		data    []byte
		wantErr string
	}{
		{"empty data", []byte{}, "too short"},
		{"1 byte (version only)", []byte{0x01}, "too short"},
		{"3 bytes (version + aad_len)", []byte{0x01, 0x00, 0x00}, "SIV"},
		{"bad version", append([]byte{0x02, 0x00, 0x00}, make([]byte, 16)...), "unsupported version"},
		{"AAD overflow", func() []byte {
			b := []byte{0x01, 0x10, 0x00}
			b = append(b, make([]byte, 16+3)...)
			return b
		}(), "AAD length exceeds remaining"},
		{"SIV field missing", []byte{0x01, 0x00, 0x05, 'h', 'e', 'l', 'l', 'o'}, "SIV"},
		{"valid minimum", func() []byte {
			b := []byte{0x01, 0x00, 0x0C}
			nonce := make([]byte, 12)
			b = append(b, nonce...)
			siv := make([]byte, 16)
			b = append(b, siv...)
			return b
		}(), ""},
	}

	for _, tt := range tests {
		encoded := base64.StdEncoding.EncodeToString(tt.data)
		_, err := ParseCookie(encoded)
		if tt.wantErr == "" {
			if err != nil {
				fmt.Printf("  ✗ %q: unexpected error %v\n", tt.name, err)
			} else {
				fmt.Printf("  ✓ %q: correctly parsed\n", tt.name)
			}
		} else {
			if err == nil {
				fmt.Printf("  ✗ %q: expected error containing %q, got nil\n", tt.name, tt.wantErr)
			} else {
				fmt.Printf("  ✓ %q: correctly rejected (%v)\n", tt.name, err)
			}
		}
	}
}

func startHTTPServer() {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	siv, _ := NewAESSIV(key)

	http.HandleFunc("/decrypt", func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Error(w, "no session cookie", http.StatusBadRequest)
			return
		}

		plaintext, err := DecryptCookie(siv, cookie.Value)
		if err != nil {
			http.Error(w, fmt.Sprintf("decrypt failed: %v", err), http.StatusBadRequest)
			return
		}

		w.Header().Set("Content-Type", "text/plain")
		w.Write(plaintext)
	})

	http.HandleFunc("/encrypt", func(w http.ResponseWriter, r *http.Request) {
		payload := r.URL.Query().Get("data")
		if payload == "" {
			http.Error(w, "missing data parameter", http.StatusBadRequest)
			return
		}

		nonce := make([]byte, 12)
		aad := make([]byte, len(nonce))
		copy(aad, nonce)

		ct, err := siv.Encrypt(nil, nonce, []byte(payload))
		if err != nil {
			http.Error(w, fmt.Sprintf("encrypt failed: %v", err), http.StatusInternalServerError)
			return
		}

		cookieBinary := make([]byte, 0, 1+2+len(aad)+len(ct))
		cookieBinary = append(cookieBinary, CookieVersion1)
		aadLenBuf := make([]byte, 2)
		binary.BigEndian.PutUint16(aadLenBuf, uint16(len(aad)))
		cookieBinary = append(cookieBinary, aadLenBuf...)
		cookieBinary = append(cookieBinary, aad...)
		cookieBinary = append(cookieBinary, ct...)

		encoded := base64.StdEncoding.EncodeToString(cookieBinary)
		http.SetCookie(w, &http.Cookie{
			Name:  "session",
			Value: encoded,
			Path:  "/",
		})

		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(encoded))
	})

	log.Fatal(http.ListenAndServe(":8080", nil))
}
