package main

import (
	"crypto/tls"
	"crypto/x509"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

func main() {
	serverAddr := flag.String("server", "localhost:5061", "SIP server address")
	username := flag.String("username", "alice", "SIP username")
	domain := flag.String("domain", "localhost", "SIP domain (for certificate validation)")
	certsDir := flag.String("certs-dir", "./certs", "Certificate directory")
	flag.Parse()

	caCertPath := filepath.Join(*certsDir, "ca.crt")
	clientCertPath := filepath.Join(*certsDir, "clients", *username, "client.crt")
	clientKeyPath := filepath.Join(*certsDir, "clients", *username, "client.key")

	if _, err := os.Stat(clientCertPath); os.IsNotExist(err) {
		log.Fatalf("Client certificate not found for user %s. Please generate it first via the web UI.", *username)
	}

	caCert, err := os.ReadFile(caCertPath)
	if err != nil {
		log.Fatalf("Failed to read CA cert: %v", err)
	}

	clientCert, err := tls.LoadX509KeyPair(clientCertPath, clientKeyPath)
	if err != nil {
		log.Fatalf("Failed to load client cert: %v", err)
	}

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCert)

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{clientCert},
		RootCAs:      caCertPool,
		ServerName:   "localhost",
		MinVersion:   tls.VersionTLS12,
	}

	log.Printf("Connecting to SIP server %s...", *serverAddr)
	conn, err := tls.Dial("tcp", *serverAddr, tlsConfig)
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}
	defer conn.Close()

	log.Println("Connected successfully with mutual TLS!")

	state := conn.ConnectionState()
	log.Printf("TLS Version: %s", state.Version)
	log.Printf("Cipher Suite: %s", tls.CipherSuiteName(state.CipherSuite))

	if len(state.PeerCertificates) > 0 {
		serverCert := state.PeerCertificates[0]
		log.Printf("Server Certificate:")
		log.Printf("  Subject CN: %s", serverCert.Subject.CommonName)
		log.Printf("  Issuer CN: %s", serverCert.Issuer.CommonName)
		log.Printf("  Valid: %s - %s", serverCert.NotBefore.Format(time.RFC3339), serverCert.NotAfter.Format(time.RFC3339))
		if len(serverCert.DNSNames) > 0 {
			log.Printf("  DNS SANs: %v", serverCert.DNSNames)
		}
	}

	if len(state.PeerCertificates) > 0 {
		clientCert := state.PeerCertificates[0]
		log.Printf("Client Certificate:")
		log.Printf("  Subject CN: %s", clientCert.Subject.CommonName)
		log.Printf("  Issuer CN: %s", clientCert.Issuer.CommonName)
		log.Printf("  Valid: %s - %s", clientCert.NotBefore.Format(time.RFC3339), clientCert.NotAfter.Format(time.RFC3339))
		if len(clientCert.DNSNames) > 0 {
			log.Printf("  DNS SANs: %v", clientCert.DNSNames)
		}
		now := time.Now()
		if now.Before(clientCert.NotBefore) {
			log.Printf("  ⚠️  Certificate not valid yet!")
		} else if now.After(clientCert.NotAfter) {
			log.Printf("  ⚠️  Certificate expired!")
		} else {
			log.Printf("  ✅ Certificate date valid")
		}
	}

	callID := fmt.Sprintf("%d@%s", time.Now().UnixNano(), *domain)

	registerMessage := fmt.Sprintf(
		"REGISTER sip:%s SIP/2.0\r\n"+
			"Via: SIP/2.0/TLS %s;branch=z9hG4bK%s\r\n"+
			"From: <sip:%s@%s>;tag=12345\r\n"+
			"To: <sip:%s@%s>\r\n"+
			"Call-ID: %s\r\n"+
			"CSeq: 1 REGISTER\r\n"+
			"Contact: <sip:%s@%s>\r\n"+
			"Expires: 3600\r\n"+
			"Content-Length: 0\r\n\r\n",
		*domain, *domain, callID, *username, *domain, *username, *domain, callID, *username, *domain,
	)

	log.Println("Sending REGISTER request...")
	log.Printf("\n%s", registerMessage)

	_, err = conn.Write([]byte(registerMessage))
	if err != nil {
		log.Fatalf("Failed to send REGISTER: %v", err)
	}

	buf := make([]byte, 4096)
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	n, err := conn.Read(buf)
	if err != nil {
		log.Fatalf("Failed to read response: %v", err)
	}

	response := string(buf[:n])
	log.Println("Received response:")
	log.Printf("\n%s", response)

	if len(os.Args) > 1 && os.Args[1] == "--call" {
		callID = fmt.Sprintf("call-%d@%s", time.Now().UnixNano(), *domain)
		target := "bob"
		if len(os.Args) > 2 {
			target = os.Args[2]
		}

		inviteMessage := fmt.Sprintf(
			"INVITE sip:%s@%s SIP/2.0\r\n"+
				"Via: SIP/2.0/TLS %s;branch=z9hG4bK%s\r\n"+
				"From: <sip:%s@%s>;tag=67890\r\n"+
				"To: <sip:%s@%s>\r\n"+
				"Call-ID: %s\r\n"+
				"CSeq: 1 INVITE\r\n"+
				"Contact: <sip:%s@%s>\r\n"+
				"Content-Type: application/sdp\r\n"+
				"Content-Length: 0\r\n\r\n",
			target, *domain, *domain, callID, *username, *domain, target, *domain, callID, *username, *domain,
		)

		log.Println("Sending INVITE request...")
		_, err = conn.Write([]byte(inviteMessage))
		if err != nil {
			log.Fatalf("Failed to send INVITE: %v", err)
		}

		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		n, err = conn.Read(buf)
		if err != nil {
			log.Fatalf("Failed to read INVITE response: %v", err)
		}

		log.Println("INVITE response:")
		log.Printf("\n%s", string(buf[:n]))
	}

	log.Println("Client finished. Keeping connection alive for 10 seconds...")
	time.Sleep(10 * time.Second)
}
