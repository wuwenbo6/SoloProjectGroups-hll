package main

import (
	"encoding/hex"
	"testing"
)

func TestCMAC_RFC4493(t *testing.T) {
	key, _ := hex.DecodeString("2b7e151628aed2a6abf7158809cf4f3c")

	tc1, _ := hex.DecodeString("")
	tc1Expected, _ := hex.DecodeString("bb1d6929e95937287fa37d129b756746")

	mac1, err := CMAC(key, tc1)
	if err != nil {
		t.Fatalf("CMAC tc1: %v", err)
	}
	if hex.EncodeToString(mac1) != hex.EncodeToString(tc1Expected) {
		t.Errorf("CMAC tc1 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(mac1), hex.EncodeToString(tc1Expected))
	} else {
		t.Log("CMAC tc1 PASS")
	}

	tc2, _ := hex.DecodeString("6bc1bee22e409f96e93d7e117393172a")
	tc2Expected, _ := hex.DecodeString("070a16b46b4d4144f79bdd9dd04a287c")

	mac2, err := CMAC(key, tc2)
	if err != nil {
		t.Fatalf("CMAC tc2: %v", err)
	}
	if hex.EncodeToString(mac2) != hex.EncodeToString(tc2Expected) {
		t.Errorf("CMAC tc2 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(mac2), hex.EncodeToString(tc2Expected))
	} else {
		t.Log("CMAC tc2 PASS")
	}

	tc3, _ := hex.DecodeString("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411")
	tc3Expected, _ := hex.DecodeString("dfa66747de9ae63030ca32611497c827")

	mac3, err := CMAC(key, tc3)
	if err != nil {
		t.Fatalf("CMAC tc3: %v", err)
	}
	if hex.EncodeToString(mac3) != hex.EncodeToString(tc3Expected) {
		t.Errorf("CMAC tc3 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(mac3), hex.EncodeToString(tc3Expected))
	} else {
		t.Log("CMAC tc3 PASS")
	}

	tc4, _ := hex.DecodeString("6bc1bee22e409f96e93d7e117393172aae2d8a571e03ac9c9eb76fac45af8e5130c81c46a35ce411e5fbc1191a0a52eff69f2445df4f9b17ad2b417be66c3710")
	tc4Expected, _ := hex.DecodeString("51f0bebf7e3b9d92fc49741779363cfe")

	mac4, err := CMAC(key, tc4)
	if err != nil {
		t.Fatalf("CMAC tc4: %v", err)
	}
	if hex.EncodeToString(mac4) != hex.EncodeToString(tc4Expected) {
		t.Errorf("CMAC tc4 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(mac4), hex.EncodeToString(tc4Expected))
	} else {
		t.Log("CMAC tc4 PASS")
	}
}

func TestSubkeyGeneration(t *testing.T) {
	key, _ := hex.DecodeString("2b7e151628aed2a6abf7158809cf4f3c")

	k1, k2, err := cmacGenerateSubkeys(key)
	if err != nil {
		t.Fatalf("cmacGenerateSubkeys: %v", err)
	}

	expectedK1, _ := hex.DecodeString("fbeed618357133667c85e08f7236a8de")
	expectedK2, _ := hex.DecodeString("f7ddac306ae266ccf90bc11ee46d513b")

	if hex.EncodeToString(k1) != hex.EncodeToString(expectedK1) {
		t.Errorf("K1 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(k1), hex.EncodeToString(expectedK1))
	}
	if hex.EncodeToString(k2) != hex.EncodeToString(expectedK2) {
		t.Errorf("K2 mismatch:\n  got:  %s\n  want: %s", hex.EncodeToString(k2), hex.EncodeToString(expectedK2))
	}
}
