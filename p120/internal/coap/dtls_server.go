package coap

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
	"time"

	"github.com/plgd-dev/go-coap/v3/net/blockwise"
	"github.com/plgd-dev/go-coap/v3/net/responsewriter"
	"github.com/plgd-dev/go-coap/v3/options"
	coapDtls "github.com/plgd-dev/go-coap/v3/dtls"
	coapNet "github.com/plgd-dev/go-coap/v3/net"
	"github.com/plgd-dev/go-coap/v3/message/pool"
	"github.com/plgd-dev/go-coap/v3/udp/client"
	piondtls "github.com/pion/dtls/v2"
	"go.uber.org/zap"
)

func (s *Server) StartDTLS(ctx context.Context) error {
	if !s.cfg.Server.CoAP.DTLS.Enabled {
		s.logger.Info("DTLS server is disabled")
		return nil
	}

	addr := fmt.Sprintf("%s:%d", s.cfg.Server.CoAP.DTLS.Host, s.cfg.Server.CoAP.DTLS.Port)
	s.logger.Info("Starting CoAP DTLS server", zap.String("addr", addr))

	dtlsConfig, err := s.createDTLSConfig()
	if err != nil {
		return fmt.Errorf("create DTLS config failed: %w", err)
	}

	listener, err := coapNet.NewDTLSListener("udp", addr, dtlsConfig)
	if err != nil {
		return fmt.Errorf("create DTLS listener failed: %w", err)
	}

	s.dtlsServer = coapDtls.NewServer(
		options.WithOnNewConn(func(conn *client.Conn) {
			s.handleNewDTLSConnection(conn)
		}),
		options.WithHandlerFunc(func(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message) {
			s.handleDTLSRequest(w, req)
		}),
		options.WithBlockwise(true, blockwise.SZX1024, time.Second*30),
	)

	go func() {
		if err := s.dtlsServer.Serve(listener); err != nil {
			s.logger.Error("DTLS server error", zap.Error(err))
		}
	}()

	go func() {
		<-ctx.Done()
		s.logger.Info("Shutting down DTLS server")
		s.dtlsServer.Stop()
	}()

	return nil
}

func (s *Server) createDTLSConfig() (*piondtls.Config, error) {
	cert, err := tls.LoadX509KeyPair(
		s.cfg.Server.CoAP.DTLS.CertFile,
		s.cfg.Server.CoAP.DTLS.KeyFile,
	)
	if err != nil {
		return nil, fmt.Errorf("load certificate failed: %w", err)
	}

	config := &piondtls.Config{
		Certificates: []tls.Certificate{cert},
		ConnectContextMaker: func() (context.Context, func()) {
			return context.WithTimeout(context.Background(), 30*time.Second)
		},
	}

	if s.cfg.Server.CoAP.DTLS.VerifyPeer {
		caCert, err := os.ReadFile(s.cfg.Server.CoAP.DTLS.CAFile)
		if err != nil {
			return nil, fmt.Errorf("read CA certificate failed: %w", err)
		}
		caCertPool := x509.NewCertPool()
		if !caCertPool.AppendCertsFromPEM(caCert) {
			return nil, fmt.Errorf("failed to parse CA certificate")
		}
		config.ClientCAs = caCertPool
		config.ClientAuth = piondtls.RequireAndVerifyClientCert
	}

	return config, nil
}

func (s *Server) handleNewDTLSConnection(conn *client.Conn) {
	remoteAddr := conn.RemoteAddr().String()
	s.logger.Info("New DTLS device connection", zap.String("remote_addr", remoteAddr))
}

func (s *Server) handleDTLSRequest(w *responsewriter.ResponseWriter[*client.Conn], req *pool.Message) {
	path, _ := req.Path()
	s.logger.Debug("DTLS request received",
		zap.String("code", req.Code().String()),
		zap.String("path", path),
	)
}
