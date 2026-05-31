package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type Device struct {
	ID              uint       `gorm:"primaryKey" json:"id"`
	DeviceEUI       string     `gorm:"uniqueIndex;size:64" json:"device_eui"`
	Name            string     `gorm:"size:128" json:"name"`
	Latitude        float64    `json:"latitude"`
	Longitude       float64    `json:"longitude"`
	Depth           float64    `json:"depth"`
	GeologyType     string     `gorm:"size:64" json:"geology_type"`
	Status          string     `gorm:"size:32;default:offline" json:"status"`
	LastSeen        *time.Time `json:"last_seen"`
	SensorTypes     string     `gorm:"size:128" json:"sensor_types"`
	InclineOffsetX  float64    `json:"incline_offset_x"`
	InclineOffsetY  float64    `json:"incline_offset_y"`
	LastCalibration *time.Time `json:"last_calibration"`
	CreatedAt       time.Time  `json:"created_at"`
}

type SensorData struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	DeviceID     uint      `gorm:"index" json:"device_id"`
	DeviceEUI    string    `gorm:"index;size:64" json:"device_eui"`
	SensorType   string    `gorm:"size:32;index" json:"sensor_type"`
	Timestamp    time.Time `gorm:"index" json:"timestamp"`
	RawInclineX  *float64  `json:"raw_incline_x,omitempty"`
	RawInclineY  *float64  `json:"raw_incline_y,omitempty"`
	InclineX     *float64  `json:"incline_x,omitempty"`
	InclineY     *float64  `json:"incline_y,omitempty"`
	VibrationMax *float64  `json:"vibration_max,omitempty"`
	Rainfall     *float64  `json:"rainfall,omitempty"`
	Rain1h       *float64  `json:"rain_1h,omitempty"`
	Rain24h      *float64  `json:"rain_24h,omitempty"`
	Temperature  *float64  `json:"temperature,omitempty"`
	Battery      *float64  `json:"battery,omitempty"`
	IsCalibrated bool      `json:"is_calibrated"`
}

type Alert struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	DeviceID     uint      `gorm:"index" json:"device_id"`
	DeviceEUI    string    `gorm:"index;size:64" json:"device_eui"`
	AlertType    string    `gorm:"size:32" json:"alert_type"`
	Severity     string    `gorm:"size:32" json:"severity"`
	Message      string    `gorm:"type:text" json:"message"`
	Value        float64   `json:"value"`
	Threshold    float64   `json:"threshold"`
	Timestamp    time.Time `json:"timestamp"`
	Acknowledged bool      `gorm:"default:false" json:"acknowledged"`
}

type Prediction struct {
	DeviceID    uint      `json:"device_id"`
	Metric      string    `json:"metric"`
	Timestamp   time.Time `json:"timestamp"`
	Predicted   float64   `json:"predicted"`
	UpperBound  float64   `json:"upper_bound"`
	LowerBound  float64   `json:"lower_bound"`
	Confidence  float64   `json:"confidence"`
}

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
	Battery     *float64  `json:"battery,omitempty"`
	Latitude    *float64  `json:"latitude,omitempty"`
	Longitude   *float64  `json:"longitude,omitempty"`
}

type RainWindow struct {
	Data []RainRecord
	mu   sync.RWMutex
}

type RainRecord struct {
	Timestamp time.Time
	Value     float64
}

func NewRainWindow() *RainWindow {
	return &RainWindow{Data: make([]RainRecord, 0)}
}

func (rw *RainWindow) Add(t time.Time, v float64) {
	rw.mu.Lock()
	defer rw.mu.Unlock()
	rw.Data = append(rw.Data, RainRecord{t, v})
	rw.cleanup()
}

func (rw *RainWindow) cleanup() {
	cutoff := time.Now().Add(-25 * time.Hour)
	filtered := make([]RainRecord, 0)
	for _, r := range rw.Data {
		if r.Timestamp.After(cutoff) {
			filtered = append(filtered, r)
		}
	}
	rw.Data = filtered
}

func (rw *RainWindow) Sum1h() float64 {
	rw.mu.RLock()
	defer rw.mu.RUnlock()
	cutoff := time.Now().Add(-1 * time.Hour)
	sum := 0.0
	for _, r := range rw.Data {
		if r.Timestamp.After(cutoff) {
			sum += r.Value
		}
	}
	return sum
}

func (rw *RainWindow) Sum24h() float64 {
	rw.mu.RLock()
	defer rw.mu.RUnlock()
	cutoff := time.Now().Add(-24 * time.Hour)
	sum := 0.0
	for _, r := range rw.Data {
		if r.Timestamp.After(cutoff) {
			sum += r.Value
		}
	}
	return sum
}

type TimeSeriesPredictor struct {
	history map[uint]map[string][]float64
	mu      sync.RWMutex
	window  int
}

func NewTimeSeriesPredictor(window int) *TimeSeriesPredictor {
	return &TimeSeriesPredictor{
		history: make(map[uint]map[string][]float64),
		window:  window,
	}
}

func (p *TimeSeriesPredictor) Add(deviceID uint, metric string, value float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if _, ok := p.history[deviceID]; !ok {
		p.history[deviceID] = make(map[string][]float64)
	}
	p.history[deviceID][metric] = append(p.history[deviceID][metric], value)
	if len(p.history[deviceID][metric]) > p.window {
		p.history[deviceID][metric] = p.history[deviceID][metric][1:]
	}
}

