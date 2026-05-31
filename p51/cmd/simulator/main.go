package main

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

type SensorPayload struct {
	DeviceEUI   string    `json:"dev_eui"`
	Timestamp   time.Time `json:"timestamp"`
	SensorType  string    `json:"sensor_type"`
	InclineX    *float64  `json:"incline_x,omitempty"`
	InclineY    *float64  `json:"incline_y,omitempty"`
	VibrationX  *float64  `json:"vibration_x,omitempty"`
	VibrationY  *float64  `json:"vibration_y,omitempty"`
	VibrationZ  *float64  `json:"vibration_z,omitempty"`
	Rainfall    *float64  `json:"rainfall,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	Humidity    *float64  `json:"humidity,omitempty"`
	Battery     *float64  `json:"battery,omitempty"`
	Latitude    *float64  `json:"latitude,omitempty"`
	Longitude   *float64  `json:"longitude,omitempty"`
}

func main() {
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://localhost:1883")
	opts.SetClientID("test_sensor_simulator")

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		panic(token.Error())
	}
	defer client.Disconnect(250)

	fmt.Println("Test sensor simulator started. Press Ctrl+C to stop.")

	devices := []struct {
		devEUI    string
		lat       float64
		lng       float64
		sensor    string
	}{
		{"A81758FFFE060001", 39.9042, 116.4074, "inclinometer"},
		{"A81758FFFE060002", 31.2304, 121.4737, "vibration"},
		{"A81758FFFE060003", 22.5431, 114.0579, "rainfall"},
		{"A81758FFFE060004", 30.5728, 104.0668, "inclinometer"},
	}

	ticker := time.NewTicker(5 * time.Second)
	count := 0

	for range ticker.C {
		for _, d := range devices {
			payload := SensorPayload{
				DeviceEUI:  d.devEUI,
				Timestamp:  time.Now(),
				SensorType: d.sensor,
				Latitude:   &d.lat,
				Longitude:  &d.lng,
			}

			bat := 90.0 + rand.Float64()*10
			payload.Battery = &bat

			switch d.sensor {
			case "inclinometer":
				x := rand.Float64() * 2
				y := rand.Float64() * 2
				if count%10 == 0 {
					x += 1.0
					y += 0.8
				}
				payload.InclineX = &x
				payload.InclineY = &y
				temp := 20.0 + rand.Float64()*10
				payload.Temperature = &temp

			case "vibration":
				vx := rand.Float64() * 30
				vy := rand.Float64() * 25
				vz := rand.Float64() * 20
				if count%7 == 0 {
					vx = 60.0 + rand.Float64()*20
				}
				payload.VibrationX = &vx
				payload.VibrationY = &vy
				payload.VibrationZ = &vz

			case "rainfall":
				rain := rand.Float64() * 30
				if count%12 == 0 {
					rain = 60.0
				}
				payload.Rainfall = &rain
				hum := 60.0 + rand.Float64()*30
				payload.Humidity = &hum
			}

			data, _ := json.Marshal(payload)
			topic := fmt.Sprintf("lora/gateway/%s/sensor/%s", d.devEUI, d.sensor)
			token := client.Publish(topic, 1, false, data)
			token.Wait()
			fmt.Printf("Published to %s: %s\n", topic, string(data))
		}
		count++
	}
}
