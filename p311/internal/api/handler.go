package api

import (
	"net/http"
	"time"

	"github.com/codeserver-manager/internal/auth"
	"github.com/codeserver-manager/internal/backup"
	"github.com/codeserver-manager/internal/codeserver"
	"github.com/codeserver-manager/internal/user"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	userStore       *user.Store
	instanceManager *codeserver.Manager
	backupManager   *backup.Manager
}

func NewHandler(us *user.Store, im *codeserver.Manager, bm *backup.Manager) *Handler {
	return &Handler{
		userStore:       us,
		instanceManager: im,
		backupManager:   bm,
	}
}

type CreateUserRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type UpdateUserRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *Handler) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.userStore.Create(req.Username, req.Password)
	if err != nil {
		if err == user.ErrUserExists {
			c.JSON(http.StatusConflict, gin.H{"error": "user already exists"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"id":       u.ID,
		"username": u.Username,
		"token":    u.Token,
	})
}

func (h *Handler) ListUsers(c *gin.Context) {
	users, err := h.userStore.List()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var result []gin.H
	for _, u := range users {
		result = append(result, gin.H{
			"id":         u.ID,
			"username":   u.Username,
			"created_at": u.CreatedAt,
			"updated_at": u.UpdatedAt,
		})
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) GetUser(c *gin.Context) {
	id := c.Param("id")

	u, err := h.userStore.GetByID(id)
	if err != nil {
		if err == user.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         u.ID,
		"username":   u.Username,
		"token":      u.Token,
		"created_at": u.CreatedAt,
		"updated_at": u.UpdatedAt,
	})
}

func (h *Handler) UpdateUser(c *gin.Context) {
	id := c.Param("id")

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.userStore.Update(id, req.Username, req.Password)
	if err != nil {
		if err == user.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       u.ID,
		"username": u.Username,
		"token":    u.Token,
	})
}

func (h *Handler) DeleteUser(c *gin.Context) {
	id := c.Param("id")

	h.instanceManager.Cleanup(id)

	if err := h.userStore.Delete(id); err != nil {
		if err == user.ErrUserNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	u, err := h.userStore.GetByUsername(req.Username)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if u.Password != req.Password {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":       u.ID,
		"username": u.Username,
		"token":    u.Token,
	})
}

func (h *Handler) GetCurrentUser(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         u.ID,
		"username":   u.Username,
		"created_at": u.CreatedAt,
	})
}

type StartInstanceRequest struct {
	Password string `json:"password"`
}

func (h *Handler) StartInstance(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req StartInstanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Password = uuid.New().String()[:8]
	}

	inst, err := h.instanceManager.Start(u.ID, req.Password)
	if err != nil {
		if err == codeserver.ErrInstanceRunning {
			c.JSON(http.StatusConflict, gin.H{"error": "instance already running"})
			return
		}
		if err == codeserver.ErrMaxInstances {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "max instances reached"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":   inst.UserID,
		"port":      inst.Port,
		"status":    inst.Status,
		"workspace": inst.Workspace,
		"password":  inst.Password,
		"proxy_url": "/proxy/?token=" + u.Token,
	})
}

func (h *Handler) StopInstance(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if err := h.instanceManager.Stop(u.ID); err != nil {
		if err == codeserver.ErrInstanceNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "instance not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}

func (h *Handler) GetInstanceStatus(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	inst, err := h.instanceManager.Get(u.ID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"status": "stopped",
			"error":  "instance not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":        inst.UserID,
		"port":           inst.Port,
		"status":         inst.Status,
		"pid":            inst.PID,
		"error":          inst.Error,
		"started_at":     inst.StartedAt,
		"last_active_at": inst.LastActiveAt,
		"idle_seconds":   int(time.Since(inst.LastActiveAt).Seconds()),
		"workspace":      inst.Workspace,
	})
}

func (h *Handler) AdminListInstances(c *gin.Context) {
	instances := h.instanceManager.List()

	var result []gin.H
	for _, inst := range instances {
		result = append(result, gin.H{
			"user_id":        inst.UserID,
			"port":           inst.Port,
			"status":         inst.Status,
			"pid":            inst.PID,
			"error":          inst.Error,
			"started_at":     inst.StartedAt,
			"last_active_at": inst.LastActiveAt,
			"idle_seconds":   int(time.Since(inst.LastActiveAt).Seconds()),
			"workspace":      inst.Workspace,
		})
	}

	c.JSON(http.StatusOK, result)
}

func (h *Handler) AdminPortPoolStatus(c *gin.Context) {
	pa := h.instanceManager.GetPortAllocator()
	c.JSON(http.StatusOK, gin.H{
		"free_pool_size": pa.GetFreePoolSize(),
		"free_ports":     pa.GetFreePorts(),
		"idle_timeout":   h.instanceManager.GetIdleTimeout().String(),
	})
}

func (h *Handler) AdminStopInstance(c *gin.Context) {
	userID := c.Param("user_id")

	if err := h.instanceManager.Stop(userID); err != nil {
		if err == codeserver.ErrInstanceNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "instance not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}

type CreateBackupRequest struct {
	Name string `json:"name"`
}

func (h *Handler) CreateBackup(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if !h.backupManager.IsEnabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "backup is not enabled"})
		return
	}

	var req CreateBackupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		req.Name = ""
	}

	info, err := h.backupManager.CreateBackup(c.Request.Context(), u.ID, req.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, info)
}

func (h *Handler) ListBackups(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if !h.backupManager.IsEnabled() {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}

	backups, err := h.backupManager.ListBackups(c.Request.Context(), u.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, backups)
}

func (h *Handler) RestoreBackup(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if !h.backupManager.IsEnabled() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "backup is not enabled"})
		return
	}

	backupID := c.Param("backup_id")
	if err := h.backupManager.RestoreBackup(c.Request.Context(), u.ID, backupID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "restored"})
}

func (h *Handler) DeleteBackup(c *gin.Context) {
	u := auth.GetCurrentUser(c)
	if u == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	if !h.backupManager.IsEnabled() {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	backupID := c.Param("backup_id")
	if err := h.backupManager.DeleteBackup(c.Request.Context(), u.ID, backupID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *Handler) GetBackupConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"enabled":              h.backupManager.IsEnabled(),
		"storage_type":         "local",
		"max_backups_per_user": 5,
	})
}
