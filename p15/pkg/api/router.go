package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"fpga-compiler-service/pkg/compiler"
	"fpga-compiler-service/pkg/database"
	"fpga-compiler-service/pkg/fpga"
	"fpga-compiler-service/pkg/scheduler"
)

var compilerSvc *compiler.Service

func SetupRouter() *gin.Engine {
	var err error
	compilerSvc, err = compiler.NewService()
	if err != nil {
		panic(err)
	}

	router := gin.Default()

	router.Use(CORS())

	router.Static("/static", "./static")
	router.LoadHTMLGlob("web/*.html")

	router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", nil)
	})

	api := router.Group("/api")
	{
		api.POST("/compile", handleCompile)
		api.POST("/upload", handleUpload)
		api.GET("/tasks", handleListTasks)
		api.GET("/tasks/:id", handleGetTask)
		api.GET("/tasks/:id/status", handleGetTaskStatus)
		api.GET("/cluster/info", handleClusterInfo)
		api.GET("/fpga/info", handleFPGAInfo)
		api.GET("/fpga/status", handleFPGAPoolStatus)
		api.POST("/fpga/check", handleCheckShouldUseFPGA)
		api.POST("/tasks/:id/submit", handleSubmitTask)
		api.GET("/stats", handleStats)
		api.GET("/loadbalancer/status", handleLoadBalancerStatus)
		api.GET("/loadbalancer/recommend", handleLoadBalancerRecommend)
		api.GET("/report/csv", handleExportCSV)
		api.GET("/report/json", handleExportJSON)
		api.GET("/languages", handleGetLanguages)
		api.POST("/compile/async", handleAsyncCompile)
	}

	return router
}

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

type CompileRequest struct {
	Filename   string `json:"filename" binding:"required"`
	SourceCode string `json:"source_code" binding:"required"`
	UseFPGA    bool   `json:"use_fpga"`
}

func handleCompile(c *gin.Context) {
	var req CompileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := compilerSvc.Compile(req.Filename, req.SourceCode, req.UseFPGA)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	speedup := 1.0
	if result.FPGATime > 0 {
		speedup = result.NormalTime / result.FPGATime
	}

	c.JSON(http.StatusOK, gin.H{
		"success": result.Success,
		"output":  result.Output,
		"error":   result.Error,
		"timing": gin.H{
			"normal_time_ms": result.NormalTime,
			"fpga_time_ms":   result.FPGATime,
			"speedup":        speedup,
		},
		"token_count":    len(result.Tokens),
		"syntax_result":  result.SyntaxResult,
		"used_fpga":      result.UsedFPGA,
	})
}

type UploadResponse struct {
	TaskID   string `json:"task_id"`
	Filename string `json:"filename"`
	Status   string `json:"status"`
}

func handleUpload(c *gin.Context) {
	var req CompileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	task := &database.CompileTask{
		ID:         uuid.New().String(),
		Filename:   req.Filename,
		SourceCode: req.SourceCode,
		UseFPGA:    req.UseFPGA,
		Status:     database.StatusPending,
		CreatedAt:  time.Now(),
	}

	if err := database.CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, UploadResponse{
		TaskID:   task.ID,
		Filename: task.Filename,
		Status:   string(task.Status),
	})
}

func handleListTasks(c *gin.Context) {
	limit := 50
	tasks, err := database.ListTasks(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"count": len(tasks),
	})
}

func handleGetTask(c *gin.Context) {
	id := c.Param("id")
	task, err := database.GetTask(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	c.JSON(http.StatusOK, task)
}

func handleGetTaskStatus(c *gin.Context) {
	id := c.Param("id")
	task, err := database.GetTask(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	status := string(task.Status)
	if task.PodName != "" {
		podStatus, _ := scheduler.GetPodStatus(task.PodName)
		status = podStatus
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id":   id,
		"status":    status,
		"pod_name":  task.PodName,
		"speedup":   task.Speedup,
		"completed": task.Status == database.StatusCompleted,
	})
}

func handleSubmitTask(c *gin.Context) {
	id := c.Param("id")
	task, err := database.GetTask(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	if task.Status != database.StatusPending {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Task is not pending"})
		return
	}

	if err := scheduler.SubmitTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"task_id":  id,
		"status":   "submitted",
		"pod_name": task.PodName,
	})
}

func handleClusterInfo(c *gin.Context) {
	info, err := scheduler.GetClusterInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, info)
}

func handleFPGAInfo(c *gin.Context) {
	info := compilerSvc.GetFPGADeviceInfo()
	c.JSON(http.StatusOK, gin.H{
		"device_info": info,
	})
}

func handleFPGAPoolStatus(c *gin.Context) {
	status := fpga.GetPoolStatus()
	c.JSON(http.StatusOK, status)
}

