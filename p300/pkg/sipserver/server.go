package sipserver

import (
	"crypto"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"log"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Registration struct {
	User       string
	Domain     string
	Contact    string
	Expires    time.Time
	LastSeen   time.Time
}

type RevokedCert struct {
	SerialNumber *big.Int
	RevokedAt    time.Time
	Reason       string
}

type CRL struct {
	Issuer             pkix.RDNSequence
	ThisUpdate         time.Time
	NextUpdate         time.Time
	RevokedCertificates map[string]*RevokedCert
	mu                 sync.RWMutex
}

type CertValidationResult struct {
	Valid           bool
	Error           string
	SubjectCN       string
	IssuerCN        string
	NotBefore       time.Time
	NotAfter        time.Time
	DNSNames        []string
	IPAddresses     []net.IP
	SHA256Fingerprint string
	SHA1Fingerprint  string
	SerialNumber    string
	CAMatch         bool
	DateValid       bool
	DomainMatch     bool
	CRLValid        bool
}

type SIPServer struct {
	address        string
	registrations  map[string]*Registration
	mu             sync.RWMutex
	tlsConfig      *tls.Config
	caCert         *x509.Certificate
	caKey          interface{}
	allowedDomains []string
	crl            *CRL
	crlPath        string
	certsDir       string
}

func NewSIPServer(address string, caCertPEM, caKeyPEM []byte, serverCert tls.Certificate, allowedDomains []string, certsDir string) (*SIPServer, error) {
	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCertPEM)

	var caCert *x509.Certificate
	block, _ := pem.Decode(caCertPEM)
	if block != nil {
		var err error
		caCert, err = x509.ParseCertificate(block.Bytes)
		if err != nil {
			return nil, fmt.Errorf("failed to parse CA certificate: %v", err)
		}
	}

	var caKey interface{}
	if len(caKeyPEM) > 0 {
		block, _ := pem.Decode(caKeyPEM)
		if block != nil {
			var err error
			caKey, err = x509.ParsePKCS8PrivateKey(block.Bytes)
			if err != nil {
				log.Printf("Warning: failed to parse CA private key: %v", err)
			}
		}
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientCAs:    caCertPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		MinVersion:   tls.VersionTLS12,
		VerifyPeerCertificate: func(rawCerts [][]byte, verifiedChains [][]*x509.Certificate) error {
			if len(verifiedChains) == 0 || len(verifiedChains[0]) == 0 {
				return errors.New("no verified certificate chain")
			}
			return nil
		},
	}

	if len(allowedDomains) == 0 {
		allowedDomains = []string{"localhost"}
	}

	crlPath := filepath.Join(certsDir, "crl.pem")
	crl := &CRL{
		Issuer:               caCert.Subject.ToRDNSequence(),
		ThisUpdate:           time.Now(),
		NextUpdate:           time.Now().AddDate(0, 1, 0),
		RevokedCertificates:  make(map[string]*RevokedCert),
	}

	server := &SIPServer{
		address:        address,
		registrations:  make(map[string]*Registration),
		tlsConfig:      tlsConfig,
		caCert:         caCert,
		caKey:          caKey,
		allowedDomains: allowedDomains,
		crl:            crl,
		crlPath:        crlPath,
		certsDir:       certsDir,
	}

	if err := server.loadCRL(); err != nil {
		log.Printf("Warning: failed to load CRL, creating new one: %v", err)
	}

	return server, nil
}

