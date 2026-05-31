package database

import (
	"iot-system/internal/models"
	"log"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init(path string) error {
	var err error
	DB, err = gorm.Open(sqlite.Open(path), &gorm.Config{})
	if err != nil {
		return err
	}

	err = DB.AutoMigrate(
		&models.Device{},
		&models.SensorData{},
		&models.DeviceState{},
		&models.Rule{},
		&models.Scene{},
		&models.CommandLog{},
	)
	if err != nil {
		return err
	}

	log.Println("Database initialized successfully")
	return nil
}

func SaveSensorData(data *models.SensorData) error {
	return DB.Create(data).Error
}

func GetSensorHistory(deviceID string, limit int) ([]models.SensorData, error) {
	var data []models.SensorData
	err := DB.Where("device_id = ?", deviceID).Order("timestamp desc").Limit(limit).Find(&data).Error
	return data, err
}

func GetRecentSensorData(deviceID string, dataType string) (*models.SensorData, error) {
	var data models.SensorData
	err := DB.Where("device_id = ? AND type = ?", deviceID, dataType).Order("timestamp desc").First(&data).Error
	return &data, err
}

func GetAllDevices() ([]models.Device, error) {
	var devices []models.Device
	err := DB.Find(&devices).Error
	return devices, err
}

func GetDeviceByID(deviceID string) (*models.Device, error) {
	var device models.Device
	err := DB.Where("device_id = ?", deviceID).First(&device).Error
	return &device, err
}

func CreateOrUpdateDevice(device *models.Device) error {
	var existing models.Device
	err := DB.Where("device_id = ?", device.DeviceID).First(&existing).Error
	if err != nil {
		return DB.Create(device).Error
	}
	device.ID = existing.ID
	device.CreatedAt = existing.CreatedAt
	return DB.Save(device).Error
}

func UpdateDeviceState(deviceID string, state string) error {
	var deviceState models.DeviceState
	err := DB.Where("device_id = ?", deviceID).First(&deviceState).Error
	if err != nil {
		deviceState = models.DeviceState{
			DeviceID:  deviceID,
			State:     state,
			UpdatedAt: time.Now(),
		}
		return DB.Create(&deviceState).Error
	}
	deviceState.State = state
	deviceState.UpdatedAt = time.Now()
	return DB.Save(&deviceState).Error
}

func GetAllRules() ([]models.Rule, error) {
	var rules []models.Rule
	err := DB.Find(&rules).Error
	return rules, err
}

func GetActiveRules() ([]models.Rule, error) {
	var rules []models.Rule
	err := DB.Where("enabled = ?", true).Find(&rules).Error
	return rules, err
}

func CreateRule(rule *models.Rule) error {
	return DB.Create(rule).Error
}

func UpdateRule(rule *models.Rule) error {
	return DB.Save(rule).Error
}

func DeleteRule(id uint) error {
	return DB.Delete(&models.Rule{}, id).Error
}

func GetAllScenes() ([]models.Scene, error) {
	var scenes []models.Scene
	err := DB.Find(&scenes).Error
	return scenes, err
}

func CreateScene(scene *models.Scene) error {
	return DB.Create(scene).Error
}

func UpdateScene(scene *models.Scene) error {
	return DB.Save(scene).Error
}

func DeleteScene(id uint) error {
	return DB.Delete(&models.Scene{}, id).Error
}

func LogCommand(deviceID, command, status string) error {
	log := models.CommandLog{
		DeviceID:  deviceID,
		Command:   command,
		Status:    status,
		Timestamp: time.Now(),
	}
	return DB.Create(&log).Error
}