func handleCheckShouldUseFPGA(c *gin.Context) {
	var req struct {
		SourceCode string `json:"source_code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	shouldUse := compilerSvc.ShouldUseFPGA(req.SourceCode)
	lineCount := strings.Count(req.SourceCode, "\n") + 1

	c.JSON(http.StatusOK, gin.H{
		"should_use_fpga": shouldUse,
		"line_count":      lineCount,
		"min_lines":       50,
		"reason":          map[bool]string{true: "Code size sufficient for FPGA acceleration", false: "Code too small, FPGA overhead outweighs benefits"}[shouldUse],
	})
}

func handleStats(c *gin.Context) {
	tasks, err := database.ListTasks(1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var totalSpeedup float64
	var fpgaCount int
	var completedCount int

	for _, task := range tasks {
		if task.Status == database.StatusCompleted {
			completedCount++
			if task.UseFPGA && task.Speedup > 0 {
				totalSpeedup += task.Speedup
				fpgaCount++
			}
		}
	}

	avgSpeedup := 0.0
	if fpgaCount > 0 {
		avgSpeedup = totalSpeedup / float64(fpgaCount)
	}

	c.JSON(http.StatusOK, gin.H{
		"total_tasks":     len(tasks),
		"completed_tasks": completedCount,
		"fpga_tasks":      fpgaCount,
		"avg_speedup":     avgSpeedup,
	})
}

func handleLoadBalancerStatus(c *gin.Context) {
	lb := compiler.GetLoadBalancer()
	status := lb.GetStatus()
	c.JSON(http.StatusOK, status)
}

func handleLoadBalancerRecommend(c *gin.Context) {
	recommendation := compilerSvc.GetLoadBalanceRecommendation()
	c.JSON(http.StatusOK, gin.H{
		"recommended_language": recommendation,
		"reason":               "Language queue has the shortest waiting time",
	})
}

func handleExportCSV(c *gin.Context) {
	tasks, err := database.ListTasks(1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var taskInterfaces []interface{}
	for _, t := range tasks {
		taskMap := map[string]interface{}{
			"id":         t.ID,
			"filename":   t.Filename,
			"language":   t.Language,
			"use_fpga":   t.UseFPGA,
			"used_fpga":  t.UsedFPGA,
			"status":     t.Status,
			"speedup":    t.Speedup,
			"created_at": t.CreatedAt,
		}
		taskInterfaces = append(taskInterfaces, taskMap)
	}

	report, err := compilerSvc.GeneratePerformanceReport(taskInterfaces)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filepath, err := compilerSvc.ExportReportCSV(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.FileAttachment(filepath, "performance_report.csv")
}

func handleExportJSON(c *gin.Context) {
	tasks, err := database.ListTasks(1000)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var taskInterfaces []interface{}
	for _, t := range tasks {
		taskMap := map[string]interface{}{
			"id":          t.ID,
			"filename":    t.Filename,
			"language":    t.Language,
			"use_fpga":    t.UseFPGA,
			"used_fpga":   t.UsedFPGA,
			"status":      t.Status,
			"speedup":     t.Speedup,
			"normal_time": t.NormalTime,
			"fpga_time":   t.FPGATime,
			"binary_size": t.BinarySize,
			"created_at":  t.CreatedAt,
		}
		taskInterfaces = append(taskInterfaces, taskMap)
	}

	report, err := compilerSvc.GeneratePerformanceReport(taskInterfaces)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	filepath, err := compilerSvc.ExportReportJSON(report)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.FileAttachment(filepath, "performance_report.json")
}

func handleGetLanguages(c *gin.Context) {
	languages := []map[string]interface{}{
		{"id": "c", "name": "C", "extension": ".c", "compiler": "gcc"},
		{"id": "rust", "name": "Rust", "extension": ".rs", "compiler": "rustc"},
		{"id": "go", "name": "Go", "extension": ".go", "compiler": "go build"},
	}
	c.JSON(http.StatusOK, gin.H{
		"languages": languages,
		"count":     len(languages),
	})
}

func handleAsyncCompile(c *gin.Context) {
	var req CompileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	lang := compiler.DetectLanguage(req.Filename)
	job := &compiler.CompileJob{
		Language:   lang,
		Filename:   req.Filename,
		SourceCode: req.SourceCode,
		PreferFPGA: req.UseFPGA,
	}

	lb := compiler.GetLoadBalancer()
	if err := lb.Submit(job); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	task := &database.CompileTask{
		ID:         uuid.New().String(),
		Filename:   req.Filename,
		SourceCode: req.SourceCode,
		Language:   string(lang),
		UseFPGA:    req.UseFPGA,
		Status:     database.StatusRunning,
		CreatedAt:  time.Now(),
	}
	database.CreateTask(task)

	go func() {
		result := <-job.ResultChan
		speedup := 1.0
		if result.FPGATime > 0 {
			speedup = result.NormalTime / result.FPGATime
		}
		database.CompleteTask(task.ID, result.Output, result.Error, result.NormalTime, result.FPGATime)
	}()

	c.JSON(http.StatusAccepted, gin.H{
		"task_id":  task.ID,
		"language": lang,
		"status":   "queued",
		"message":  "Compilation job has been queued",
	})
}
