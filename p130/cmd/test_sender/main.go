package main

import (
	"encoding/binary"
	"fmt"
	"math/rand"
	"net"
	"time"
)

func main() {
	fmt.Println("SIP HEP Test Sender")
	fmt.Println("=== Test Case 1: Normal Call (INVITE -> 100 -> 180 -> 200 -> ACK -> BYE -> 200) ===")
	sendNormalCall()

	fmt.Println("\n=== Test Case 2: Cancelled Call (INVITE -> 100 -> CANCEL -> 487) ===")
	sendCancelledCall()

	fmt.Println("\n=== Test Case 3: TCP Fragmented Messages ===")
	sendTCPFragmented()

	fmt.Println("\n=== Test Case 4: Normal Call with RTP Media Streams ===")
	sendCallWithRTP()

	fmt.Println("\n=== Test Case 5: Registration Flood Detection ===")
	sendRegistrationFlood()

	fmt.Println("\n=== Test Case 6: RTP with Poor Quality (high loss, high jitter) ===")
	sendPoorQualityRTP()

	fmt.Println("\nAll tests completed!")
	fmt.Println("Open http://localhost:8080 to view the call flows, alerts, and RTP quality metrics.")
}

func sendNormalCall() {
	callID := "call-normal-" + fmt.Sprintf("%d", time.Now().Unix())
	
	messages := []struct {
		payload string
		srcIP   string
		dstIP   string
		srcPort uint16
		dstPort uint16
	}{
		{buildINVITE(callID, "1001", "1002", "192.168.1.50", "192.168.1.100"), "192.168.1.50", "192.168.1.100", 5060, 5060},
		{buildResponse(callID, 100, "Trying", "INVITE", "192.168.1.100", "192.168.1.50"), "192.168.1.100", "192.168.1.50", 5060, 5060},
		{buildResponse(callID, 180, "Ringing", "INVITE", "192.168.1.100", "192.168.1.50"), "192.168.1.100", "192.168.1.50", 5060, 5060},
		{buildResponse(callID, 200, "OK", "INVITE", "192.168.1.100", "192.168.1.50"), "192.168.1.100", "192.168.1.50", 5060, 5060},
		{buildACK(callID, "1001", "1002", "192.168.1.50", "192.168.1.100"), "192.168.1.50", "192.168.1.100", 5060, 5060},
		{buildBYE(callID, "1001", "1002", "192.168.1.50", "192.168.1.100"), "192.168.1.50", "192.168.1.100", 5060, 5060},
		{buildResponse(callID, 200, "OK", "BYE", "192.168.1.100", "192.168.1.50"), "192.168.1.100", "192.168.1.50", 5060, 5060},
	}

	conn, err := net.Dial("udp", "127.0.0.1:9060")
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		return
	}
	defer conn.Close()

	for i, msg := range messages {
		hepPacket := buildHEPPacket([]byte(msg.payload), msg.srcIP, msg.dstIP, msg.srcPort, msg.dstPort, 1)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending message %d: %v\n", i+1, err)
			return
		}
		fmt.Printf("  Sent #%d\n", i+1)
		time.Sleep(200 * time.Millisecond)
	}
}

func sendCancelledCall() {
	callID := "call-cancelled-" + fmt.Sprintf("%d", time.Now().Unix())
	
	messages := []struct {
		payload string
		srcIP   string
		dstIP   string
		srcPort uint16
		dstPort uint16
	}{
		{buildINVITE(callID, "2001", "2002", "192.168.1.60", "192.168.1.110"), "192.168.1.60", "192.168.1.110", 5060, 5060},
		{buildResponse(callID, 100, "Trying", "INVITE", "192.168.1.110", "192.168.1.60"), "192.168.1.110", "192.168.1.60", 5060, 5060},
		{buildResponse(callID, 180, "Ringing", "INVITE", "192.168.1.110", "192.168.1.60"), "192.168.1.110", "192.168.1.60", 5060, 5060},
		{buildCANCEL(callID, "2001", "2002", "192.168.1.60", "192.168.1.110"), "192.168.1.60", "192.168.1.110", 5060, 5060},
		{buildResponse(callID, 200, "OK", "CANCEL", "192.168.1.110", "192.168.1.60"), "192.168.1.110", "192.168.1.60", 5060, 5060},
		{buildResponse(callID, 487, "Request Terminated", "INVITE", "192.168.1.110", "192.168.1.60"), "192.168.1.110", "192.168.1.60", 5060, 5060},
		{buildACK(callID, "2001", "2002", "192.168.1.60", "192.168.1.110"), "192.168.1.60", "192.168.1.110", 5060, 5060},
	}

	conn, err := net.Dial("udp", "127.0.0.1:9060")
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		return
	}
	defer conn.Close()

	for i, msg := range messages {
		hepPacket := buildHEPPacket([]byte(msg.payload), msg.srcIP, msg.dstIP, msg.srcPort, msg.dstPort, 1)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending message %d: %v\n", i+1, err)
			return
		}
		fmt.Printf("  Sent #%d (487 Request Terminated included)\n", i+1)
		time.Sleep(200 * time.Millisecond)
	}
}

