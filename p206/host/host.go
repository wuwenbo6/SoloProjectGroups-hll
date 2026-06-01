package host

import (
	"eftpos-simulator/iso8583"
	"fmt"
	"math/rand"
	"time"
)

type Host struct{}

func NewHost() *Host { return &Host{} }

func (h *Host) ProcessAuth(msg *iso8583.Message) *iso8583.Message {
	resp := iso8583.NewMessage()
	resp.MTI = "0110"
	for _, f := range []int{2, 3, 4, 7, 11, 12, 13, 18, 22, 23, 25, 32, 41, 42, 43, 49} {
		resp.SetField(f, msg.GetField(f))
	}
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	resp.SetField(37, fmt.Sprintf("%012d", r.Int63n(10000000000000)))
	if r.Intn(10) < 8 {
		resp.SetField(38, fmt.Sprintf("%06d", r.Intn(1000000)))
		resp.SetField(39, "00")
	} else {
		resp.SetField(39, "05")
	}
	return resp
}

func (h *Host) ProcessReversal(msg *iso8583.Message) *iso8583.Message {
	resp := iso8583.NewMessage()
	resp.MTI = "0410"
	for _, f := range []int{2, 3, 4, 7, 11, 12, 13, 18, 22, 23, 25, 32, 37, 41, 42, 43, 49} {
		resp.SetField(f, msg.GetField(f))
	}
	resp.SetField(39, "00")
	resp.SetField(38, "REVRSD")
	return resp
}