func (s *SIPServer) ValidateClientCertificate(cert *x509.Certificate, sipDomain string) *CertValidationResult {
	result := &CertValidationResult{
		SubjectCN:        cert.Subject.CommonName,
		IssuerCN:         cert.Issuer.CommonName,
		NotBefore:        cert.NotBefore,
		NotAfter:         cert.NotAfter,
		DNSNames:         cert.DNSNames,
		IPAddresses:      cert.IPAddresses,
		SHA256Fingerprint: CalculateSHA256Fingerprint(cert),
		SHA1Fingerprint:  CalculateSHA1Fingerprint(cert),
		SerialNumber:     cert.SerialNumber.String(),
	}

	log.Printf("Certificate fingerprint info:")
	log.Printf("  Serial: %s", result.SerialNumber)
	log.Printf("  SHA256: %s", result.SHA256Fingerprint)
	log.Printf("  SHA1:   %s", result.SHA1Fingerprint)

	now := time.Now()
	if now.Before(cert.NotBefore) {
		result.Error = fmt.Sprintf("certificate not valid yet, valid from %s", cert.NotBefore.Format(time.RFC3339))
		return result
	}
	if now.After(cert.NotAfter) {
		result.Error = fmt.Sprintf("certificate expired on %s", cert.NotAfter.Format(time.RFC3339))
		return result
	}
	result.DateValid = true

	if s.caCert != nil {
		roots := x509.NewCertPool()
		roots.AddCert(s.caCert)
		opts := x509.VerifyOptions{
			Roots: roots,
			KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
		}
		if _, err := cert.Verify(opts); err != nil {
			result.Error = fmt.Sprintf("certificate not issued by trusted CA: %v", err)
			return result
		}
		result.CAMatch = true
	}

	if s.IsCertificateRevoked(cert.SerialNumber) {
		result.Error = fmt.Sprintf("certificate has been revoked (Serial: %s, SHA256: %s)", 
			result.SerialNumber, result.SHA256Fingerprint)
		return result
	}
	result.CRLValid = true

	domainValid := false
	certDomains := make([]string, 0)
	certDomains = append(certDomains, cert.Subject.CommonName)
	certDomains = append(certDomains, cert.DNSNames...)
	
	for _, certDomain := range certDomains {
		if certDomain == sipDomain || 
		   (strings.HasPrefix(certDomain, "*.") && strings.HasSuffix(sipDomain, certDomain[1:])) {
			domainValid = true
			break
		}
	}

	if !domainValid && sipDomain != "" {
		result.Error = fmt.Sprintf("certificate CN/SAN does not match SIP domain '%s'. Certificate domains: %v", 
			sipDomain, certDomains)
		return result
	}
	result.DomainMatch = domainValid

	result.Valid = result.DateValid && result.CAMatch && result.CRLValid && (sipDomain == "" || result.DomainMatch)
	return result
}

func CalculateSHA256Fingerprint(cert *x509.Certificate) string {
	hash := sha256.Sum256(cert.Raw)
	return hex.EncodeToString(hash[:])
}

func CalculateSHA1Fingerprint(cert *x509.Certificate) string {
	hash := sha1.Sum(cert.Raw)
	return hex.EncodeToString(hash[:])
}

func (s *SIPServer) Start() error {
	listener, err := tls.Listen("tcp", s.address, s.tlsConfig)
	if err != nil {
		return fmt.Errorf("failed to start TLS listener: %v", err)
	}
	defer listener.Close()

	log.Printf("SIP TLS Server listening on %s", s.address)
	log.Printf("Allowed SIP domains: %v", s.allowedDomains)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Accept error: %v", err)
			continue
		}

		tlsConn := conn.(*tls.Conn)
		if err := tlsConn.Handshake(); err != nil {
			log.Printf("TLS handshake failed: %v", err)
			conn.Close()
			continue
		}

		state := tlsConn.ConnectionState()
		if len(state.PeerCertificates) == 0 {
			log.Printf("No client certificate provided from %s", conn.RemoteAddr())
			conn.Close()
			continue
		}

		clientCert := state.PeerCertificates[0]
		log.Printf("Client connected: %s", conn.RemoteAddr())
		log.Printf("  Certificate Subject CN: %s", clientCert.Subject.CommonName)
		log.Printf("  Certificate Issuer CN: %s", clientCert.Issuer.CommonName)
		log.Printf("  Certificate Validity: %s - %s", 
			clientCert.NotBefore.Format(time.RFC3339), 
			clientCert.NotAfter.Format(time.RFC3339))
		if len(clientCert.DNSNames) > 0 {
			log.Printf("  Certificate SAN (DNS): %v", clientCert.DNSNames)
		}
		if len(clientCert.IPAddresses) > 0 {
			log.Printf("  Certificate SAN (IP): %v", clientCert.IPAddresses)
		}

		go s.handleConnection(conn, clientCert)
	}
}