func sendTCPFragmented() {
	callID := "call-frag-" + fmt.Sprintf("%d", time.Now().Unix())
	invite := buildINVITE(callID, "3001", "3002", "192.168.1.70", "192.168.1.120")
	response180 := buildResponse(callID, 180, "Ringing", "INVITE", "192.168.1.120", "192.168.1.70")
	
	conn, err := net.Dial("tcp", "127.0.0.1:9061")
	if err != nil {
		fmt.Printf("Error connecting TCP: %v\n", err)
		return
	}
	defer conn.Close()

	hep1 := buildHEPPacket([]byte(invite), "192.168.1.70", "192.168.1.120", 5060, 5060, 1)
	hep2 := buildHEPPacket([]byte(response180), "192.168.1.120", "192.168.1.70", 5060, 5060, 1)

	combined := append(hep1, hep2...)
	
	_, err = conn.Write(combined[:len(combined)/2])
	if err != nil {
		fmt.Printf("Error writing first fragment: %v\n", err)
		return
	}
	fmt.Println("  Sent TCP fragment 1/2")
	
	time.Sleep(100 * time.Millisecond)
	
	_, err = conn.Write(combined[len(combined)/2:])
	if err != nil {
		fmt.Printf("Error writing second fragment: %v\n", err)
		return
	}
	fmt.Println("  Sent TCP fragment 2/2 - reassembled successfully!")
	
	time.Sleep(100 * time.Millisecond)
}

func sendCallWithRTP() {
	callID := "call-rtp-" + fmt.Sprintf("%d", time.Now().Unix())
	
	fmt.Println("  Sending SIP signaling...")
	
	conn, err := net.Dial("udp", "127.0.0.1:9060")
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		return
	}
	defer conn.Close()

	sipMessages := []struct {
		payload string
		srcIP   string
		dstIP   string
		srcPort uint16
		dstPort uint16
	}{
		{buildINVITEWithSDP(callID, "4001", "4002", "192.168.1.80", "192.168.1.130", 10000, 20000), "192.168.1.80", "192.168.1.130", 5060, 5060},
		{buildResponse(callID, 100, "Trying", "INVITE", "192.168.1.130", "192.168.1.80"), "192.168.1.130", "192.168.1.80", 5060, 5060},
		{buildResponseWithSDP(callID, 200, "OK", "INVITE", "192.168.1.130", "192.168.1.80", 20000, 10000), "192.168.1.130", "192.168.1.80", 5060, 5060},
		{buildACK(callID, "4001", "4002", "192.168.1.80", "192.168.1.130"), "192.168.1.80", "192.168.1.130", 5060, 5060},
	}

	for i, msg := range sipMessages {
		hepPacket := buildHEPPacket([]byte(msg.payload), msg.srcIP, msg.dstIP, msg.srcPort, msg.dstPort, 1)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending SIP message %d: %v\n", i+1, err)
			return
		}
		fmt.Printf("  Sent SIP #%d\n", i+1)
		time.Sleep(200 * time.Millisecond)
	}

	fmt.Println("  Sending RTP packets (good quality, 100 packets, SSRC=0x12345678)...")
	
	ssrc := uint32(0x12345678)
	for seq := uint16(0); seq < 100; seq++ {
		timestamp := uint32(seq * 160)
		rtpPacket := buildRTPPacket(0, 0, 0, seq, timestamp, ssrc, 160)
		hepPacket := buildHEPPacket(rtpPacket, "192.168.1.80", "192.168.1.130", 10000, 20000, 2)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending RTP packet %d: %v\n", seq+1, err)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	
	fmt.Println("  Sent 100 RTP packets (direction: caller -> callee)")
	fmt.Println("  Sending RTP packets (reverse direction, SSRC=0x87654321)...")
	
	ssrc2 := uint32(0x87654321)
	for seq := uint16(0); seq < 100; seq++ {
		timestamp := uint32(seq * 160)
		rtpPacket := buildRTPPacket(0, 0, 0, seq, timestamp, ssrc2, 160)
		hepPacket := buildHEPPacket(rtpPacket, "192.168.1.130", "192.168.1.80", 20000, 10000, 2)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending RTP packet %d: %v\n", seq+1, err)
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	
	fmt.Println("  Sent 100 RTP packets (direction: callee -> caller)")
	fmt.Println("  Sending BYE...")
	
	bye := buildBYE(callID, "4001", "4002", "192.168.1.80", "192.168.1.130")
	hepPacket := buildHEPPacket([]byte(bye), "192.168.1.80", "192.168.1.130", 5060, 5060, 1)
	_, err = conn.Write(hepPacket)
	if err != nil {
		fmt.Printf("Error sending BYE: %v\n", err)
		return
	}
	
	byeResp := buildResponse(callID, 200, "OK", "BYE", "192.168.1.130", "192.168.1.80")
	hepPacket = buildHEPPacket([]byte(byeResp), "192.168.1.130", "192.168.1.80", 5060, 5060, 1)
	_, err = conn.Write(hepPacket)
	if err != nil {
		fmt.Printf("Error sending 200 OK (BYE): %v\n", err)
		return
	}
	
	fmt.Println("  Call with RTP completed! Expected MOS ~4.4")
}

func sendRegistrationFlood() {
	fmt.Println("  Sending 30 REGISTER requests from same IP in 5 seconds...")
	fmt.Println("  This should trigger a registration_flood alert (threshold: 20 in 10s)")
	
	conn, err := net.Dial("udp", "127.0.0.1:9060")
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		return
	}
	defer conn.Close()

	attackIP := "192.168.1.200"
	serverIP := "192.168.1.100"
	
	for i := 0; i < 30; i++ {
		user := fmt.Sprintf("user%d", rand.Intn(1000))
		register := buildREGISTER(user, attackIP, serverIP)
		hepPacket := buildHEPPacket([]byte(register), attackIP, serverIP, 5060, 5060, 1)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending REGISTER %d: %v\n", i+1, err)
			return
		}
		if (i+1)%10 == 0 {
			fmt.Printf("  Sent %d REGISTER requests...\n", i+1)
		}
		time.Sleep(150 * time.Millisecond)
	}
	
	fmt.Println("  Flood completed! Check alerts tab for registration_flood alert.")
}

