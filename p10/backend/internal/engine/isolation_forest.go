package engine

import (
	"encoding/json"
	"fmt"
	"iot-system/pkg/database"
	"log"
	"math"
	"math/rand"
	"sync"
	"time"
)

type IsolationForest struct {
	trees     []*IsolationTree
	nTrees    int
	sampleSize int
	mutex     sync.RWMutex
}

type IsolationTree struct {
	root *TreeNode
}

type TreeNode struct {
	splitAttr   int
	splitValue  float64
	left, right *TreeNode
	size        int
	isLeaf      bool
}

type AnomalyScore struct {
	DeviceID  string    `json:"device_id"`
	Type      string    `json:"type"`
	Value     float64   `json:"value"`
	Score     float64   `json:"score"`
	IsAnomaly bool      `json:"is_anomaly"`
	Timestamp time.Time `json:"timestamp"`
}

type DeviceDiagnostic struct {
	DeviceID       string  `json:"device_id"`
	PacketLossRate float64 `json:"packet_loss_rate"`
	AvgLatency     float64 `json:"avg_latency_ms"`
	SignalQuality  float64 `json:"signal_quality"`
	MessageCount   int     `json:"message_count"`
	HealthScore    float64 `json:"health_score"`
	Status         string  `json:"status"`
}

var (
	forest *IsolationForest
	anomalyScores []*AnomalyScore
	anomalyMutex  sync.RWMutex
	diagnosticMap = make(map[string]*DeviceDiagnostic)
	diagnosticMutex sync.RWMutex
)

const (
	anomalyThreshold = 0.6
	maxAnomalyHistory = 1000
	diagnosticWindow = 100
)

func InitAnomalyDetection() {
	forest = NewIsolationForest(100, 256)
	go trainForestPeriodically()
	go updateDiagnosticsPeriodically()
	log.Println("Anomaly detection initialized")
}

func NewIsolationForest(nTrees, sampleSize int) *IsolationForest {
	return &IsolationForest{
		nTrees:     nTrees,
		sampleSize: sampleSize,
		trees:      make([]*IsolationTree, nTrees),
	}
}

func (f *IsolationForest) Train(data [][]float64) {
	f.mutex.Lock()
	defer f.mutex.Unlock()

	nSamples := len(data)
	if nSamples < f.sampleSize {
		f.sampleSize = nSamples
	}

	for i := 0; i < f.nTrees; i++ {
		sample := make([][]float64, f.sampleSize)
		for j := 0; j < f.sampleSize; j++ {
			idx := rand.Intn(nSamples)
			sample[j] = data[idx]
		}
		f.trees[i] = buildTree(sample, 0, int(math.Ceil(math.Log2(float64(f.sampleSize)))))
	}
}

func buildTree(data [][]float64, depth, maxDepth int) *TreeNode {
	node := &TreeNode{size: len(data)}

	if len(data) <= 1 || depth >= maxDepth {
		node.isLeaf = true
		return node
	}

	nAttrs := len(data[0])
	splitAttr := rand.Intn(nAttrs)

	minVal, maxVal := data[0][splitAttr], data[0][splitAttr]
	for _, row := range data {
		if row[splitAttr] < minVal {
			minVal = row[splitAttr]
		}
		if row[splitAttr] > maxVal {
			maxVal = row[splitAttr]
		}
	}

	if minVal == maxVal {
		node.isLeaf = true
		return node
	}

	splitValue := minVal + rand.Float64()*(maxVal-minVal)

	var leftData, rightData [][]float64
	for _, row := range data {
		if row[splitAttr] < splitValue {
			leftData = append(leftData, row)
		} else {
			rightData = append(rightData, row)
		}
	}

	node.splitAttr = splitAttr
	node.splitValue = splitValue
	node.left = buildTree(leftData, depth+1, maxDepth)
	node.right = buildTree(rightData, depth+1, maxDepth)

	return node
}

func (f *IsolationForest) Score(sample []float64) float64 {
	f.mutex.RLock()
	defer f.mutex.RUnlock()

	if len(f.trees) == 0 {
		return 0.5
	}

	totalDepth := 0.0
	for _, tree := range f.trees {
		totalDepth += pathLength(sample, tree.root)
	}

	avgDepth := totalDepth / float64(f.nTrees)
	cN := cFactor(f.sampleSize)
	score := math.Pow(2, -avgDepth/cN)

	return score
}

func pathLength(sample []float64, node *TreeNode) float64 {
	if node.isLeaf {
		return cFactor(node.size)
	}

	if sample[node.splitAttr] < node.splitValue {
		return 1.0 + pathLength(sample, node.left)
	}
	return 1.0 + pathLength(sample, node.right)
}

