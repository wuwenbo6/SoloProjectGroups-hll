package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mqtt-sn-gateway/pkg/api"
	"mqtt-sn-gateway/pkg/gateway"
)

func main() {
	snAddr := flag.String("sn-addr", ":1884", "MQTT-SN UDP listen address")
	mqttBroker := flag.String("mqtt-broker", "tcp://127.0.0.1:1883", "MQTT TCP broker address")
	mqttClientID := flag.String("mqtt-client-id", "mqtt-sn-gateway", "MQTT client ID")
	topicPrefix := flag.String("topic-prefix", "sensor/", "Topic prefix for MQTT publish")
	apiAddr := flag.String("api-addr", ":8080", "REST API listen address")
	dataDir := flag.String("data-dir", "data/queues", "Directory for persistent message queue storage")
	maxQueueSize := flag.Int("max-queue", 100, "Maximum queued messages per device")
	topicTTL := flag.Duration("topic-ttl", 1*time.Hour, "Topic mapping TTL (0 to disable)")
	topicTTLInterval := flag.Duration("topic-ttl-interval", 5*time.Minute, "Interval for topic TTL check")
	gwID := flag.Int("gw-id", 1, "Gateway ID (1-255)")
	advertisePeriod := flag.Duration("advertise-period", 15*time.Second, "Period for sending ADVERTISE (0 to disable)")
	advertiseDuration := flag.Int("advertise-duration", 30, "Duration value in ADVERTISE message (seconds)")
	flag.Parse()

	cfg := &gateway.Config{
		MQTTSNListenAddr:  *snAddr,
		MQTTBrokerAddr:    *mqttBroker,
		MQTTClientID:      *mqttClientID,
		TopicPrefix:       *topicPrefix,
		DataDir:           *dataDir,
		MaxQueueSize:      *maxQueueSize,
		TopicTTL:          *topicTTL,
		TopicTTLInterval:  *topicTTLInterval,
		GwID:              byte(*gwID),
		AdvertisePeriod:   *advertisePeriod,
		AdvertiseDuration: uint16(*advertiseDuration),
	}

	gw := gateway.NewGateway(cfg)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		apiServer := api.NewServer(*apiAddr, gw)
		log.Printf("REST API server starting on %s", *apiAddr)
		if err := apiServer.Run(); err != nil {
			log.Printf("API server error: %v", err)
		}
	}()

	go func() {
		<-sigCh
		log.Println("Shutting down gateway...")
		gw.Stop()
		os.Exit(0)
	}()

	log.Println("Starting MQTT-SN Gateway...")
	if err := gw.Start(); err != nil {
		log.Fatalf("Gateway failed: %v", err)
	}
}
