package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"mini-rgw/accesslog"
	"mini-rgw/auth"
	"mini-rgw/handler"
	"mini-rgw/model"
	"mini-rgw/store"
)

func main() {
	port := flag.Int("port", 9000, "HTTP listen port")
	dataDir := flag.String("data", "./data", "data storage directory")
	flag.Parse()

	s, err := store.New(*dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}

	al, err := accesslog.NewLogger(*dataDir + "/logs")
	if err != nil {
		log.Fatalf("Failed to initialize access logger: %v", err)
	}
	defer al.Close()

	signer := auth.NewSigner(s)
	s3Handler := handler.NewS3Handler(s, signer, al)

	if err := seedDefaultTenant(s); err != nil {
		log.Printf("Warning: failed to seed default tenant: %v", err)
	}

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Mini RGW starting on %s", addr)
	log.Printf("Web UI:      http://localhost%s/", addr)
	log.Printf("S3 Endpoint: http://localhost%s", addr)
	log.Printf("Data dir:    %s", *dataDir)
	if err := http.ListenAndServe(addr, s3Handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func seedDefaultTenant(s *store.Store) error {
	_, ok := s.GetCredential("AKIAIOSFODNN7EXAMPLE")
	if ok {
		return nil
	}
	return s.RegisterCredential(&model.Credential{
		AccessKeyID:     "AKIAIOSFODNN7EXAMPLE",
		SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
		TenantID:        "default",
	})
}