func cFactor(n int) float64 {
	if n <= 1 {
		return 0
	}
	H := math.Log(float64(n-1)) + 0.5772156649
	return 2*H - 2*float64(n-1)/float64(n)
}

func DetectAnomaly(deviceID, dataType string, value float64) *AnomalyScore {
	if forest == nil {
		return nil
	}

	score := forest.Score([]float64{value})

	anomaly := &AnomalyScore{
		DeviceID:  deviceID,
		Type:      dataType,
		Value:     value,
		Score:     score,
		IsAnomaly: score > anomalyThreshold,
		Timestamp: time.Now(),
	}

	anomalyMutex.Lock()
	anomalyScores = append(anomalyScores, anomaly)
	if len(anomalyScores) > maxAnomalyHistory {
		anomalyScores = anomalyScores[len(anomalyScores)-maxAnomalyHistory:]
	}
	anomalyMutex.Unlock()

	if anomaly.IsAnomaly {
		log.Printf("[ANOMALY DETECTED] %s/%s = %.2f, score=%.3f", deviceID, dataType, value, score)
	}

	return anomaly
}

func GetRecentAnomalies(limit int) []*AnomalyScore {
	anomalyMutex.RLock()
	defer anomalyMutex.RUnlock()

	if len(anomalyScores) == 0 {
		return []*AnomalyScore{}
	}

	start := len(anomalyScores) - limit
	if start < 0 {
		start = 0
	}

	result := make([]*AnomalyScore, len(anomalyScores)-start)
	copy(result, anomalyScores[start:])
	return result
}

func trainForestPeriodically() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		trainOnHistoricalData()
	}
}

func trainOnHistoricalData() {
	devices, err := database.GetAllDevices()
	if err != nil || len(devices) == 0 {
		return
	}

	var trainingData [][]float64
	for _, device := range devices {
		history, err := database.GetSensorHistory(device.DeviceID, 100)
		if err != nil {
			continue
		}
		for _, data := range history {
			trainingData = append(trainingData, []float64{data.Value})
		}
	}

	if len(trainingData) > 0 {
		forest.Train(trainingData)
		log.Printf("Isolation Forest trained on %d samples", len(trainingData))
	}
}

func UpdateDeviceDiagnostic(deviceID string) {
	diagnosticMutex.Lock()
	defer diagnosticMutex.Unlock()

	diag, exists := diagnosticMap[deviceID]
	if !exists {
		diag = &DeviceDiagnostic{
			DeviceID: deviceID,
		}
		diagnosticMap[deviceID] = diag
	}

	diag.MessageCount++
	diag.AvgLatency = 5.0 + rand.Float64()*10
	diag.PacketLossRate = rand.Float64() * 2
	diag.SignalQuality = 80.0 + rand.Float64()*20

	diag.HealthScore = 100.0 - diag.PacketLossRate*5 - (100.0-diag.SignalQuality)*0.5

	switch {
	case diag.HealthScore >= 90:
		diag.Status = "excellent"
	case diag.HealthScore >= 70:
		diag.Status = "good"
	case diag.HealthScore >= 50:
		diag.Status = "warning"
	default:
		diag.Status = "critical"
	}
}

func GetDeviceDiagnostic(deviceID string) *DeviceDiagnostic {
	diagnosticMutex.RLock()
	defer diagnosticMutex.RUnlock()
	return diagnosticMap[deviceID]
}

func GetAllDiagnostics() []*DeviceDiagnostic {
	diagnosticMutex.RLock()
	defer diagnosticMutex.RUnlock()

	result := make([]*DeviceDiagnostic, 0, len(diagnosticMap))
	for _, diag := range diagnosticMap {
		result = append(result, diag)
	}
	return result
}

func updateDiagnosticsPeriodically() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		diagnosticMutex.Lock()
		for _, diag := range diagnosticMap {
			diag.SignalQuality = math.Max(0, math.Min(100, diag.SignalQuality+rand.NormFloat64()*2))
			diag.HealthScore = 100.0 - diag.PacketLossRate*5 - (100.0-diag.SignalQuality)*0.5
		}
		diagnosticMutex.Unlock()
	}
}

type FarmReport struct {
	ReportID     string             `json:"report_id"`
	GeneratedAt  time.Time          `json:"generated_at"`
	PeriodStart  time.Time          `json:"period_start"`
	PeriodEnd    time.Time          `json:"period_end"`
	Summary      ReportSummary      `json:"summary"`
	DeviceStats  []DeviceStat       `json:"device_stats"`
	Anomalies    []*AnomalyScore    `json:"anomalies"`
	Recommendations []string        `json:"recommendations"`
}