func (s *SIPServer) handleConnection(conn net.Conn, clientCert *x509.Certificate) {
	defer conn.Close()

	buf := make([]byte, 4096)
	for {
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			log.Printf("Read error: %v", err)
			return
		}

		if n > 0 {
			message := string(buf[:n])
			log.Printf("Received message from %s:\n%s", conn.RemoteAddr(), message)
			s.handleSIPMessage(conn, message, clientCert)
		}
	}
}

func (s *SIPServer) handleSIPMessage(conn net.Conn, message string, clientCert *x509.Certificate) {
	lines := splitLines(message)
	if len(lines) == 0 {
		return
	}

	firstLine := lines[0]
	var response string

	switch {
	case startsWith(firstLine, "REGISTER"):
		response = s.handleRegister(conn, lines, clientCert)
	case startsWith(firstLine, "INVITE"):
		response = s.handleInvite(conn, lines, clientCert)
	case startsWith(firstLine, "BYE"):
		response = s.handleBye(conn, lines)
	case startsWith(firstLine, "ACK"):
		response = s.handleAck(conn, lines)
	default:
		response = "SIP/2.0 405 Method Not Allowed\r\n\r\n"
	}

	conn.Write([]byte(response))
}

func (s *SIPServer) handleRegister(conn net.Conn, lines []string, clientCert *x509.Certificate) string {
	var user, domain, contact, callID string
	expires := 3600

	for _, line := range lines[1:] {
		switch {
		case startsWith(line, "To:"):
			user = extractUser(line)
			domain = extractDomain(line)
		case startsWith(line, "Contact:"):
			contact = extractContact(line)
		case startsWith(line, "Call-ID:"):
			callID = extractHeaderValue(line)
		case startsWith(line, "Expires:"):
			expires = parseInt(extractHeaderValue(line), 3600)
		}
	}

	if user == "" {
		return "SIP/2.0 400 Bad Request\r\n\r\n"
	}

	domainAllowed := false
	for _, d := range s.allowedDomains {
		if domain == d {
			domainAllowed = true
			break
		}
	}
	if !domainAllowed && domain != "" {
		log.Printf("Domain '%s' not in allowed list: %v", domain, s.allowedDomains)
		return fmt.Sprintf("SIP/2.0 403 Forbidden - Domain '%s' not allowed\r\n\r\n", domain)
	}

	validationResult := s.ValidateClientCertificate(clientCert, domain)
	if !validationResult.Valid {
		log.Printf("Certificate validation failed for user %s: %s", user, validationResult.Error)
		return fmt.Sprintf("SIP/2.0 403 Forbidden - %s\r\n\r\n", validationResult.Error)
	}

	log.Printf("Certificate validation passed for user %s", user)
	log.Printf("  - Date Valid: %v", validationResult.DateValid)
	log.Printf("  - CA Match: %v", validationResult.CAMatch)
	log.Printf("  - Domain Match: %v", validationResult.DomainMatch)

	s.mu.Lock()
	s.registrations[user] = &Registration{
		User:     user,
		Domain:   domain,
		Contact:  contact,
		Expires:  time.Now().Add(time.Duration(expires) * time.Second),
		LastSeen: time.Now(),
	}
	s.mu.Unlock()

	log.Printf("User registered: %s@%s at %s", user, domain, contact)

	response := fmt.Sprintf("SIP/2.0 200 OK\r\n"+
		"To: <sip:%s@%s>\r\n"+
		"From: <sip:%s@%s>\r\n"+
		"Call-ID: %s\r\n"+
		"CSeq: 1 REGISTER\r\n"+
		"Contact: %s;expires=%d\r\n"+
		"Content-Length: 0\r\n\r\n", user, domain, user, domain, callID, contact, expires)

	return response
}

