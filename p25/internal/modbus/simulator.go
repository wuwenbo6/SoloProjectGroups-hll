package modbus

import (
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/rand"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"pv-monitor/internal/config"
	"pv-monitor/internal/models"
)

type Simulator struct {
	inverters []config.InverterConfig
	mqttClient mqtt.Client
	interval time.Duration
	enabled  bool
}

func NewSimulator(cfg *config.Config, mqttBroker string) (*Simulator, error) {
	opts := mqtt.NewClientOptions()
	opts.AddBroker(mqttBroker)
	opts.SetClientID("modbus-simulator")
	opts.SetAutoReconnect(true)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		return nil, fmt.Errorf("failed to connect to MQTT: %w", token.Error())
	}

	return &Simulator{
		inverters: cfg.Inverters,
		mqttClient: client,
		interval:   time.Duration(cfg.Modbus.SimulationInterval) * time.Second,
		enabled:    cfg.Modbus.Enabled,
	}, nil
}

func (s *Simulator) Start() {
	if !s.enabled {
		log.Println("Modbus simulator disabled")
		return
	}

	log.Printf("Starting Modbus simulator with %d inverters", len(s.inverters))

	ticker := time.NewTicker(s.interval)
	go func() {
		for range ticker.C {
			s.simulateAndPublish()
		}
	}()
}

func (s *Simulator) simulateAndPublish() {
	for _, inv := range s.inverters {
		data := s.simulateInverter(inv)

		topic := fmt.Sprintf("pv/inverter/%s/data", inv.ID)
		payload, _ := json.Marshal(data)

		token := s.mqttClient.Publish(topic, 1, false, payload)
		if token.Wait() && token.Error() != nil {
			log.Printf("Failed to publish data for %s: %v", inv.ID, token.Error())
		}
	}
}

func (s *Simulator) simulateInverter(inv config.InverterConfig) *models.InverterData {
	now := time.Now()
	hour := float64(now.Hour()) + float64(now.Minute())/60.0

	dayFactor := 0.0
	if hour >= 6 && hour <= 18 {
		peakHour := 12.0
		spread := 5.0
		dayFactor = math.Exp(-math.Pow(hour-peakHour, 2)/(2*spread*spread))
	}

	noise := (rand.Float64() - 0.5) * 0.1
	efficiency := 0.95 + noise
	powerFactor := dayFactor * (0.8 + rand.Float64()*0.2)

	voltage := 600 + rand.Float64()*50
	current := (inv.RatedPower * powerFactor) / voltage
	power := voltage * current * efficiency
	energy := power / 1000
	temperature := 35 + rand.Float64()*15 + (dayFactor * 20)

	return &models.InverterData{
		InverterID: inv.ID,
		Timestamp:  now,
		Voltage:    voltage,
		Current:    current,
		Power:      power,
		Energy:     energy,
		Temperature: temperature,
		Efficiency:  efficiency * 100,
	}
}

func (s *Simulator) SimulatePowerDrop(inverterID string, dropPercent float64) {
	log.Printf("Simulating power drop of %.1f%% on %s", dropPercent, inverterID)
}

func (s *Simulator) Stop() {
	if s.mqttClient.IsConnected() {
		s.mqttClient.Disconnect(250)
	}
}