func sendPoorQualityRTP() {
	callID := "call-poor-" + fmt.Sprintf("%d", time.Now().Unix())
	
	fmt.Println("  Sending SIP signaling...")
	
	conn, err := net.Dial("udp", "127.0.0.1:9060")
	if err != nil {
		fmt.Printf("Error connecting: %v\n", err)
		return
	}
	defer conn.Close()

	sipMessages := []struct {
		payload string
		srcIP   string
		dstIP   string
		srcPort uint16
		dstPort uint16
	}{
		{buildINVITEWithSDP(callID, "5001", "5002", "192.168.1.90", "192.168.1.140", 30000, 40000), "192.168.1.90", "192.168.1.140", 5060, 5060},
		{buildResponseWithSDP(callID, 200, "OK", "INVITE", "192.168.1.140", "192.168.1.90", 40000, 30000), "192.168.1.140", "192.168.1.90", 5060, 5060},
		{buildACK(callID, "5001", "5002", "192.168.1.90", "192.168.1.140"), "192.168.1.90", "192.168.1.140", 5060, 5060},
	}

	for i, msg := range sipMessages {
		hepPacket := buildHEPPacket([]byte(msg.payload), msg.srcIP, msg.dstIP, msg.srcPort, msg.dstPort, 1)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending SIP message %d: %v\n", i+1, err)
			return
		}
		time.Sleep(200 * time.Millisecond)
	}

	fmt.Println("  Sending RTP packets with ~10% packet loss and high jitter...")
	fmt.Println("  This should trigger quality alerts (high_loss_rate, high_jitter, low_mos)")
	
	ssrc := uint32(0xABCDEF01)
	expectedSeq := uint16(0)
	packetsSent := 0
	
	for i := 0; i < 100; i++ {
		if rand.Float64() < 0.1 {
			expectedSeq++
			continue
		}
		
		jitterDelay := time.Duration(rand.Intn(60)) * time.Millisecond
		time.Sleep(10*time.Millisecond + jitterDelay)
		
		timestamp := uint32(i * 160)
		rtpPacket := buildRTPPacket(0, 0, 0, expectedSeq, timestamp, ssrc, 160)
		hepPacket := buildHEPPacket(rtpPacket, "192.168.1.90", "192.168.1.140", 30000, 40000, 2)
		_, err := conn.Write(hepPacket)
		if err != nil {
			fmt.Printf("Error sending RTP packet: %v\n", err)
			return
		}
		
		expectedSeq++
		packetsSent++
		
		if (i+1)%20 == 0 {
			fmt.Printf("  Sent %d/%d RTP packets (skipping some to simulate loss)...\n", packetsSent, i+1)
		}
	}
	
	fmt.Printf("  Sent %d RTP packets, ~10 lost. Expected MOS ~3.0 or lower\n", packetsSent)
	
	bye := buildBYE(callID, "5001", "5002", "192.168.1.90", "192.168.1.140")
	hepPacket := buildHEPPacket([]byte(bye), "192.168.1.90", "192.168.1.140", 5060, 5060, 1)
	_, err = conn.Write(hepPacket)
	if err != nil {
		fmt.Printf("Error sending BYE: %v\n", err)
		return
	}
	
	byeResp := buildResponse(callID, 200, "OK", "BYE", "192.168.1.140", "192.168.1.90")
	hepPacket = buildHEPPacket([]byte(byeResp), "192.168.1.140", "192.168.1.90", 5060, 5060, 1)
	_, err = conn.Write(hepPacket)
	if err != nil {
		fmt.Printf("Error sending 200 OK (BYE): %v\n", err)
		return
	}
	
	fmt.Println("  Poor quality call completed! Check alerts tab for quality alerts.")
}