func (p *TimeSeriesPredictor) PredictARIMA(deviceID uint, metric string, steps int) []Prediction {
	p.mu.RLock()
	defer p.mu.RUnlock()

	data, ok := p.history[deviceID][metric]
	if !ok || len(data) < 5 {
		return nil
	}

	n := len(data)
	predictions := make([]Prediction, steps)

	mean := 0.0
	for _, v := range data {
		mean += v
	}
	mean /= float64(n)

	variance := 0.0
	for _, v := range data {
		variance += (v - mean) * (v - mean)
	}
	variance /= float64(n)
	std := math.Sqrt(variance)

	var sumLag float64
	var sumLag2 float64
	for i := 1; i < n; i++ {
		sumLag += (data[i] - mean) * (data[i-1] - mean)
	}
	phi := sumLag / (variance * float64(n-1))
	phi = math.Max(-0.95, math.Min(0.95, phi))

	lastVal := data[n-1]
	baseTime := time.Now()

	for i := 0; i < steps; i++ {
		predicted := mean + phi*(lastVal-mean)
		confidence := math.Max(0.5, 1.0-float64(i)*0.05)
		margin := std * 1.96 * (1.0 + float64(i)*0.1)

		predictions[i] = Prediction{
			DeviceID:   deviceID,
			Metric:     metric,
			Timestamp:  baseTime.Add(time.Duration(i+1) * 5 * time.Minute),
			Predicted:  predicted,
			UpperBound: predicted + margin,
			LowerBound: math.Max(0, predicted-margin),
			Confidence: confidence,
		}
		lastVal = predicted
	}

	return predictions
}

type AlertEngine struct {
	db              *gorm.DB
	predictor       *TimeSeriesPredictor
	lastIncline     map[uint]struct{ x, y float64 }
	lastAlertTime   map[string]time.Time
	rainWindows     map[uint]*RainWindow
	calibrationQ    map[uint][]struct{ x, y float64 }
	mu              sync.RWMutex
	vibThreshold    float64
	incThreshold    float64
	rain1hThreshold float64
	rain24hThreshold float64
	cooldown        time.Duration
	calibInterval   time.Duration
	calibSampleSize int
}

func NewAlertEngine(db *gorm.DB) *AlertEngine {
	return &AlertEngine{
		db:               db,
		predictor:        NewTimeSeriesPredictor(50),
		lastIncline:      make(map[uint]struct{ x, y float64 }),
		lastAlertTime:    make(map[string]time.Time),
		rainWindows:      make(map[uint]*RainWindow),
		calibrationQ:     make(map[uint][]struct{ x, y float64 }),
		vibThreshold:     50.0,
		incThreshold:     0.5,
		rain1hThreshold:  20.0,
		rain24hThreshold: 50.0,
		cooldown:         5 * time.Minute,
		calibInterval:    24 * time.Hour,
		calibSampleSize:  10,
	}
}

func (e *AlertEngine) Process(device *Device, data *SensorData) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if data.InclineX != nil && data.InclineY != nil {
		e.predictor.Add(device.ID, "incline_x", *data.InclineX)
		e.predictor.Add(device.ID, "incline_y", *data.InclineY)
		e.checkIncline(device, data)
		e.collectCalibrationData(device, data)
	}

	if data.VibrationMax != nil {
		e.predictor.Add(device.ID, "vibration", *data.VibrationMax)
		e.checkVibration(device, data)
	}

	if data.Rainfall != nil {
		e.predictor.Add(device.ID, "rainfall", *data.Rainfall)
		e.checkRainfall(device, data)
	}
}

func (e *AlertEngine) checkIncline(device *Device, data *SensorData) {
	last, exists := e.lastIncline[device.ID]
	if !exists {
		e.lastIncline[device.ID] = struct{ x, y float64 }{*data.InclineX, *data.InclineY}
		return
	}
	dx := math.Abs(*data.InclineX - last.x)
	dy := math.Abs(*data.InclineY - last.y)
	delta := math.Sqrt(dx*dx + dy*dy)
	e.lastIncline[device.ID] = struct{ x, y float64 }{*data.InclineX, *data.InclineY}
	if delta >= e.incThreshold {
		key := "incline_" + device.DeviceEUI
		if e.shouldAlert(key) {
			e.createAlert(device, data, "incline", delta, e.incThreshold,
				fmt.Sprintf("倾角异常: 变化量 %.2f° 超过阈值 %.2f°", delta, e.incThreshold))
		}
	}
}

func (e *AlertEngine) collectCalibrationData(device *Device, data *SensorData) {
	if _, ok := e.calibrationQ[device.ID]; !ok {
		e.calibrationQ[device.ID] = make([]struct{ x, y float64 }, 0, e.calibSampleSize)
	}
	needCalib := device.LastCalibration == nil || time.Since(*device.LastCalibration) >= e.calibInterval
	if needCalib && data.IsCalibrated {
		e.calibrationQ[device.ID] = append(e.calibrationQ[device.ID],
			struct{ x, y float64 }{*data.RawInclineX, *data.RawInclineY})
		if len(e.calibrationQ[device.ID]) >= e.calibSampleSize {
			e.performCalibration(device)
			e.calibrationQ[device.ID] = e.calibrationQ[device.ID][:0]
		}
	}
}