func (s *SIPServer) handleInvite(conn net.Conn, lines []string, clientCert *x509.Certificate) string {
	var toUser, toDomain, fromUser, fromDomain, callID string

	for _, line := range lines[1:] {
		switch {
		case startsWith(line, "To:"):
			toUser = extractUser(line)
			toDomain = extractDomain(line)
		case startsWith(line, "From:"):
			fromUser = extractUser(line)
			fromDomain = extractDomain(line)
		case startsWith(line, "Call-ID:"):
			callID = extractHeaderValue(line)
		}
	}

	validationResult := s.ValidateClientCertificate(clientCert, fromDomain)
	if !validationResult.Valid {
		log.Printf("Certificate validation failed for caller %s: %s", fromUser, validationResult.Error)
		return fmt.Sprintf("SIP/2.0 403 Forbidden - %s\r\n\r\n", validationResult.Error)
	}

	s.mu.RLock()
	_, exists := s.registrations[toUser]
	s.mu.RUnlock()

	if !exists {
		return fmt.Sprintf("SIP/2.0 404 User Not Found\r\n"+
			"To: <sip:%s@%s>\r\n"+
			"From: <sip:%s@%s>\r\n"+
			"Call-ID: %s\r\n"+
			"CSeq: 1 INVITE\r\n"+
			"Content-Length: 0\r\n\r\n", toUser, toDomain, fromUser, fromDomain, callID)
	}

	log.Printf("Call from %s@%s to %s@%s", fromUser, fromDomain, toUser, toDomain)

	return fmt.Sprintf("SIP/2.0 100 Trying\r\n"+
		"To: <sip:%s@%s>\r\n"+
		"From: <sip:%s@%s>\r\n"+
		"Call-ID: %s\r\n"+
		"CSeq: 1 INVITE\r\n"+
		"Content-Length: 0\r\n\r\n", toUser, toDomain, fromUser, fromDomain, callID)
}

func (s *SIPServer) handleBye(conn net.Conn, lines []string) string {
	var callID string
	for _, line := range lines[1:] {
		if startsWith(line, "Call-ID:") {
			callID = extractHeaderValue(line)
			break
		}
	}

	log.Printf("Call ended, Call-ID: %s", callID)

	return fmt.Sprintf("SIP/2.0 200 OK\r\n"+
		"Call-ID: %s\r\n"+
		"CSeq: 1 BYE\r\n"+
		"Content-Length: 0\r\n\r\n", callID)
}

func (s *SIPServer) handleAck(conn net.Conn, lines []string) string {
	return ""
}

func (s *SIPServer) GetRegistrations() map[string]*Registration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]*Registration)
	for k, v := range s.registrations {
		if v.Expires.After(time.Now()) {
			result[k] = v
		}
	}
	return result
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			line := s[start:i]
			if len(line) > 0 && line[len(line)-1] == '\r' {
				line = line[:len(line)-1]
			}
			lines = append(lines, line)
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func startsWith(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}

func extractUser(s string) string {
	start := indexOf(s, "<sip:")
	if start == -1 {
		return ""
	}
	start += 5
	end := indexOf(s[start:], "@")
	if end == -1 {
		return ""
	}
	return s[start : start+end]
}

func extractContact(s string) string {
	start := indexOf(s, "<")
	if start == -1 {
		return ""
	}
	start++
	end := indexOf(s[start:], ">")
	if end == -1 {
		return ""
	}
	return s[start : start+end]
}

func extractHeaderValue(s string) string {
	colon := indexOf(s, ":")
	if colon == -1 {
		return ""
	}
	value := s[colon+1:]
	for len(value) > 0 && value[0] == ' ' {
		value = value[1:]
	}
	return value
}

func parseInt(s string, defaultValue int) int {
	result := 0
	for _, c := range s {
		if c >= '0' && c <= '9' {
			result = result*10 + int(c-'0')
		} else {
			break
		}
	}
	if result == 0 {
		return defaultValue
	}
	return result
}