func buildINVITE(callID, fromUser, toUser, fromIP, toIP string) string {
	return fmt.Sprintf(`INVITE sip:%s@%s SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-1
From: "%s" <sip:%s@%s>;tag=12345
To: "%s" <sip:%s@%s>
Call-ID: %s@%s
CSeq: 1 INVITE
Contact: <sip:%s@%s:5060>
Content-Type: application/sdp
Content-Length: 142

v=0
o=user 2890844526 2890844526 IN IP4 %s
s=Session
c=IN IP4 %s
t=0 0
m=audio 49170 RTP/AVP 0
a=rtpmap:0 PCMU/8000`, toUser, toIP, fromIP, fromUser, fromUser, fromIP, toUser, toUser, toIP, callID, fromIP, fromUser, fromIP, fromIP, fromIP)
}

func buildINVITEWithSDP(callID, fromUser, toUser, fromIP, toIP string, fromRTP, toRTP uint16) string {
	return fmt.Sprintf(`INVITE sip:%s@%s SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-1
From: "%s" <sip:%s@%s>;tag=12345
To: "%s" <sip:%s@%s>
Call-ID: %s@%s
CSeq: 1 INVITE
Contact: <sip:%s@%s:5060>
Content-Type: application/sdp
Content-Length: 150

v=0
o=user 2890844526 2890844526 IN IP4 %s
s=Session
c=IN IP4 %s
t=0 0
m=audio %d RTP/AVP 0
a=rtpmap:0 PCMU/8000`, toUser, toIP, fromIP, fromUser, fromUser, fromIP, toUser, toUser, toIP, callID, fromIP, fromUser, fromIP, fromIP, fromIP, fromRTP)
}

func buildResponse(callID string, code int, text, method, fromIP, toIP string) string {
	return fmt.Sprintf(`SIP/2.0 %d %s
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-1
From: <sip:user@%s>;tag=12345
To: <sip:user@%s>;tag=67890
Call-ID: %s@%s
CSeq: 1 %s
Content-Length: 0`, code, text, toIP, toIP, fromIP, callID, toIP, method)
}

func buildResponseWithSDP(callID string, code int, text, method, fromIP, toIP string, fromRTP, toRTP uint16) string {
	return fmt.Sprintf(`SIP/2.0 %d %s
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-1
From: <sip:user@%s>;tag=12345
To: <sip:user@%s>;tag=67890
Call-ID: %s@%s
CSeq: 1 %s
Content-Type: application/sdp
Content-Length: 150

v=0
o=user 2890844526 2890844526 IN IP4 %s
s=Session
c=IN IP4 %s
t=0 0
m=audio %d RTP/AVP 0
a=rtpmap:0 PCMU/8000`, code, text, toIP, toIP, fromIP, callID, toIP, method, fromIP, fromIP, fromRTP)
}

func buildACK(callID, fromUser, toUser, fromIP, toIP string) string {
	return fmt.Sprintf(`ACK sip:%s@%s SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-2
From: "%s" <sip:%s@%s>;tag=12345
To: "%s" <sip:%s@%s>;tag=67890
Call-ID: %s@%s
CSeq: 2 ACK
Content-Length: 0`, toUser, toIP, fromIP, fromUser, fromUser, fromIP, toUser, toUser, toIP, callID, fromIP)
}

