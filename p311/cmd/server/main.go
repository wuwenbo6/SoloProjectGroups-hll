package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/codeserver-manager/internal/api"
	"github.com/codeserver-manager/internal/auth"
	"github.com/codeserver-manager/internal/backup"
	"github.com/codeserver-manager/internal/codeserver"
	"github.com/codeserver-manager/internal/config"
	"github.com/codeserver-manager/internal/proxy"
	"github.com/codeserver-manager/internal/user"
	"github.com/codeserver-manager/internal/workspace"
	"github.com/gin-gonic/gin"
)

func main() {
	configPath := "config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		log.Fatalf("Config file not found: %s", configPath)
	}

	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	userStore, err := user.NewStore(cfg.Data.DBPath)
	if err != nil {
		log.Fatalf("Failed to create user store: %v", err)
	}

	workspaceMgr, err := workspace.NewManager(cfg.Workspace.BaseDir)
	if err != nil {
		log.Fatalf("Failed to create workspace manager: %v", err)
	}

	instanceMgr, err := codeserver.NewManager(&cfg.CodeServer, workspaceMgr)
	if err != nil {
		log.Fatalf("Failed to create code-server manager: %v", err)
	}

	var backupMgr *backup.Manager
	if cfg.Backup.Enabled {
		var storage backup.Storage
		var err error
		switch cfg.Backup.StorageType {
		case "s3":
			log.Println("Warning: S3 storage not implemented yet, falling back to local storage")
			fallthrough
		default:
			storage, err = backup.NewLocalStorage(cfg.Backup.LocalDir)
			if err != nil {
				log.Fatalf("Failed to create local storage: %v", err)
			}
		}

		backupMgr = backup.NewManager(
			storage,
			cfg.Backup.Enabled,
			cfg.Backup.MaxBackupsPerUser,
			cfg.Backup.AutoBackupHours,
			workspaceMgr,
		)
	} else {
		backupMgr = backup.NewManager(nil, false, 0, 0, nil)
	}

	proxyMgr := proxy.NewManager(userStore, instanceMgr)
	apiHandler := api.NewHandler(userStore, instanceMgr, backupMgr)

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-User-Token, X-Admin-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	webDir, _ := filepath.Abs("web")
	r.StaticFile("/", filepath.Join(webDir, "index.html"))
	r.Static("/static", webDir)

	apiV1 := r.Group("/api/v1")
	{
		apiV1.POST("/login", apiHandler.Login)
		apiV1.POST("/users", apiHandler.CreateUser)

		userGroup := apiV1.Group("/user")
		userGroup.Use(auth.UserAuth(userStore))
		{
			userGroup.GET("/me", apiHandler.GetCurrentUser)
			userGroup.GET("/instance", apiHandler.GetInstanceStatus)
			userGroup.POST("/instance/start", apiHandler.StartInstance)
			userGroup.POST("/instance/stop", apiHandler.StopInstance)
			userGroup.GET("/backups", apiHandler.ListBackups)
			userGroup.POST("/backups", apiHandler.CreateBackup)
			userGroup.POST("/backups/:backup_id/restore", apiHandler.RestoreBackup)
			userGroup.DELETE("/backups/:backup_id", apiHandler.DeleteBackup)
			userGroup.GET("/backup/config", apiHandler.GetBackupConfig)
		}

		adminGroup := apiV1.Group("/admin")
		adminGroup.Use(auth.AdminAuth())
		{
			adminGroup.GET("/users", apiHandler.ListUsers)
			adminGroup.GET("/users/:id", apiHandler.GetUser)
			adminGroup.PUT("/users/:id", apiHandler.UpdateUser)
			adminGroup.DELETE("/users/:id", apiHandler.DeleteUser)
			adminGroup.GET("/instances", apiHandler.AdminListInstances)
			adminGroup.GET("/port-pool", apiHandler.AdminPortPoolStatus)
			adminGroup.POST("/instances/:user_id/stop", apiHandler.AdminStopInstance)
		}
	}

	r.GET("/api/v1/user/instance/logs", proxyMgr.StreamLogs)
	r.Any("/proxy/*proxyPath", proxyMgr.Proxy)

	addr := fmt.Sprintf("%s:%d", cfg.Server.Host, cfg.Server.Port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on %s", addr)
		log.Printf("Web UI: http://localhost:%d", cfg.Server.Port)
		log.Printf("Admin token: %s", cfg.Auth.AdminToken)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	instanceMgr.StopIdleCleanup()
	backupMgr.StopAutoBackup()

	instances := instanceMgr.List()
	for _, inst := range instances {
		if inst.Status == codeserver.StatusRunning || inst.Status == codeserver.StatusStarting {
			log.Printf("Stopping instance for user %s", inst.UserID)
			instanceMgr.Stop(inst.UserID)
		}
	}

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}
