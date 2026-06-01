package main

import (
	"flag"
	"log"
	"os"
	"path/filepath"

	"sip-tls-server/pkg/api"
	"sip-tls-server/pkg/certgen"
	"sip-tls-server/pkg/sipserver"
)

func main() {
	sipAddr := flag.String("sip-addr", ":5061", "SIP TLS server address")
	httpAddr := flag.String("http-addr", ":8080", "HTTP API server address")
	certsDir := flag.String("certs-dir", "./certs", "Certificate storage directory")
	flag.Parse()

	os.MkdirAll(*certsDir, 0755)
	os.MkdirAll(filepath.Join(*certsDir, "clients"), 0755)

	caCertPath := filepath.Join(*certsDir, "ca.crt")
	caKeyPath := filepath.Join(*certsDir, "ca.key")
	serverCertPath := filepath.Join(*certsDir, "server.crt")
	serverKeyPath := filepath.Join(*certsDir, "server.key")

	var caCert *certgen.Certificate
	var err error

	if _, err := os.Stat(caCertPath); os.IsNotExist(err) {
		log.Println("Generating CA certificate...")
		caCert, err = certgen.GenerateCA()
		if err != nil {
			log.Fatalf("Failed to generate CA: %v", err)
		}

		os.WriteFile(caCertPath, caCert.CertPEM, 0644)
		os.WriteFile(caKeyPath, caCert.KeyPEM, 0600)

		log.Println("Generating server certificate...")
		serverCert, err := certgen.GenerateServerCert(caCert, []string{"localhost", "127.0.0.1"})
		if err != nil {
			log.Fatalf("Failed to generate server cert: %v", err)
		}

		os.WriteFile(serverCertPath, serverCert.CertPEM, 0644)
		os.WriteFile(serverKeyPath, serverCert.KeyPEM, 0600)
	} else {
		log.Println("Loading existing certificates...")
		caCertPEM, _ := os.ReadFile(caCertPath)
		caKeyPEM, _ := os.ReadFile(caKeyPath)
		caCert = &certgen.Certificate{
			CertPEM: caCertPEM,
			KeyPEM:  caKeyPEM,
		}
	}

	serverCert, err := api.LoadTLSCertificate(serverCertPath, serverKeyPath)
	if err != nil {
		log.Fatalf("Failed to load server certificate: %v", err)
	}

	caCertPEM, _ := os.ReadFile(caCertPath)
	caKeyPEM, _ := os.ReadFile(caKeyPath)
	allowedDomains := []string{"localhost", "sip.example.com"}
	sipServer, err := sipserver.NewSIPServer(*sipAddr, caCertPEM, caKeyPEM, serverCert, allowedDomains, *certsDir)
	if err != nil {
		log.Fatalf("Failed to create SIP server: %v", err)
	}

	apiServer := api.NewAPIServer(sipServer, *certsDir, caCert)

	go func() {
		log.Printf("Starting HTTP API server on %s", *httpAddr)
		if err := apiServer.Start(*httpAddr); err != nil {
			log.Fatalf("HTTP API server error: %v", err)
		}
	}()

	log.Printf("Starting SIP TLS server on %s", *sipAddr)
	if err := sipServer.Start(); err != nil {
		log.Fatalf("SIP server error: %v", err)
	}
}
