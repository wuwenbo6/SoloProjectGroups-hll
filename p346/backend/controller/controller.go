package controller

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"tacacs-simulator/model"
	"tacacs-simulator/repository"
	"tacacs-simulator/service"

	"github.com/gin-gonic/gin"
)

type Controller struct {
	repo    *repository.Repository
	service *service.TacacsService
}

func NewController(repo *repository.Repository) *Controller {
	return &Controller{
		repo:    repo,
		service: service.NewTacacsService(repo),
	}
}

func (c *Controller) Auth(ctx *gin.Context) {
	var req model.AuthRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := c.service.Authenticate(req.Username, req.Password)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, resp)
}

func (c *Controller) Authorize(ctx *gin.Context) {
	var req model.AuthorizeRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := c.service.Authorize(req.Username, req.Command, req.CmdArgs, req.Attrs, req.SessionID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, resp)
}

func (c *Controller) Accounting(ctx *gin.Context) {
	var req model.AccountingRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := c.service.Accounting(&req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, resp)
}

func (c *Controller) GetConfig(ctx *gin.Context) {
	config := c.repo.GetConfig()
	users := c.repo.GetAllUsers()
	policies := c.repo.GetAllPolicies()

	ctx.JSON(http.StatusOK, gin.H{
		"sharedSecret": config.SharedSecret,
		"users":        users,
		"policies":     policies,
	})
}

func (c *Controller) UpdateConfig(ctx *gin.Context) {
	var req struct {
		SharedSecret string `json:"sharedSecret"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.SharedSecret != "" {
		c.repo.SetSharedSecret(req.SharedSecret)
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Config updated"})
}

func (c *Controller) GetUsers(ctx *gin.Context) {
	users := c.repo.GetAllUsers()
	ctx.JSON(http.StatusOK, users)
}

func (c *Controller) CreateUser(ctx *gin.Context) {
	var user model.User
	if err := ctx.ShouldBindJSON(&user); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.repo.AddUser(&user)
	ctx.JSON(http.StatusCreated, user)
}

func (c *Controller) UpdateUser(ctx *gin.Context) {
	username := ctx.Param("username")
	var user model.User
	if err := ctx.ShouldBindJSON(&user); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	success := c.repo.UpdateUser(username, &user)
	if !success {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	ctx.JSON(http.StatusOK, user)
}

func (c *Controller) DeleteUser(ctx *gin.Context) {
	username := ctx.Param("username")
	success := c.repo.DeleteUser(username)
	if !success {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "User deleted"})
}

func (c *Controller) GetPolicies(ctx *gin.Context) {
	policies := c.repo.GetAllPolicies()
	ctx.JSON(http.StatusOK, policies)
}

func (c *Controller) CreatePolicy(ctx *gin.Context) {
	var policy model.AuthPolicy
	if err := ctx.ShouldBindJSON(&policy); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.repo.AddPolicy(&policy)
	ctx.JSON(http.StatusCreated, policy)
}

func (c *Controller) UpdatePolicy(ctx *gin.Context) {
	id := ctx.Param("id")
	var policy model.AuthPolicy
	if err := ctx.ShouldBindJSON(&policy); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	success := c.repo.UpdatePolicy(id, &policy)
	if !success {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Policy not found"})
		return
	}

	ctx.JSON(http.StatusOK, policy)
}

func (c *Controller) DeletePolicy(ctx *gin.Context) {
	id := ctx.Param("id")
	success := c.repo.DeletePolicy(id)
	if !success {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Policy not found"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Policy deleted"})
}

func (c *Controller) GetSessions(ctx *gin.Context) {
	sessions := c.repo.GetAllSessions()
	ctx.JSON(http.StatusOK, sessions)
}

func (c *Controller) GetPackets(ctx *gin.Context) {
	sessionIDStr := ctx.Query("sessionId")
	var packets []*model.PacketRecord

	if sessionIDStr != "" {
		sessionID64, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sessionId"})
			return
		}
		sessionID := uint32(sessionID64)
		packets = c.repo.GetPacketsForSession(sessionID)
	} else {
		packets = c.repo.GetAllPackets()
	}

	ctx.JSON(http.StatusOK, packets)
}

func (c *Controller) ExportPacketsJSON(ctx *gin.Context) {
	sessionIDStr := ctx.Query("sessionId")
	typeFilter := ctx.Query("type")
	var packets []*model.PacketRecord

	if sessionIDStr != "" {
		sessionID64, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sessionId"})
			return
		}
		sessionID := uint32(sessionID64)
		packets = c.repo.GetPacketsForSession(sessionID)
	} else {
		packets = c.repo.GetAllPackets()
	}

	if typeFilter != "" {
		filtered := make([]*model.PacketRecord, 0)
		for _, p := range packets {
			if p.Type == typeFilter {
				filtered = append(filtered, p)
			}
		}
		packets = filtered
	}

	ctx.Header("Content-Type", "application/json")
	ctx.Header("Content-Disposition", "attachment; filename=tacacs_audit_log.json")
	ctx.JSON(http.StatusOK, packets)
}

func (c *Controller) ExportPacketsCSV(ctx *gin.Context) {
	sessionIDStr := ctx.Query("sessionId")
	typeFilter := ctx.Query("type")
	var packets []*model.PacketRecord

	if sessionIDStr != "" {
		sessionID64, err := strconv.ParseUint(sessionIDStr, 10, 32)
		if err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Invalid sessionId"})
			return
		}
		sessionID := uint32(sessionID64)
		packets = c.repo.GetPacketsForSession(sessionID)
	} else {
		packets = c.repo.GetAllPackets()
	}

	if typeFilter != "" {
		filtered := make([]*model.PacketRecord, 0)
		for _, p := range packets {
			if p.Type == typeFilter {
				filtered = append(filtered, p)
			}
		}
		packets = filtered
	}

	ctx.Header("Content-Type", "text/csv; charset=utf-8")
	ctx.Header("Content-Disposition", "attachment; filename=tacacs_audit_log.csv")

	writer := csv.NewWriter(ctx.Writer)
	defer writer.Flush()

	headers := []string{"ID", "SessionID", "Type", "Direction", "Timestamp", "Command", "Status"}
	if err := writer.Write(headers); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write CSV"})
		return
	}

	for _, p := range packets {
		command := ""
		status := ""
		if p.BodyFields != nil {
			if args, ok := p.BodyFields["Args"]; ok {
				if argsSlice, ok := args.([]string); ok {
					for _, arg := range argsSlice {
						if strings.HasPrefix(arg, "cmd=") {
							command = strings.TrimPrefix(arg, "cmd=")
						}
					}
				}
			}
			if statusField, ok := p.BodyFields["Status"]; ok {
				status = fmt.Sprintf("%v", statusField)
			}
			if serverMsg, ok := p.BodyFields["ServerMsg"]; ok {
				if status == "" {
					status = fmt.Sprintf("%v", serverMsg)
				}
			}
		}

		row := []string{
			p.ID,
			fmt.Sprintf("%d", p.SessionID),
			p.Type,
			p.Direction,
			p.Timestamp.Format("2006-01-02 15:04:05"),
			command,
			status,
		}
		if err := writer.Write(row); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write CSV row"})
			return
		}
	}
}
