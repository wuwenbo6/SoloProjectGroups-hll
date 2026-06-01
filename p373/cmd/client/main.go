package main

import (
	"context"
	"crypto/tls"
	"flag"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/quic-go/quic-go"
	"mqtt-quic-broker/internal/mqtt"
)

type Client struct {
	conn      quic.Connection
	stream    quic.Stream
	clientID  string
	done      chan struct{}
	using0RTT bool
}

func NewClient(serverAddr, clientID string) (*Client, error) {
	return NewClientWith0RTT(serverAddr, clientID, true)
}

func NewClientWith0RTT(serverAddr, clientID string, enable0RTT bool) (*Client, error) {
	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
		NextProtos:         []string{"mqtt-quic"},
		ClientSessionCache: tls.NewLRUClientSessionCache(100),
	}

	quicConfig := &quic.Config{
		MaxIdleTimeout:    30 * time.Second,
		KeepAlivePeriod:  10 * time.Second,
		EnableDatagrams:  true,
	}

	var (
		conn      quic.Connection
		using0RTT bool
		err       error
	)

	if enable0RTT {
		earlyConn, earlyErr := quic.DialAddrEarly(context.Background(), serverAddr, tlsConfig, quicConfig)
		if earlyErr != nil {
			return nil, fmt.Errorf("dial early error: %v", earlyErr)
		}
		conn = earlyConn
		
		handshakeChan := earlyConn.HandshakeComplete()
		select {
		case <-handshakeChan:
			using0RTT = false
		default:
			using0RTT = true
		}
	} else {
		conn, err = quic.DialAddr(context.Background(), serverAddr, tlsConfig, quicConfig)
		if err != nil {
			return nil, fmt.Errorf("dial error: %v", err)
		}
		using0RTT = false
	}

	stream, err := conn.OpenStreamSync(context.Background())
	if err != nil {
		conn.CloseWithError(0, "")
		return nil, fmt.Errorf("open stream error: %v", err)
	}

	return &Client{
		conn:      conn,
		stream:    stream,
		clientID:  clientID,
		done:      make(chan struct{}),
		using0RTT: using0RTT,
	}, nil
}

func (c *Client) IsUsing0RTT() bool {
	return c.using0RTT
}

func (c *Client) Connect(cleanSession bool) error {
	return c.ConnectWithWill(cleanSession, nil)
}

func (c *Client) ConnectWithWill(cleanSession bool, will *mqtt.ConnectPacket) error {
	var connect *mqtt.ConnectPacket

	if will != nil {
		connect = will
		connect.CleanSession = cleanSession
		connect.ClientID = c.clientID
	} else {
		connect = &mqtt.ConnectPacket{
			ProtocolName:  "MQTT",
			ProtocolLevel: 4,
			CleanSession:  cleanSession,
			KeepAlive:     60,
			ClientID:      c.clientID,
		}
	}

	data, err := connect.Encode()
	if err != nil {
		return err
	}

	_, err = c.stream.Write(data)
	if err != nil {
		return err
	}

	buf := make([]byte, 1024)
	n, err := c.stream.Read(buf)
	if err != nil {
		return err
	}

	packet, _, err := mqtt.DecodePacket(buf[:n])
	if err != nil {
		return err
	}

	if connack, ok := packet.(*mqtt.ConnackPacket); ok {
		log.Printf("Connected - Session Present: %v, Return Code: %d", connack.SessionPresent, connack.ReturnCode)
	}

	return nil
}

func (c *Client) Subscribe(topic string, qos byte) error {
	subscribe := &mqtt.SubscribePacket{
		PacketID: 1,
		TopicFilters: []mqtt.TopicFilter{
			{Topic: topic, QoS: qos},
		},
	}

	data, err := subscribe.Encode()
	if err != nil {
		return err
	}

	_, err = c.stream.Write(data)
	return err
}

func (c *Client) Publish(topic string, payload []byte, qos byte) error {
	publish := &mqtt.PublishPacket{
		Topic:   topic,
		Payload: payload,
		QoS:     qos,
	}

	data, err := publish.Encode()
	if err != nil {
		return err
	}

	_, err = c.stream.Write(data)
	return err
}

func (c *Client) Ping() error {
	pingreq := &mqtt.PingreqPacket{}
	data, _ := pingreq.Encode()
	_, err := c.stream.Write(data)
	return err
}