func indexOf(s, substr string) int {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

func extractDomain(s string) string {
	start := indexOf(s, "@")
	if start == -1 {
		return ""
	}
	start++
	end := indexOf(s[start:], ">")
	if end == -1 {
		return ""
	}
	return s[start : start+end]
}

func (s *SIPServer) loadCRL() error {
	if _, err := os.Stat(s.crlPath); os.IsNotExist(err) {
		return s.saveCRL()
	}

	data, err := os.ReadFile(s.crlPath)
	if err != nil {
		return fmt.Errorf("failed to read CRL file: %v", err)
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return fmt.Errorf("failed to decode CRL PEM")
	}

	crl, err := x509.ParseCRL(block.Bytes)
	if err != nil {
		return fmt.Errorf("failed to parse CRL: %v", err)
	}

	s.crl.mu.Lock()
	defer s.crl.mu.Unlock()

	s.crl.Issuer = crl.TBSCertList.Issuer
	s.crl.ThisUpdate = crl.TBSCertList.ThisUpdate
	s.crl.NextUpdate = crl.TBSCertList.NextUpdate

	for _, rc := range crl.TBSCertList.RevokedCertificates {
		s.crl.RevokedCertificates[rc.SerialNumber.String()] = &RevokedCert{
			SerialNumber: rc.SerialNumber,
			RevokedAt:    rc.RevocationTime,
			Reason:       "unknown",
		}
	}

	log.Printf("Loaded CRL with %d revoked certificates", len(s.crl.RevokedCertificates))

	return nil
}

func (s *SIPServer) saveCRL() error {
	if s.caKey == nil {
		return fmt.Errorf("CA private key not available, cannot sign CRL")
	}

	s.crl.mu.RLock()
	defer s.crl.mu.RUnlock()

	revokedCerts := make([]pkix.RevokedCertificate, 0, len(s.crl.RevokedCertificates))

	for _, rc := range s.crl.RevokedCertificates {
		revokedCerts = append(revokedCerts, pkix.RevokedCertificate{
			SerialNumber:   rc.SerialNumber,
			RevocationTime: rc.RevokedAt,
		})
	}

	number := big.NewInt(1)
	crlTemplate := &x509.RevocationList{
		Number:             number,
		ThisUpdate:         time.Now(),
		NextUpdate:         time.Now().AddDate(0, 1, 0),
		RevokedCertificates: revokedCerts,
	}

	crlBytes, err := x509.CreateRevocationList(
		rand.Reader,
		crlTemplate,
		s.caCert,
		s.caKey.(crypto.Signer),
	)
	if err != nil {
		return fmt.Errorf("failed to create CRL: %v", err)
	}

	pemBytes := pem.EncodeToMemory(&pem.Block{
		Type: "X509 CRL",
		Bytes: crlBytes,
	})

	if err := os.WriteFile(s.crlPath, pemBytes, 0644); err != nil {
		return fmt.Errorf("failed to write CRL file: %v", err)
	}

	log.Printf("CRL saved to %s", s.crlPath)
	return nil
}

func (s *SIPServer) RevokeCertificate(serialNumber *big.Int, reason string) error {
	s.crl.mu.Lock()
	defer s.crl.mu.Unlock()

	serialStr := serialNumber.String()
	if _, exists := s.crl.RevokedCertificates[serialStr]; exists {
		return fmt.Errorf("certificate already revoked")
	}

	s.crl.RevokedCertificates[serialStr] = &RevokedCert{
		SerialNumber: serialNumber,
		RevokedAt:    time.Now(),
		Reason:       reason,
	}

	log.Printf("Certificate revoked: Serial=%s, Reason=%s", serialStr, reason)

	return s.saveCRL()
}

func (s *SIPServer) IsCertificateRevoked(serialNumber *big.Int) bool {
	s.crl.mu.RLock()
	defer s.crl.mu.RUnlock()

	_, revoked := s.crl.RevokedCertificates[serialNumber.String()]
	return revoked
}

func (s *SIPServer) GetCRLInfo() map[string]interface{} {
	s.crl.mu.RLock()
	defer s.crl.mu.RUnlock()

	revokedList := make([]map[string]interface{}, 0, len(s.crl.RevokedCertificates))

	for serial, rc := range s.crl.RevokedCertificates {
		revokedList = append(revokedList, map[string]interface{}{
			"serialNumber": serial,
			"revokedAt":    rc.RevokedAt.Format(time.RFC3339),
			"reason":      rc.Reason,
		})
	}

	var issuerName pkix.Name
	issuerRDN := s.crl.Issuer
	issuerName.FillFromRDNSequence(&issuerRDN)

	return map[string]interface{}{
		"issuer":       issuerName.CommonName,
		"thisUpdate":   s.crl.ThisUpdate.Format(time.RFC3339),
		"nextUpdate": s.crl.NextUpdate.Format(time.RFC3339),
		"revoked":    revokedList,
		"count":      len(revokedList),
	}
}

func (s *SIPServer) GetCertsDir() string {
	return s.certsDir
}
