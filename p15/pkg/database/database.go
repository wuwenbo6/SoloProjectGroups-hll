package database

import (
	"time"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type TaskStatus string

const (
	StatusPending   TaskStatus = "pending"
	StatusRunning   TaskStatus = "running"
	StatusCompleted TaskStatus = "completed"
	StatusFailed    TaskStatus = "failed"
)

type CompileTask struct {
	ID            string     `gorm:"primaryKey" json:"id"`
	Filename      string     `json:"filename"`
	SourceCode    string     `gorm:"type:text" json:"source_code"`
	Language      string     `json:"language"`
	Status        TaskStatus `json:"status"`
	UseFPGA       bool       `json:"use_fpga"`
	UsedFPGA      bool       `json:"used_fpga"`
	PodName       string     `json:"pod_name,omitempty"`
	Output        string     `gorm:"type:text" json:"output,omitempty"`
	Error         string     `gorm:"type:text" json:"error,omitempty"`
	NormalTime    float64    `json:"normal_time_ms"`
	FPGATime      float64    `json:"fpga_time_ms"`
	Speedup       float64    `json:"speedup"`
	BinarySize    int64      `json:"binary_size"`
	CreatedAt     time.Time  `json:"created_at"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
}

var db *gorm.DB

func InitDB() error {
	var err error
	db, err = gorm.Open(sqlite.Open("tasks.db"), &gorm.Config{})
	if err != nil {
		return err
	}
	return db.AutoMigrate(&CompileTask{})
}

func CloseDB() {
	sqlDB, _ := db.DB()
	sqlDB.Close()
}

func CreateTask(task *CompileTask) error {
	return db.Create(task).Error
}

func GetTask(id string) (*CompileTask, error) {
	var task CompileTask
	err := db.First(&task, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func UpdateTask(task *CompileTask) error {
	return db.Save(task).Error
}

func ListTasks(limit int) ([]CompileTask, error) {
	var tasks []CompileTask
	err := db.Order("created_at desc").Limit(limit).Find(&tasks).Error
	return tasks, err
}

func GetPendingTasks() ([]CompileTask, error) {
	var tasks []CompileTask
	err := db.Where("status = ?", StatusPending).Order("created_at asc").Find(&tasks).Error
	return tasks, err
}

func UpdateTaskStatus(id string, status TaskStatus, podName string) error {
	updates := map[string]interface{}{"status": status}
	if podName != "" {
		updates["pod_name"] = podName
	}
	if status == StatusRunning {
		updates["status"] = status
	}
	return db.Model(&CompileTask{}).Where("id = ?", id).Updates(updates).Error
}

func CompleteTask(id string, output, errMsg string, normalTime, fpgaTime float64) error {
	now := time.Now()
	speedup := 0.0
	if fpgaTime > 0 {
		speedup = normalTime / fpgaTime
	}
	status := StatusCompleted
	if errMsg != "" {
		status = StatusFailed
	}
	return db.Model(&CompileTask{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":       status,
		"output":       output,
		"error":        errMsg,
		"normal_time":  normalTime,
		"fpga_time":    fpgaTime,
		"speedup":      speedup,
		"completed_at": &now,
	}).Error
}