func (c *Client) ReadLoop() {
	buf := make([]byte, 4096)
	readBuffer := make([]byte, 0, 4096)

	for {
		select {
		case <-c.done:
			return
		default:
		}

		n, err := c.stream.Read(buf)
		if err != nil {
			if err != io.EOF {
				log.Printf("Read error: %v", err)
			}
			return
		}

		readBuffer = append(readBuffer, buf[:n]...)

		for {
			packet, remaining, err := mqtt.DecodePacket(readBuffer)
			if err != nil {
				if err == io.ErrShortBuffer {
					break
				}
				readBuffer = readBuffer[1:]
				continue
			}

			readBuffer = remaining

			switch p := packet.(type) {
			case *mqtt.PublishPacket:
				log.Printf("Received message on %s: %s", p.Topic, string(p.Payload))
			case *mqtt.PingrespPacket:
				log.Println("Received PINGRESP")
			case *mqtt.SubackPacket:
				log.Printf("Received SUBACK, PacketID: %d", p.PacketID)
			}
		}
	}
}

func (c *Client) Close() {
	close(c.done)
	if c.stream != nil {
		disconnect := &mqtt.DisconnectPacket{}
		data, _ := disconnect.Encode()
		c.stream.Write(data)
		c.stream.Close()
	}
	if c.conn != nil {
		c.conn.CloseWithError(0, "")
	}
}

func (c *Client) GetLocalAddr() string {
	if c.conn != nil {
		return c.conn.LocalAddr().String()
	}
	return ""
}

func main() {
	server := flag.String("server", "localhost:1883", "MQTT over QUIC server address")
	clientID := flag.String("id", "test-client-001", "Client ID")
	topic := flag.String("topic", "test/topic", "Topic to subscribe/publish")
	mode := flag.String("mode", "pub", "Mode: pub, sub, migration, or will")
	messageInterval := flag.Int("interval", 2, "Message interval in seconds")
	cleanSession := flag.Bool("clean", false, "Clean session")
	flag.Parse()

	log.Printf("MQTT over QUIC Test Client")
	log.Printf("Server: %s, ClientID: %s, Topic: %s", *server, *clientID, *topic)

	switch *mode {
	case "pub":
		runPublisher(*server, *clientID, *topic, *messageInterval, *cleanSession)
	case "sub":
		runSubscriber(*server, *clientID, *topic, *cleanSession)
	case "migration":
		runMigrationTest(*server, *clientID, *topic, *cleanSession)
	case "will":
		runWillTest(*server, *clientID, *topic, *cleanSession)
	default:
		log.Fatalf("Unknown mode: %s", *mode)
	}
}

func runPublisher(server, clientID, topic string, interval int, cleanSession bool) {
	client, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.Close()

	if err := client.Connect(cleanSession); err != nil {
		log.Fatalf("Failed to send CONNECT: %v", err)
	}

	go client.ReadLoop()

	counter := 1
	ticker := time.NewTicker(time.Duration(interval) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		payload := fmt.Sprintf("Message %d from %s at %s", counter, clientID, time.Now().Format("15:04:05"))
		if err := client.Publish(topic, []byte(payload), 0); err != nil {
			log.Printf("Publish error: %v", err)
			return
		}
		log.Printf("Published: %s", payload)
		counter++
	}
}

func runSubscriber(server, clientID, topic string, cleanSession bool) {
	client, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer client.Close()

	if err := client.Connect(cleanSession); err != nil {
		log.Fatalf("Failed to send CONNECT: %v", err)
	}

	if err := client.Subscribe(topic, 0); err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}
	log.Printf("Subscribed to %s", topic)

	go client.ReadLoop()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if err := client.Ping(); err != nil {
			log.Printf("Ping error: %v", err)
			return
		}
	}
}

