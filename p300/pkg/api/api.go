package api

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

	"sip-tls-server/pkg/certgen"
	"sip-tls-server/pkg/sipserver"
)

type Server struct {
	sipServer *sipserver.SIPServer
	certsDir  string
	caCert    *certgen.Certificate
}

type CertRequest struct {
	Username string `json:"username"`
	Domain   string `json:"domain"`
}

type CertResponse struct {
	Success bool   `json:"success"`
	CertPEM string `json:"certPEM"`
	KeyPEM  string `json:"keyPEM"`
	CAPEM   string `json:"caPEM"`
	Domain  string `json:"domain"`
	Message string `json:"message"`
}

type RevokeRequest struct {
	Username string `json:"username"`
	Reason   string `json:"reason"`
}

type RevokeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

func NewAPIServer(sipServer *sipserver.SIPServer, certsDir string, caCert *certgen.Certificate) *Server {
	return &Server{
		sipServer: sipServer,
		certsDir:  certsDir,
		caCert:    caCert,
	}
}

func (s *Server) Start(address string) error {
	http.HandleFunc("/api/generate-cert", s.generateCertHandler)
	http.HandleFunc("/api/registrations", s.registrationsHandler)
	http.HandleFunc("/api/crl", s.crlHandler)
	http.HandleFunc("/api/revoke-cert", s.revokeCertHandler)
	http.Handle("/", http.FileServer(http.Dir("frontend")))

	return http.ListenAndServe(address, nil)
}

func (s *Server) crlHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	crlInfo := s.sipServer.GetCRLInfo()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(crlInfo)
}

func (s *Server) revokeCertHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RevokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	certPath := filepath.Join(s.certsDir, "clients", req.Username, "client.crt")
	certPEM, err := os.ReadFile(certPath)
	if err != nil {
		http.Error(w, "Certificate not found for user: "+req.Username, http.StatusNotFound)
		return
	}

	block, _ := pem.Decode(certPEM)
	if block == nil {
		http.Error(w, "Failed to decode certificate", http.StatusInternalServerError)
		return
	}

	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		http.Error(w, "Failed to parse certificate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	reason := req.Reason
	if reason == "" {
		reason = "unspecified"
	}

	if err := s.sipServer.RevokeCertificate(cert.SerialNumber, reason); err != nil {
		http.Error(w, "Failed to revoke certificate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	response := RevokeResponse{
		Success: true,
		Message: fmt.Sprintf("Certificate revoked for user %s (Serial: %s, SHA256: %s)", 
			req.Username, cert.SerialNumber.String(), sipserver.CalculateSHA256Fingerprint(cert)),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) generateCertHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "Username is required", http.StatusBadRequest)
		return
	}

	domain := req.Domain
	if domain == "" {
		domain = "localhost"
	}

	clientCert, err := certgen.GenerateClientCert(s.caCert, req.Username, domain)
	if err != nil {
		http.Error(w, "Failed to generate certificate: "+err.Error(), http.StatusInternalServerError)
		return
	}

	userCertDir := filepath.Join(s.certsDir, "clients", req.Username)
	os.MkdirAll(userCertDir, 0755)

	os.WriteFile(filepath.Join(userCertDir, "client.crt"), clientCert.CertPEM, 0644)
	os.WriteFile(filepath.Join(userCertDir, "client.key"), clientCert.KeyPEM, 0600)

	response := CertResponse{
		Success: true,
		CertPEM: string(clientCert.CertPEM),
		KeyPEM:  string(clientCert.KeyPEM),
		CAPEM:   string(s.caCert.CertPEM),
		Domain:  domain,
		Message: "Certificate generated successfully",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) registrationsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	regs := s.sipServer.GetRegistrations()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(regs)
}

func LoadTLSCertificate(certFile, keyFile string) (tls.Certificate, error) {
	return tls.LoadX509KeyPair(certFile, keyFile)
}