func (e *AlertEngine) performCalibration(device *Device) {
	samples := e.calibrationQ[device.ID]
	if len(samples) == 0 {
		return
	}
	var sumX, sumY float64
	for _, s := range samples {
		sumX += s.x
		sumY += s.y
	}
	avgX := sumX / float64(len(samples))
	avgY := sumY / float64(len(samples))
	device.InclineOffsetX = -avgX
	device.InclineOffsetY = -avgY
	now := time.Now()
	device.LastCalibration = &now
	if err := e.db.Save(device).Error; err != nil {
		log.Printf("Calibration save failed: %v", err)
		return
	}
	log.Printf("设备 %s 倾角校准完成", device.Name)
}

func (e *AlertEngine) ManualCalibration(deviceID uint) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	var device Device
	if err := e.db.First(&device, deviceID).Error; err != nil {
		return err
	}
	if _, ok := e.calibrationQ[deviceID]; ok && len(e.calibrationQ[deviceID]) >= 3 {
		e.performCalibration(&device)
		return nil
	}
	return fmt.Errorf("not enough calibration data")
}

func (e *AlertEngine) checkVibration(device *Device, data *SensorData) {
	if *data.VibrationMax >= e.vibThreshold {
		key := "vibration_" + device.DeviceEUI
		if e.shouldAlert(key) {
			e.createAlert(device, data, "vibration", *data.VibrationMax, e.vibThreshold,
				fmt.Sprintf("振动异常: 最大值 %.2f 超过阈值 %.2f", *data.VibrationMax, e.vibThreshold))
		}
	}
}

func (e *AlertEngine) checkRainfall(device *Device, data *SensorData) {
	if _, ok := e.rainWindows[device.ID]; !ok {
		e.rainWindows[device.ID] = NewRainWindow()
	}
	e.rainWindows[device.ID].Add(data.Timestamp, *data.Rainfall)
	rain1h := e.rainWindows[device.ID].Sum1h()
	rain24h := e.rainWindows[device.ID].Sum24h()
	data.Rain1h = &rain1h
	data.Rain24h = &rain24h

	if rain1h >= e.rain1hThreshold {
		key := "rain1h_" + device.DeviceEUI
		if e.shouldAlert(key) {
			sev := "warning"
			if rain1h >= e.rain1hThreshold*2 {
				sev = "critical"
			}
			e.createAlertWithSeverity(device, data, "rainstorm", rain1h, e.rain1hThreshold, sev,
				fmt.Sprintf("短时暴雨预警: 1小时降雨量 %.1fmm", rain1h))
		}
	}
	if rain24h >= e.rain24hThreshold {
		key := "rain24h_" + device.DeviceEUI
		if e.shouldAlert(key) {
			sev := "warning"
			if rain24h >= e.rain24hThreshold*1.5 {
				sev = "critical"
			}
			e.createAlertWithSeverity(device, data, "rain_accumulated", rain24h, e.rain24hThreshold, sev,
				fmt.Sprintf("累积雨量预警: 24小时降雨量 %.1fmm", rain24h))
		}
	}
}

func (e *AlertEngine) shouldAlert(key string) bool {
	t, ok := e.lastAlertTime[key]
	if !ok || time.Since(t) >= e.cooldown {
		e.lastAlertTime[key] = time.Now()
		return true
	}
	return false
}

func (e *AlertEngine) createAlert(device *Device, data *SensorData, typ string, val, thresh float64, msg string) {
	sev := "warning"
	if val >= thresh*2 {
		sev = "critical"
	}
	e.createAlertWithSeverity(device, data, typ, val, thresh, sev, msg)
}

func (e *AlertEngine) createAlertWithSeverity(device *Device, data *SensorData, typ string, val, thresh float64, sev, msg string) {
	alert := &Alert{
		DeviceID:  device.ID, DeviceEUI: device.DeviceEUI, AlertType: typ,
		Severity: sev, Message: msg, Value: val, Threshold: thresh, Timestamp: data.Timestamp,
	}
	e.db.Create(alert)
	log.Printf("ALERT [%s] %s: %s", sev, device.Name, msg)
}

func (e *AlertEngine) GetPredictions(deviceID uint, metric string) []Prediction {
	return e.predictor.PredictARIMA(deviceID, metric, 6)
}

var (
	db     *gorm.DB
	engine *AlertEngine
)

type GeologyLayer struct {
	Depth     float64 `json:"depth"`
	Thickness float64 `json:"thickness"`
	Type      string  `json:"type"`
	Color     string  `json:"color"`
	Hardness  int     `json:"hardness"`
}

var geologyTypes = map[string][]GeologyLayer{
	"rocky":    {{0, 5, "表土层", "#8B7355", 2}, {5, 15, "风化岩", "#A0522D", 5}, {15, 30, "基岩", "#696969", 9}},
	"soil":     {{0, 3, "耕植土", "#8B4513", 1}, {3, 10, "粉质粘土", "#D2691E", 2}, {10, 25, "砂层", "#F4A460", 3}},
	"karst":    {{0, 4, "覆盖层", "#8B7355", 2}, {4, 12, "灰岩", "#708090", 7}, {12, 30, "溶洞/裂隙", "#4682B4", 3}},
	"default":  {{0, 5, "表层土", "#CD853F", 2}, {5, 20, "岩层", "#696969", 8}},
}