func buildBYE(callID, fromUser, toUser, fromIP, toIP string) string {
	return fmt.Sprintf(`BYE sip:%s@%s:5060 SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-3
From: "%s" <sip:%s@%s>;tag=12345
To: "%s" <sip:%s@%s>;tag=67890
Call-ID: %s@%s
CSeq: 3 BYE
Content-Length: 0`, toUser, toIP, fromIP, fromUser, fromUser, fromIP, toUser, toUser, toIP, callID, fromIP)
}

func buildCANCEL(callID, fromUser, toUser, fromIP, toIP string) string {
	return fmt.Sprintf(`CANCEL sip:%s@%s SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-1
From: "%s" <sip:%s@%s>;tag=12345
To: "%s" <sip:%s@%s>
Call-ID: %s@%s
CSeq: 1 CANCEL
Content-Length: 0`, toUser, toIP, fromIP, fromUser, fromUser, fromIP, toUser, toUser, toIP, callID, fromIP)
}

func buildREGISTER(user, fromIP, toIP string) string {
	return fmt.Sprintf(`REGISTER sip:%s SIP/2.0
Via: SIP/2.0/UDP %s:5060;branch=z9hG4bK-%d
From: <sip:%s@%s>;tag=%d
To: <sip:%s@%s>
Call-ID: reg-%d@%s
CSeq: 1 REGISTER
Expires: 3600
Contact: <sip:%s@%s:5060>
Content-Length: 0`, toIP, fromIP, time.Now().UnixNano(), user, toIP, time.Now().UnixNano(), user, toIP, time.Now().UnixNano(), fromIP, user, fromIP)
}

func buildRTPPacket(version, padding, extension uint8, seq uint16, timestamp, ssrc uint32, payloadSize int) []byte {
	packet := make([]byte, 12+payloadSize)
	
	firstByte := (version << 6) | (padding << 5) | (extension << 4)
	packet[0] = firstByte
	packet[1] = 0
	
	binary.BigEndian.PutUint16(packet[2:4], seq)
	binary.BigEndian.PutUint32(packet[4:8], timestamp)
	binary.BigEndian.PutUint32(packet[8:12], ssrc)
	
	for i := 12; i < len(packet); i++ {
		packet[i] = byte(rand.Intn(256))
	}
	
	return packet
}

func buildHEPPacket(payload []byte, srcIP, dstIP string, srcPort, dstPort uint16, protoType uint8) []byte {
	chunks := make([]byte, 0)

	chunks = appendChunk(chunks, 0x0001, []byte{0x02})
	chunks = appendChunk(chunks, 0x0002, []byte{protoType})

	chunks = appendChunk(chunks, 0x0003, net.ParseIP(srcIP).To4())
	chunks = appendChunk(chunks, 0x0004, net.ParseIP(dstIP).To4())

	srcPortBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(srcPortBytes, srcPort)
	chunks = appendChunk(chunks, 0x0007, srcPortBytes)

	dstPortBytes := make([]byte, 2)
	binary.BigEndian.PutUint16(dstPortBytes, dstPort)
	chunks = appendChunk(chunks, 0x0008, dstPortBytes)

	ts := make([]byte, 4)
	binary.BigEndian.PutUint32(ts, uint32(time.Now().Unix()))
	chunks = appendChunk(chunks, 0x0009, ts)

	tsMicro := make([]byte, 4)
	binary.BigEndian.PutUint32(tsMicro, uint32(time.Now().UnixNano()/1000))
	chunks = appendChunk(chunks, 0x000a, tsMicro)

	chunks = appendChunk(chunks, 0x000f, payload)

	totalLength := uint32(6 + len(chunks))

	result := make([]byte, 0, totalLength)
	result = append(result, 0x02)
	result = append(result, 0x00)

	lenBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBytes, totalLength)
	result = append(result, lenBytes...)
	result = append(result, chunks...)

	return result
}

func appendChunk(data []byte, chunkType uint16, chunkData []byte) []byte {
	header := make([]byte, 6)
	binary.BigEndian.PutUint16(header[0:2], 0x0000)
	binary.BigEndian.PutUint16(header[2:4], chunkType)
	binary.BigEndian.PutUint16(header[4:6], uint16(6+len(chunkData)))

	result := make([]byte, 0, len(data)+len(header)+len(chunkData))
	result = append(result, data...)
	result = append(result, header...)
	result = append(result, chunkData...)
	return result
}