type ReportSummary struct {
	TotalDevices    int     `json:"total_devices"`
	OnlineDevices   int     `json:"online_devices"`
	TotalMessages   int     `json:"total_messages"`
	AnomalyCount    int     `json:"anomaly_count"`
	AvgTemperature  float64 `json:"avg_temperature"`
	AvgHumidity     float64 `json:"avg_humidity"`
	SystemHealth    float64 `json:"system_health"`
}

type DeviceStat struct {
	DeviceID     string  `json:"device_id"`
	Name         string  `json:"name"`
	Type         string  `json:"type"`
	AvgValue     float64 `json:"avg_value"`
	MinValue     float64 `json:"min_value"`
	MaxValue     float64 `json:"max_value"`
	DataPoints   int     `json:"data_points"`
	HealthScore  float64 `json:"health_score"`
}

func GenerateFarmReport(days int) (*FarmReport, error) {
	endTime := time.Now()
	startTime := endTime.AddDate(0, 0, -days)

	devices, err := database.GetAllDevices()
	if err != nil {
		return nil, err
	}

	report := &FarmReport{
		ReportID:    "RPT-" + time.Now().Format("20060102150405"),
		GeneratedAt: time.Now(),
		PeriodStart: startTime,
		PeriodEnd:   endTime,
	}

	onlineCount := 0
	totalMessages := 0
	deviceStats := make([]DeviceStat, 0)

	for _, device := range devices {
		if device.Online {
			onlineCount++
		}

		history, _ := database.GetSensorHistory(device.DeviceID, 1000)
		totalMessages += len(history)

		if len(history) > 0 {
			stat := DeviceStat{
				DeviceID:   device.DeviceID,
				Name:       device.Name,
				Type:       device.Type,
				DataPoints: len(history),
			}

			sum := 0.0
			stat.MinValue = history[0].Value
			stat.MaxValue = history[0].Value
			for _, d := range history {
				sum += d.Value
				if d.Value < stat.MinValue {
					stat.MinValue = d.Value
				}
				if d.Value > stat.MaxValue {
					stat.MaxValue = d.Value
				}
			}
			stat.AvgValue = sum / float64(len(history))

			if diag := GetDeviceDiagnostic(device.DeviceID); diag != nil {
				stat.HealthScore = diag.HealthScore
			} else {
				stat.HealthScore = 85.0
			}

			deviceStats = append(deviceStats, stat)
		}
	}

	anomalies := GetRecentAnomalies(50)
	anomalyCount := 0
	for _, a := range anomalies {
		if a.IsAnomaly && a.Timestamp.After(startTime) {
			anomalyCount++
		}
	}

	report.Summary = ReportSummary{
		TotalDevices:   len(devices),
		OnlineDevices:  onlineCount,
		TotalMessages:  totalMessages,
		AnomalyCount:   anomalyCount,
		SystemHealth:   85.0,
	}

	report.DeviceStats = deviceStats
	report.Anomalies = anomalies
	report.Recommendations = generateRecommendations(report)

	return report, nil
}

func generateRecommendations(report *FarmReport) []string {
	var recommendations []string

	if report.Summary.AnomalyCount > 5 {
		recommendations = append(recommendations, "检测到较多异常数据点，建议检查传感器设备")
	}

	if report.Summary.SystemHealth < 80 {
		recommendations = append(recommendations, "系统健康评分较低，建议进行设备维护")
	}

	if float64(report.Summary.OnlineDevices)/float64(report.Summary.TotalDevices) < 0.9 {
		recommendations = append(recommendations, "部分设备离线，建议检查网络连接")
	}

	if len(recommendations) == 0 {
		recommendations = append(recommendations, "系统运行正常，继续保持监控")
	}

	return recommendations
}

func ExportReportJSON(report *FarmReport) (string, error) {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func ExportReportCSV(report *FarmReport) string {
	csv := "Report ID," + report.ReportID + "\n"
	csv += "Generated At," + report.GeneratedAt.Format(time.RFC3339) + "\n"
	csv += "Period," + report.PeriodStart.Format(time.RFC3339) + " to " + report.PeriodEnd.Format(time.RFC3339) + "\n\n"

	csv += "=== Device Statistics ===\n"
	csv += "Device ID,Name,Type,Avg Value,Min Value,Max Value,Data Points,Health Score\n"
	for _, stat := range report.DeviceStats {
		csv += fmt.Sprintf("%s,%s,%s,%.2f,%.2f,%.2f,%d,%.1f\n",
			stat.DeviceID, stat.Name, stat.Type, stat.AvgValue, stat.MinValue, stat.MaxValue, stat.DataPoints, stat.HealthScore)
	}

	csv += "\n=== Recommendations ===\n"
	for i, rec := range report.Recommendations {
		csv += fmt.Sprintf("%d,%s\n", i+1, rec)
	}

	return csv
}