func handleMQTTMessage(client mqtt.Client, msg mqtt.Message) {
	var payload SensorPayload
	if err := json.Unmarshal(msg.Payload(), &payload); err != nil {
		log.Printf("Parse error: %v", err)
		return
	}
	if payload.Timestamp.IsZero() {
		payload.Timestamp = time.Now()
	}

	var device Device
	result := db.Where("device_eui = ?", payload.DeviceEUI).First(&device)

	if result.Error == gorm.ErrRecordNotFound {
		device = Device{
			DeviceEUI:   payload.DeviceEUI,
			Name:        "Sensor-" + payload.DeviceEUI[len(payload.DeviceEUI)-4:],
			Status:      "online",
			SensorTypes: payload.SensorType,
			LastSeen:    &payload.Timestamp,
			GeologyType: "default",
			Depth:       10,
		}
		if payload.Latitude != nil {
			device.Latitude = *payload.Latitude
		}
		if payload.Longitude != nil {
			device.Longitude = *payload.Longitude
		}
		db.Create(&device)
	} else {
		device.Status = "online"
		device.LastSeen = &payload.Timestamp
		if payload.Latitude != nil {
			device.Latitude = *payload.Latitude
		}
		if payload.Longitude != nil {
			device.Longitude = *payload.Longitude
		}
		if !strings.Contains(device.SensorTypes, payload.SensorType) {
			device.SensorTypes += "," + payload.SensorType
		}
		db.Save(&device)
	}

	var vibMax *float64
	if payload.VibrationX != nil && payload.VibrationY != nil && payload.VibrationZ != nil {
		m := math.Max(*payload.VibrationX, math.Max(*payload.VibrationY, *payload.VibrationZ))
		vibMax = &m
	}

	adjX := payload.InclineX
	adjY := payload.InclineY
	isCalib := false
	if payload.InclineX != nil && payload.InclineY != nil {
		x := *payload.InclineX + device.InclineOffsetX
		y := *payload.InclineY + device.InclineOffsetY
		adjX = &x
		adjY = &y
		isCalib = true
	}

	data := &SensorData{
		DeviceID: device.ID, DeviceEUI: payload.DeviceEUI, SensorType: payload.SensorType,
		Timestamp: payload.Timestamp, RawInclineX: payload.InclineX, RawInclineY: payload.InclineY,
		InclineX: adjX, InclineY: adjY, VibrationMax: vibMax, Rainfall: payload.Rainfall,
		Temperature: payload.Temperature, Battery: payload.Battery, IsCalibrated: isCalib,
	}

	engine.Process(&device, data)
	db.Create(data)
}

func simulateHandler(w http.ResponseWriter, r *http.Request) {
	devs := []struct {
		eui     string
		lat     float64
		lng     float64
		depth   float64
		geology string
	}{
		{"SIM001", 39.9042, 116.4074, 15, "rocky"},
		{"SIM002", 31.2304, 121.4737, 8, "soil"},
		{"SIM003", 22.5431, 114.0579, 20, "karst"},
	}
	for _, d := range devs {
		x := randF(-0.5, 1.5)
		y := randF(-0.3, 1.2)
		vx := randF(20, 70)
		vy := randF(15, 50)
		vz := randF(10, 40)
		rain := randF(2, 8)
		temp := randF(20, 30)
		bat := randF(80, 100)

		var dev Device
		db.Where("device_eui = ?", d.eui).First(&dev)
		if dev.ID == 0 {
			dev = Device{DeviceEUI: d.eui, Name: "Sensor-" + d.eui, Latitude: d.lat, Longitude: d.lng,
				Status: "online", SensorTypes: "multi", GeologyType: d.geology, Depth: d.depth}
			db.Create(&dev)
		}

		payload := SensorPayload{
			DeviceEUI: d.eui, Timestamp: time.Now(), SensorType: "multi",
			InclineX: &x, InclineY: &y, VibrationX: &vx, VibrationY: &vy, VibrationZ: &vz,
			Rainfall: &rain, Temperature: &temp, Battery: &bat, Latitude: &d.lat, Longitude: &d.lng,
		}
		data, _ := json.Marshal(payload)
		handleMQTTMessage(nil, &fakeMsg{payload: data})
	}
	fmt.Fprint(w, "Simulated data sent")
}

func calibrateHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/devices/")
	idStr = strings.TrimSuffix(idStr, "/calibrate")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)
	if err := engine.ManualCalibration(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	fmt.Fprint(w, "Calibration performed")
}

func exportAlertsHandler(w http.ResponseWriter, r *http.Request) {
	var alerts []Alert
	query := db.Order("timestamp desc")
	if start := r.URL.Query().Get("start"); start != "" {
		query = query.Where("timestamp >= ?", start)
	}
	if end := r.URL.Query().Get("end"); end != "" {
		query = query.Where("timestamp <= ?", end)
	}
	if sev := r.URL.Query().Get("severity"); sev != "" {
		query = query.Where("severity = ?", sev)
	}
	query.Find(&alerts)

	format := r.URL.Query().Get("format")
	if format == "json" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(alerts)
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=alerts.csv")
	writer := csv.NewWriter(w)
	defer writer.Flush()
	writer.Write([]string{"ID", "设备", "类型", "级别", "消息", "数值", "阈值", "时间", "已确认"})
	for _, a := range alerts {
		writer.Write([]string{
			strconv.Itoa(int(a.ID)), a.DeviceEUI, a.AlertType, a.Severity, a.Message,
			fmt.Sprintf("%.2f", a.Value), fmt.Sprintf("%.2f", a.Threshold),
			a.Timestamp.Format(time.RFC3339), strconv.FormatBool(a.Acknowledged),
		})
	}
}

func predictionHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/predict/")
	metric := r.URL.Query().Get("metric")
	if metric == "" {
		metric = "incline_x"
	}
	var id uint
	fmt.Sscanf(idStr, "%d", &id)
	preds := engine.GetPredictions(id, metric)
	json.NewEncoder(w).Encode(preds)
}

func geologyHandler(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/geology/")
	var id uint
	fmt.Sscanf(idStr, "%d", &id)
	var device Device
	if err := db.First(&device, id).Error; err != nil {
		http.Error(w, "Device not found", 404)
		return
	}
	layers, ok := geologyTypes[device.GeologyType]
	if !ok {
		layers = geologyTypes["default"]
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"device_id": device.ID, "device_name": device.Name,
		"depth": device.Depth, "geology_type": device.GeologyType, "layers": layers,
	})
}

func randF(min, max float64) *float64 {
	v := min + (max-min)*float64(time.Now().UnixNano()%10000)/10000
	return &v
}

type fakeMsg struct{ payload []byte }
func (f *fakeMsg) Duplicate() bool   { return false }
func (f *fakeMsg) Qos() byte         { return 1 }
func (f *fakeMsg) Retained() bool    { return false }
func (f *fakeMsg) Topic() string     { return "test" }
func (f *fakeMsg) MessageID() uint16 { return 1 }
func (f *fakeMsg) Payload() []byte   { return f.payload }
func (f *fakeMsg) Ack()             {}

func main() {
	var err error
	db, err = gorm.Open(sqlite.Open("iot.db"), &gorm.Config{})
	if err != nil {
		log.Fatal(err)
	}
	db.AutoMigrate(&Device{}, &SensorData{}, &Alert{})
	engine = NewAlertEngine(db)

	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://broker.emqx.io:1883")
	opts.SetClientID("iot_backend_" + fmt.Sprint(time.Now().Unix()))
	opts.SetDefaultPublishHandler(handleMQTTMessage)
	opts.SetOnConnectHandler(func(c mqtt.Client) {
		if token := c.Subscribe("iot/sensors/#", 1, nil); token.Wait() && token.Error() != nil {
			log.Printf("Subscribe error: %v", token.Error())
		}
		log.Println("MQTT connected")
	})

	mqttClient := mqtt.NewClient(opts)
	if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
		log.Printf("MQTT connect failed: %v", token.Error())
	} else {
		defer mqttClient.Disconnect(250)
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl := template.Must(template.New("index").Parse(htmlTemplate))
		tmpl.Execute(w, nil)
	})

	http.HandleFunc("/api/overview", func(w http.ResponseWriter, r *http.Request) {
		var total, online, alerts, unack, dataToday int64
		db.Model(&Device{}).Count(&total)
		db.Model(&Device{}).Where("status = ?", "online").Count(&online)
		db.Model(&Alert{}).Count(&alerts)
		db.Model(&Alert{}).Where("acknowledged = ?", false).Count(&unack)
		db.Model(&SensorData{}).Where("timestamp >= ?", time.Now().Truncate(24*time.Hour)).Count(&dataToday)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"total_devices": total, "online_devices": online, "total_alerts": alerts,
			"unacknowledged": unack, "data_today": dataToday,
		})
	})

	http.HandleFunc("/api/devices", func(w http.ResponseWriter, r *http.Request) {
		var devices []Device
		db.Find(&devices)
		json.NewEncoder(w).Encode(devices)
	})

	http.HandleFunc("/api/devices/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/calibrate") {
			calibrateHandler(w, r)
		}
	})

	http.HandleFunc("/api/alerts", func(w http.ResponseWriter, r *http.Request) {
		var alerts []Alert
		db.Order("timestamp desc").Limit(100).Find(&alerts)
		json.NewEncoder(w).Encode(alerts)
	})

	http.HandleFunc("/api/alerts/export", exportAlertsHandler)

	http.HandleFunc("/api/alerts/unacknowledged", func(w http.ResponseWriter, r *http.Request) {
		var alerts []Alert
		db.Where("acknowledged = ?", false).Order("timestamp desc").Find(&alerts)
		json.NewEncoder(w).Encode(alerts)
	})

	http.HandleFunc("/api/data/device/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/data/device/")
		var data []SensorData
		db.Where("device_id = ?", id).Order("timestamp desc").Limit(50).Find(&data)
		json.NewEncoder(w).Encode(data)
	})

	http.HandleFunc("/api/predict/", predictionHandler)
	http.HandleFunc("/api/geology/", geologyHandler)
	http.HandleFunc("/api/simulate", simulateHandler)

	log.Println("IoT Server running on :8080")
	log.Println("Features: CSV导出 | 地质剖面 | 时间序列预测")
	http.ListenAndServe(":8080", nil)
}

