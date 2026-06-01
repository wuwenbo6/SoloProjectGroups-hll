package terminal

import (
	"eftpos-simulator/iso8583"
	"fmt"
	"math/rand"
	"time"
)

type Terminal struct {
	TerminalID   string
	MerchantID   string
	MerchantName string
	STAN         int
	InstID       string
}

func NewTerminal() *Terminal {
	return &Terminal{
		TerminalID:   "TERM0010",
		MerchantID:   "123456789012345",
		MerchantName: "ACM STORE      SYDNEY    AU",
		STAN:         1,
		InstID:       "123456",
	}
}

func (t *Terminal) NextSTAN() int {
	t.STAN++
	if t.STAN > 999999 {
		t.STAN = 1
	}
	return t.STAN
}

func RandomPAN() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("4567%d12", r.Int63n(100000000))
}

func RandomAmount() string {
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	return fmt.Sprintf("%012d", r.Int63n(100000000))
}

func (t *Terminal) BuildAuth(pan, amount, expiry string) *iso8583.Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := iso8583.NewMessage()
	msg.MTI = "0100"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("060102")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	return msg
}

func (t *Terminal) BuildReversal(pan, amount, expiry, rrn string) *iso8583.Message {
	now := time.Now()
	stan := t.NextSTAN()
	msg := iso8583.NewMessage()
	msg.MTI = "0400"
	msg.SetField(2, pan)
	msg.SetField(3, "000000")
	msg.SetField(4, amount)
	msg.SetField(7, now.Format("060102")+"1200")
	msg.SetField(11, fmt.Sprintf("%06d", stan))
	msg.SetField(12, now.Format("150405"))
	msg.SetField(13, now.Format("0102"))
	msg.SetField(14, expiry)
	msg.SetField(18, "5411")
	msg.SetField(22, "011")
	msg.SetField(23, "001")
	msg.SetField(25, "00")
	msg.SetField(32, t.InstID)
	msg.SetField(37, rrn)
	msg.SetField(41, t.TerminalID)
	msg.SetField(42, t.MerchantID)
	msg.SetField(43, t.MerchantName)
	msg.SetField(49, "840")
	return msg
}
