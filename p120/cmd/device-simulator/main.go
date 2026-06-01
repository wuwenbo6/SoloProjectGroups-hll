package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"time"

	"github.com/plgd-dev/go-coap/v3/message"
	"github.com/plgd-dev/go-coap/v3/message/codes"
	"github.com/plgd-dev/go-coap/v3/message/pool"
	"github.com/plgd-dev/go-coap/v3/net/responsewriter"
	"github.com/plgd-dev/go-coap/v3/options"
	coapTCP "github.com/plgd-dev/go-coap/v3/tcp"
	"github.com/plgd-dev/go-coap/v3/tcp/client"
)

func main() {
	deviceID := flag.String("device-id", "dev-001", "Device ID")
	gatewayAddr := flag.String("gateway", "127.0.0.1:5683", "Gateway address")
	flag.Parse()

	handler := func(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message) {
		handleRequest(w, req, *deviceID)
	}

	conn, err := coapTCP.Dial(*gatewayAddr, options.WithHandlerFunc(handler))
	if err != nil {
		fmt.Printf("Failed to connect to gateway: %v\n", err)
		return
	}
	defer conn.Close()

	fmt.Printf("Connected to gateway %s\n", *gatewayAddr)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req := conn.AcquireMessage(ctx)
	defer conn.ReleaseMessage(req)
	req.SetCode(codes.POST)
	req.SetPath("/register")
	req.AddQuery(fmt.Sprintf("id=%s", *deviceID))
	req.SetContentFormat(message.TextPlain)
	req.SetBody(bytes.NewReader([]byte("register")))

	resp, err := conn.Do(req)
	if err != nil {
		fmt.Printf("Register failed: %v\n", err)
		return
	}
	defer conn.ReleaseMessage(resp)
	fmt.Printf("Registered as %s, response code: %s\n", *deviceID, resp.Code())

	go sendPeriodicData(conn, *deviceID)

	conn.AddOnClose(func() {
		fmt.Println("Connection closed")
	})

	fmt.Println("Device running. Press Ctrl+C to exit.")
	select {}
}

func sendPeriodicData(conn *client.Conn, deviceID string) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	counter := 0
	for range ticker.C {
		counter++
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)

		req := conn.AcquireMessage(ctx)
		req.SetCode(codes.PUT)
		req.SetPath("/sensor/temperature")
		req.SetContentFormat(message.AppJSON)
		payload := fmt.Sprintf(`{"device_id":"%s","temperature":%.2f,"timestamp":%d}`,
			deviceID, 20.0+float64(counter%10)/2, time.Now().Unix())
		req.SetBody(bytes.NewReader([]byte(payload)))

		resp, err := conn.Do(req)
		if err != nil {
			fmt.Printf("Send data failed: %v\n", err)
		} else {
			fmt.Printf("Sent: %s\n", payload)
			if resp != nil {
				conn.ReleaseMessage(resp)
			}
		}

		conn.ReleaseMessage(req)
		cancel()
	}
}

func handleRequest(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message, deviceID string) {
	path, _ := req.Path()
	fmt.Printf("Received request: %s %s\n", req.Code(), path)

	switch path {
	case "/sensor/temperature":
		w.SetResponse(codes.Content, message.AppJSON, bytes.NewReader([]byte(`{"temperature":22.5,"unit":"C"}`)))
	case "/device/info":
		payload := fmt.Sprintf(`{"device_id":"%s","status":"online","uptime":%d}`,
			deviceID, int(time.Since(time.Now()).Seconds()))
		w.SetResponse(codes.Content, message.AppJSON, bytes.NewReader([]byte(payload)))
	default:
		w.SetResponse(codes.NotFound, message.TextPlain, bytes.NewReader([]byte("Resource not found")))
	}
}