const htmlTemplate = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>IoT 传感器监控系统 - 智能版</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Segoe UI",sans-serif;background:#f0f2f5}
.header{background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center}
.tabs{display:flex;gap:.5rem}
.tab{background:rgba(255,255,255,.2);padding:.5rem 1rem;border-radius:6px;cursor:pointer}
.tab.active{background:white;color:#667eea}
.container{display:grid;grid-template-columns:1fr 440px;gap:1rem;padding:1rem;height:calc(100vh - 72px)}
.map-section{background:white;border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.1);overflow:hidden;display:flex;flex-direction:column}
.map-header{padding:1rem;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center}
#map{flex:1;min-height:400px}
.sidebar{display:flex;flex-direction:column;gap:1rem;overflow-y:auto}
.panel{background:white;border-radius:12px;padding:1rem;box-shadow:0 2px 10px rgba(0,0,0,.1)}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.75rem}
.stat-card{padding:.75rem;border-radius:8px;text-align:center}
.stat-card.blue{background:#e3f2fd;color:#1976d2}
.stat-card.green{background:#e8f5e9;color:#388e3c}
.stat-card.orange{background:#fff3e0;color:#f57c00}
.stat-card.red{background:#ffebee;color:#d32f2f}
.stat-value{font-size:1.5rem;font-weight:700}
.stat-label{font-size:.75rem;opacity:.8}
.device-item{padding:.75rem;border-radius:8px;margin-bottom:.5rem;border-left:4px solid #4caf50;cursor:pointer}
.device-item:hover{background:#f5f5f5}
.alert-item{padding:.75rem;border-radius:8px;margin-bottom:.5rem;background:#fff8e1;border-left:4px solid #ffc107}
.alert-item.critical{background:#ffebee;border-left-color:#f44336}
button{background:#667eea;color:white;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer}
button:hover{background:#5a6fd6}
button.small{padding:.3rem .6rem;font-size:.8rem}
button.secondary{background:#6b7280}
button.secondary:hover{background:#4b5563}
button.success{background:#10b981}
button.success:hover{background:#059669}
.modal{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);align-items:center;justify-content:center;z-index:1000}
.modal.active{display:flex}
.modal-lg{max-width:1000px!important}
.modal-content{background:white;border-radius:12px;padding:1.5rem;max-width:800px;width:90%;max-height:85vh;overflow-y:auto}
.close-btn{float:right;background:none;color:#999;font-size:1.5rem;border:none;cursor:pointer}
.chart-container{height:180px;margin:1rem 0}
table{width:100%;border-collapse:collapse;font-size:.85rem}
th,td{padding:.5rem;text-align:left;border-bottom:1px solid #eee}
th{background:#f5f5f5}
.badge{padding:.15rem .4rem;border-radius:4px;font-size:.7rem}
.badge.blue{background:#e3f2fd;color:#1976d2}
.badge.green{background:#e8f5e9;color:#388e3c}
.badge.purple{background:#f3e8ff;color:#7c3aed}
.geology-section{margin-top:1.5rem}
.geology-profile{display:flex;align-items:flex-start;gap:2rem;margin-top:1rem}
.geology-borehole{width:60px;background:linear-gradient(180deg,#8B7355 0%,#8B7355 16%,#A0522D 16%,#A0522D 50%,#696969 50%,#696969 100%);border:2px solid #333;position:relative;height:300px;border-radius:4px}
.depth-marker{position:absolute;left:-40px;transform:translateY(-50%);font-size:.75rem;color:#666}
.geology-legend{flex:1}
.legend-item{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.legend-color{width:20px;height:20px;border-radius:4px}
.prediction-section{margin-top:1rem}
.prediction-badge{background:#dbeafe;color:#1d4ed8;padding:.25rem .5rem;border-radius:4px;font-size:.75rem;margin-left:.5rem}
.export-bar{display:flex;gap:.5rem;margin-bottom:1rem;flex-wrap:wrap}
.date-input{padding:.4rem;border:1px solid #ddd;border-radius:6px;font-size:.85rem}
@media(max-width:1024px){.container{grid-template-columns:1fr}}
</style></head>
<body>
<div class="header">
<h1>🌐 IoT 智能监控系统</h1>
<div class="tabs">
<div class="tab active">监控地图</div>
<div class="tab" onclick="showAlertsPage()">告警管理</div>
</div>
</div>
<div class="container">
<div class="map-section">
<div class="map-header"><span>设备地图</span>
<div>
<button onclick="simulateData()" class="small" style="margin-right:.5rem">🎲 模拟</button>
<button onclick="refreshAll()" class="small">🔄 刷新</button>
</div>
</div><div id="map"></div></div>
<div class="sidebar">
<div class="panel"><h3>系统概览</h3><div class="stats-grid">
<div class="stat-card blue"><div class="stat-value" id="total">0</div><div class="stat-label">设备总数</div></div>
<div class="stat-card green"><div class="stat-value" id="online">0</div><div class="stat-label">在线设备</div></div>
<div class="stat-card orange"><div class="stat-value" id="today">0</div><div class="stat-label">今日数据</div></div>
<div class="stat-card red"><div class="stat-value" id="alerts">0</div><div class="stat-label">未处理告警</div></div>
</div></div>
<div class="panel"><h3>设备列表</h3><div id="deviceList"></div></div>
<div class="panel"><h3>最近告警</h3><div id="alertList"></div></div>
</div></div>

<div class="modal" id="deviceModal"><div class="modal-content modal-lg">
<button class="close-btn" onclick="closeModal('deviceModal')">&times;</button>
<h3 id="modalTitle">设备详情</h3><div id="modalBody"></div>
</div></div>

<div class="modal" id="alertsModal"><div class="modal-content modal-lg">
<button class="close-btn" onclick="closeModal('alertsModal')">&times;</button>
<h3>告警记录管理</h3>
<div class="export-bar">
<input type="date" id="startDate" class="date-input">
<input type="date" id="endDate" class="date-input">
<select id="severityFilter" class="date-input">
<option value="">全部级别</option><option value="warning">Warning</option><option value="critical">Critical</option>
</select>
<button class="success small" onclick="exportCSV()">⬇️ 导出CSV</button>
<button class="small secondary" onclick="exportJSON()">📄 导出JSON</button>
</div>
<div id="alertsTable"></div>
</div></div>

<script>
let map,markers={},devices=[],allAlerts=[];
function init(){
  map=L.map("map").setView([35,110],4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(map);
  refreshAll();
  setInterval(refreshAll,30000);
}
async function refreshAll(){
  await Promise.all([loadOverview(),loadDevices(),loadAlerts()]);
}
async function loadOverview(){
  const r=await fetch("/api/overview");
  const d=await r.json();
  document.getElementById("total").textContent=d.total_devices;
  document.getElementById("online").textContent=d.online_devices;
  document.getElementById("today").textContent=d.data_today;
  document.getElementById("alerts").textContent=d.unacknowledged;
}
async function loadDevices(){
  const r=await fetch("/api/devices");
  devices=await r.json();
  const list=document.getElementById("deviceList");
  if(devices.length===0){list.innerHTML='<p style="color:#999;text-align:center;padding:1rem">暂无设备，点击"模拟"生成数据</p>';return}
  list.innerHTML=devices.map(d=>'<div class="device-item" onclick="showDetail('+d.id+')"><div><b>'+d.name+'</b> <span class="badge purple">'+d.geology_type+'</span></div><div style="font-size:.8rem;color:#666">深度 '+d.depth+'m</div></div>').join("");
  devices.forEach(d=>{
    if(d.latitude&&d.longitude){
      const color=d.status==="online"?"#4caf50":"#9e9e9e";
      const icon=L.divIcon({className:"",html:'<div style="background:'+color+';width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,.3)"></div>',iconSize:[20,20],iconAnchor:[10,10]});
      if(markers[d.id])map.removeLayer(markers[d.id]);
      markers[d.id]=L.marker([d.latitude,d.longitude],{icon}).addTo(map).bindPopup("<b>"+d.name+"</b><br>深度:"+d.depth+"m<br>地质:"+d.geology_type);
    }
  });
  const valid=devices.filter(d=>d.latitude&&d.longitude);
  if(valid.length>0){const bounds=L.latLngBounds(valid.map(d=>[d.latitude,d.longitude]));map.fitBounds(bounds,{padding:[50,50]})}
}
async function loadAlerts(){
  const r=await fetch("/api/alerts/unacknowledged");
  const alerts=await r.json();
  const list=document.getElementById("alertList");
  if(alerts.length===0){list.innerHTML='<p style="color:#999;text-align:center;padding:1rem">暂无告警</p>';return}
  list.innerHTML=alerts.slice(0,10).map(a=>'<div class="alert-item '+a.severity+'"><div><b>'+a.alert_type+'</b> - '+a.severity+'</div><div style="font-size:.85rem;color:#666">'+a.message+'</div></div>').join("");
}
async function simulateData(){await fetch("/api/simulate");await refreshAll()}
async function showDetail(id){
  const d=devices.find(x=>x.id===id);
  const [r1,r2,r3,r4]=await Promise.all([
    fetch("/api/data/device/"+id),
    fetch("/api/predict/"+id+"?metric=incline_x"),
    fetch("/api/geology/"+id),
    fetch("/api/predict/"+id+"?metric=vibration")
  ]);
  const data=await r1.json();const preds=await r2.json();const geo=await r3.json();const vibPreds=await r4.json();
  document.getElementById("modalTitle").textContent=d.name;
  let html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">';
  html+='<div><h4>基本信息</h4>';
  html+="<p><strong>设备:</strong> "+d.device_eui+"</p>";
  html+="<p><strong>位置:</strong> "+d.latitude.toFixed(4)+", "+d.longitude.toFixed(4)+"</p>";
  html+="<p><strong>安装深度:</strong> "+d.depth+"m</p>";
  html+="<p><strong>地质类型:</strong> "+d.geology_type+"</p>";
  html+="<p><strong>倾角偏移:</strong> X:"+d.incline_offset_x.toFixed(4)+"° Y:"+d.incline_offset_y.toFixed(4)+'° <button class="small secondary" onclick="calibrate('+d.id+')">校准</button></p>';
  html+='</div><div class="geology-section"><h4>地质剖面</h4>';
  html+=renderGeologyProfile(geo);
  html+='</div></div>';
  html+='<div class="prediction-section"><h4>数据趋势与预测 <span class="prediction-badge">ARIMA模型</span></h4>';
  html+='<div class="chart-container"><canvas id="predChart"></canvas></div></div>';
  if(data.length>0){
    html+="<h4>历史数据</h4><table><tr><th>时间</th><th>倾角X</th><th>振动</th><th>雨量1h/24h</th></tr>";
    html+=data.slice(0,8).map(x=>"<tr><td>"+new Date(x.timestamp).toLocaleTimeString()+"</td><td>"+(x.incline_x!=null?x.incline_x.toFixed(2)+"°":"-")+"</td><td>"+(x.vibration_max!=null?x.vibration_max.toFixed(1):"-")+"</td><td>"+(x.rain_1h!=null?x.rain_1h.toFixed(1)+"/"+x.rain_24h.toFixed(1)+"mm":"-")+"</td></tr>").join("");
    html+="</table>";
  }
  document.getElementById("modalBody").innerHTML=html;
  document.getElementById("deviceModal").classList.add("active");
  if(data.length>0||preds){setTimeout(()=>drawPredChart(data,preds,vibPreds),100)}
}
function renderGeologyProfile(geo){
  let html='<div class="geology-profile"><div class="geology-borehole" style="background:linear-gradient(180deg,';
  let cumDepth=0;let stops=[];
  geo.layers.forEach((l,i)=>{stops.push(l.color+" "+(cumDepth/geo.depth*100)+"%");cumDepth+=l.thickness;stops.push(l.color+" "+(cumDepth/geo.depth*100)+"%")});
  html+=stops.join(",")+');height:'+Math.min(geo.depth*10,300)+'px">';
  cumDepth=0;geo.layers.forEach((l,i)=>{cumDepth+=l.thickness;html+='<div class="depth-marker" style="top:'+(cumDepth/geo.depth*100)+'%">-'+cumDepth+'m</div>'});
  html+='</div><div class="geology-legend">';
  geo.layers.forEach(l=>{html+='<div class="legend-item"><div class="legend-color" style="background:'+l.color+'"></div><div><strong>'+l.Type+'</strong><br>厚度'+l.Thickness+'m | 硬度'+l.Hardness+'</div></div>'});
  html+='</div></div>';return html
}
function drawPredChart(data,preds,vibPreds){
  const hist=data.slice(0,12).reverse();
  const labels=hist.map(d=>new Date(d.timestamp).toLocaleTimeString());
  const predLabels=preds?prefLabels=preds.map(p=>new Date(p.timestamp).toLocaleTimeString()):[];
  const sets=[];
  const inc=hist.filter(d=>d.incline_x!=null);
  if(inc.length>0)sets.push({label:"倾角X(°)",data:inc.map(d=>d.incline_x),borderColor:"#667eea",fill:false,tension:0.1});
  if(preds&&preds.length>0){
    sets.push({label:"预测值",data:preds.map(p=>p.predicted),borderColor:"#10b981",borderDash:[5,5],fill:false,tension:0.1});
    sets.push({label:"置信上界",data:preds.map(p=>p.upper_bound),borderColor:"#10b98133",pointRadius:0,fill:false});
    sets.push({label:"置信下界",data:preds.map(p=>p.lower_bound),borderColor:"#10b98133",pointRadius:0,fill:false});
  }
  if(sets.length>0)new Chart(document.getElementById("predChart"),{type:"line",data:{labels:[...labels,...predLabels],datasets:sets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:10}}}}}});
}
async function calibrate(id){await fetch("/api/devices/"+id+"/calibrate",{method:"POST"});await loadDevices();showDetail(id)}
function showAlertsPage(){loadAllAlerts();document.getElementById("alertsModal").classList.add("active")}
async function loadAllAlerts(){
  const r=await fetch("/api/alerts");allAlerts=await r.json();renderAlertsTable(allAlerts)
}
function renderAlertsTable(alerts){
  const tbl=document.getElementById("alertsTable");
  if(alerts.length===0){tbl.innerHTML='<p style="color:#999;text-align:center;padding:2rem">暂无告警记录</p>';return}
  let html='<table><tr><th>时间</th><th>设备</th><th>类型</th><th>级别</th><th>消息</th><th>状态</th></tr>';
  html+=alerts.map(a=>'<tr class="'+(a.severity==="critical"?"critical":"")+'" style="background:'+(a.severity==="critical"?"#fff5f5":"inherit")+'"><td>'+new Date(a.timestamp).toLocaleString()+'</td><td>'+a.device_eui+'</td><td>'+a.alert_type+'</td><td><span class="badge '+(a.severity==="critical"?"red":"orange")+'">'+a.severity+'</span></td><td>'+a.message+'</td><td>'+(a.acknowledged?'<span class="badge green">已确认</span>':'<span class="badge orange">待处理</span>')+'</td></tr>').join("");
  html+="</table>";tbl.innerHTML=html
}
function exportCSV(){
  let url="/api/alerts/export?format=csv";
  if(document.getElementById("startDate").value)url+="&start="+document.getElementById("startDate").value;
  if(document.getElementById("endDate").value)url+="&end="+document.getElementById("endDate").value;
  if(document.getElementById("severityFilter").value)url+="&severity="+document.getElementById("severityFilter").value;
  window.open(url,"_blank")
}
function exportJSON(){
  let url="/api/alerts/export?format=json";
  if(document.getElementById("startDate").value)url+="&start="+document.getElementById("startDate").value;
  if(document.getElementById("endDate").value)url+="&end="+document.getElementById("endDate").value;
  if(document.getElementById("severityFilter").value)url+="&severity="+document.getElementById("severityFilter").value;
  window.open(url,"_blank")
}
function closeModal(id){document.getElementById(id).classList.remove("active")}
init();
</script></body></html>`
