package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type SensorData struct {
	DeviceID string  `json:"device_id"`
	Type     string  `json:"type"`
	Value    float64 `json:"value"`
	Unit     string  `json:"unit"`
	Timestamp int64  `json:"timestamp"`
	Seq       uint64 `json:"seq"`
}

func main() {
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://localhost:1883")
	opts.SetClientID("mock-sensor")

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		panic(token.Error())
	}
	defer client.Disconnect(250)

	fmt.Println("Mock sensor started. Publishing data...")

	sensors := []SensorData{
		{DeviceID: "sensor_kitchen", Type: "temperature", Value: 25.0, Unit: "°C"},
		{DeviceID: "sensor_kitchen", Type: "humidity", Value: 55.0, Unit: "%"},
		{DeviceID: "sensor_living", Type: "temperature", Value: 24.0, Unit: "°C"},
		{DeviceID: "sensor_bedroom", Type: "temperature", Value: 23.0, Unit: "°C"},
	}

	devices := []string{"fan_living", "light_kitchen", "light_bedroom", "thermostat_living"}
	for _, deviceID := range devices {
		data := map[string]interface{}{
			"device_id": deviceID,
			"type":      getDeviceType(deviceID),
			"value":     0,
			"unit":      "",
		}
		payload, _ := json.Marshal(data)
		client.Publish("zigbee/sensor/"+deviceID, 0, false, payload)
		time.Sleep(100 * time.Millisecond)
	}

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	var seq uint64 = 0
	for range ticker.C {
		seq++
		now := time.Now().UnixNano()
		
		for i := range sensors {
			sensors[i].Value += (rand.Float64() - 0.5) * 2
			if sensors[i].Type == "temperature" {
				sensors[i].Value = clamp(sensors[i].Value, 15, 35)
			} else {
				sensors[i].Value = clamp(sensors[i].Value, 30, 80)
			}

			sensors[i].Timestamp = now
			sensors[i].Seq = seq

			payload, _ := json.Marshal(sensors[i])
			topic := fmt.Sprintf("zigbee/sensor/%s", sensors[i].DeviceID)
			client.Publish(topic, 1, false, payload)
			fmt.Printf("Published: %s = %.2f%s (seq=%d)\n", sensors[i].DeviceID, sensors[i].Value, sensors[i].Unit, seq)
		}
	}
}

func getDeviceType(id string) string {
	switch id {
	case "fan_living":
		return "fan"
	case "thermostat_living":
		return "thermostat"
	default:
		return "light"
	}
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