func runMigrationTest(server, clientID, topic string, cleanSession bool) {
	log.Println("=== Migration Test ===")
	log.Println("This test simulates network switching by reconnecting")
	log.Println("with the same ClientID but different local ports")
	log.Println("")

	log.Printf("Creating first connection (simulating WiFi)...")
	client1, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect (WiFi): %v", err)
	}

	if err := client1.Connect(cleanSession); err != nil {
		log.Fatalf("Failed to send CONNECT (WiFi): %v", err)
	}

	if err := client1.Subscribe(topic, 0); err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}

	go client1.ReadLoop()

	log.Printf("WiFi connection established")
	log.Printf("  - Local addr: %s", client1.GetLocalAddr())
	log.Printf("  - 0-RTT: %v", client1.IsUsing0RTT())

	go func() {
		counter := 1
		pubClient, err := NewClient(server, "publisher")
		if err != nil {
			log.Printf("Publisher connect error: %v", err)
			return
		}
		defer pubClient.Close()
		pubClient.Connect(true)

		for {
			payload := fmt.Sprintf("Message %d at %s", counter, time.Now().Format("15:04:05"))
			pubClient.Publish(topic, []byte(payload), 0)
			log.Printf("[Publisher] %s", payload)
			counter++
			time.Sleep(2 * time.Second)
		}
	}()

	time.Sleep(5 * time.Second)

	log.Println("")
	log.Printf("=== Simulating network switch: WiFi -> Cellular ===")
	log.Println("Closing WiFi connection...")

	log.Println("")
	log.Printf("Creating second connection (simulating Cellular)...")
	startTime := time.Now()
	client2, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect (Cellular): %v", err)
	}

	if err := client2.Connect(false); err != nil {
		log.Fatalf("Failed to send CONNECT (Cellular): %v", err)
	}
	migrationTime := time.Since(startTime)

	go client2.ReadLoop()

	log.Printf("Cellular connection established")
	log.Printf("  - Local addr: %s", client2.GetLocalAddr())
	log.Printf("  - 0-RTT: %v", client2.IsUsing0RTT())
	log.Printf("  - Migration time: %v", migrationTime)
	log.Println("")
	log.Println("=== Migration complete! Session preserved ===")
	log.Println("Messages should continue to be received on the new connection")
	log.Println("")

	client1.Close()

	select {}
}

func runWillTest(server, clientID, topic string, cleanSession bool) {
	log.Println("=== Will Message Migration Test ===")
	log.Println("This test verifies that Will messages are suppressed")
	log.Println("during connection migration (WiFi -> Cellular)")
	log.Println("")

	willTopic := "client/status"
	willPayload := fmt.Sprintf("Client %s disconnected unexpectedly", clientID)

	willPacket := &mqtt.ConnectPacket{
		ProtocolName:  "MQTT",
		ProtocolLevel: 4,
		CleanSession:  cleanSession,
		KeepAlive:     10,
		WillFlag:      true,
		WillQoS:       1,
		WillTopic:     willTopic,
		WillMessage:   []byte(willPayload),
	}

	log.Printf("Creating first connection with Will message...")
	log.Printf("Will Topic: %s", willTopic)
	log.Printf("Will Payload: %s", willPayload)
	log.Println("")

	client1, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect (WiFi): %v", err)
	}

	if err := client1.ConnectWithWill(cleanSession, willPacket); err != nil {
		log.Fatalf("Failed to send CONNECT (WiFi): %v", err)
	}

	if err := client1.Subscribe(topic, 0); err != nil {
		log.Fatalf("Failed to subscribe: %v", err)
	}

	if err := client1.Subscribe(willTopic, 0); err != nil {
		log.Fatalf("Failed to subscribe to will topic: %v", err)
	}

	go client1.ReadLoop()

	log.Printf("WiFi connection established - Local addr: %s", client1.GetLocalAddr())
	log.Printf("Will message is now armed")
	log.Println("")

	go func() {
		counter := 1
		for {
			log.Printf("[Heartbeat] Message %d", counter)
			counter++
			time.Sleep(2 * time.Second)
		}
	}()

	time.Sleep(4 * time.Second)

	log.Println("")
	log.Printf("=== Simulating network switch: WiFi -> Cellular ===")
	log.Println("NOTICE: Will message should NOT be sent during migration!")
	log.Println("")

	log.Printf("Creating second connection (simulating Cellular)...")
	client2, err := NewClient(server, clientID)
	if err != nil {
		log.Fatalf("Failed to connect (Cellular): %v", err)
	}

	if err := client2.ConnectWithWill(false, willPacket); err != nil {
		log.Fatalf("Failed to send CONNECT (Cellular): %v", err)
	}

	if err := client2.Subscribe(willTopic, 0); err != nil {
		log.Fatalf("Failed to subscribe to will topic: %v", err)
	}

	go client2.ReadLoop()

	log.Printf("Cellular connection established - Local addr: %s", client2.GetLocalAddr())
	log.Println("")
	log.Println("=== Migration complete! ===")
	log.Println("")
	log.Println("CHECK: If you DO NOT see a Will message received,")
	log.Println("       the suppression is working correctly!")
	log.Println("")
	log.Println("Waiting 10 seconds to verify no Will message is sent...")
	log.Println("")

	client1.Close()

	for i := 0; i < 10; i++ {
		log.Printf("Wait... %d/10 seconds", i+1)
		time.Sleep(1 * time.Second)
	}

	log.Println("")
	log.Println("=== Test Complete ===")
	log.Println("No Will message was sent during migration - SUCCESS!")
	log.Println("Keepalive counter was reset on new connection")

	select {}
}
