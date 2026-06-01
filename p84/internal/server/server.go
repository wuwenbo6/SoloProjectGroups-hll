package server

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"rtsp-proxy/internal/database"
	"rtsp-proxy/internal/ptz"
	"rtsp-proxy/internal/recorder"
	"rtsp-proxy/internal/snapshot"
	"rtsp-proxy/internal/stream"
)

type Server struct {
	router        *gin.Engine
	db            *database.DB
	streamMgr     *stream.Manager
	recorder      *recorder.Recorder
	snapshotter   *snapshot.Snapshotter
	ptzCtrl       *ptz.PTZController
	hlsOutputDir  string
	recordOutputDir string
	snapOutputDir  string
}

func New(db *database.DB, streamMgr *stream.Manager, rec *recorder.Recorder, snap *snapshot.Snapshotter, ptzCtrl *ptz.PTZController, hlsOutputDir, recordOutputDir, snapOutputDir string) *Server {
	s := &Server{
		router:          gin.Default(),
		db:              db,
		streamMgr:       streamMgr,
		recorder:        rec,
		snapshotter:     snap,
		ptzCtrl:         ptzCtrl,
		hlsOutputDir:    hlsOutputDir,
		recordOutputDir: recordOutputDir,
		snapOutputDir:   snapOutputDir,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.router.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	api := s.router.Group("/api")
	{
		api.GET("/stats", s.getStats)
		api.GET("/streams", s.getStreams)
		api.GET("/streams/:id", s.getStream)
		api.POST("/streams", s.createStream)
		api.PUT("/streams/:id", s.updateStream)
		api.DELETE("/streams/:id", s.deleteStream)
		api.POST("/streams/:id/start", s.startStream)
		api.POST("/streams/:id/stop", s.stopStream)
		api.GET("/streams/:id/logs", s.getStreamLogs)
		api.POST("/streams/:id/viewer", s.addViewer)
		api.DELETE("/streams/:id/viewer", s.removeViewer)

		api.POST("/streams/:id/record/start", s.startRecording)
		api.POST("/streams/:id/record/stop", s.stopRecording)
		api.GET("/streams/:id/record/status", s.getRecordingStatus)
		api.GET("/recordings", s.getRecordings)
		api.DELETE("/recordings/:id", s.deleteRecording)
		api.GET("/recordings/:id/download", s.downloadRecording)
		api.GET("/recordings/:id/play", s.playRecording)

		api.POST("/streams/:id/snapshot", s.takeSnapshot)
		api.GET("/snapshots", s.getSnapshots)
		api.DELETE("/snapshots/:id", s.deleteSnapshot)
		api.GET("/snapshots/:id/download", s.downloadSnapshot)

		api.POST("/streams/:id/ptz/:cmd", s.ptzCommand)
		api.POST("/streams/:id/ptz/stop", s.ptzStop)
		api.POST("/streams/:id/ptz/preset/:preset", s.ptzPreset)
	}

	s.router.Static("/hls", s.hlsOutputDir)
	s.router.Static("/recordings", s.recordOutputDir)
	s.router.Static("/snapshots", s.snapOutputDir)
	s.router.StaticFile("/", "./web/static/index.html")
	s.router.Static("/static", "./web/static")
}

func (s *Server) getStreams(c *gin.Context) {
	streams, err := s.db.GetAllStreams()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, streams)
}

func (s *Server) getStream(c *gin.Context) {
	id := c.Param("id")
	stream, err := s.db.GetStream(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Stream not found"})
		return
	}
	c.JSON(http.StatusOK, stream)
}

func (s *Server) createStream(c *gin.Context) {
	var req struct {
		ID      string `json:"id" binding:"required"`
		Name    string `json:"name" binding:"required"`
		RTSPURL string `json:"rtsp_url" binding:"required"`
		Enabled bool   `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stream := &database.Stream{
		ID:        req.ID,
		Name:      req.Name,
		RTSPURL:   req.RTSPURL,
		Enabled:   req.Enabled,
		Status:    database.StatusStopped,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.db.CreateStream(stream); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, stream)
}

func (s *Server) updateStream(c *gin.Context) {
	id := c.Param("id")
	existing, err := s.db.GetStream(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Stream not found"})
		return
	}

	var req struct {
		Name    string `json:"name"`
		RTSPURL string `json:"rtsp_url"`
		Enabled *bool  `json:"enabled"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		existing.Name = req.Name
	}
	if req.RTSPURL != "" {
		existing.RTSPURL = req.RTSPURL
	}
	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	existing.UpdatedAt = time.Now()

	if err := s.db.Save(existing).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, existing)
}

func (s *Server) deleteStream(c *gin.Context) {
	id := c.Param("id")

	s.streamMgr.StopStream(id)
	s.recorder.StopRecording(id)

	if err := s.db.Delete(&database.Stream{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Stream deleted"})
}

func (s *Server) startStream(c *gin.Context) {
	id := c.Param("id")
	if err := s.streamMgr.StartStream(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Stream started"})
}

func (s *Server) stopStream(c *gin.Context) {
	id := c.Param("id")
	if err := s.streamMgr.StopStream(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Stream stopped"})
}

func (s *Server) getStreamLogs(c *gin.Context) {
	id := c.Param("id")
	logs, err := s.db.GetStreamLogs(id, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, logs)
}

func (s *Server) addViewer(c *gin.Context) {
	id := c.Param("id")
	if err := s.streamMgr.AddViewer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Viewer added"})
}

func (s *Server) getStats(c *gin.Context) {
	stats := s.streamMgr.GetStats()
	c.JSON(http.StatusOK, stats)
}

func (s *Server) removeViewer(c *gin.Context) {
	id := c.Param("id")
	s.streamMgr.RemoveViewer(id)
	c.JSON(http.StatusOK, gin.H{"message": "Viewer removed"})
}

func (s *Server) startRecording(c *gin.Context) {
	id := c.Param("id")
	rec, err := s.recorder.StartRecording(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, rec)
}

func (s *Server) stopRecording(c *gin.Context) {
	id := c.Param("id")
	if err := s.recorder.StopRecording(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Recording stopped"})
}

func (s *Server) getRecordingStatus(c *gin.Context) {
	id := c.Param("id")
	isRecording := s.recorder.IsRecording(id)
	c.JSON(http.StatusOK, gin.H{"recording": isRecording})
}

func (s *Server) getRecordings(c *gin.Context) {
	streamID := c.Query("stream_id")
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	recordings, total, err := s.db.GetRecordings(streamID, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  recordings,
		"total": total,
	})
}

func (s *Server) deleteRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	rec, err := s.db.GetRecording(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	if rec.FilePath != "" {
		os.Remove(rec.FilePath)
	}

	if err := s.db.DeleteRecording(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Recording deleted"})
}

func (s *Server) downloadRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	rec, err := s.db.GetRecording(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	if _, err := os.Stat(rec.FilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.FileAttachment(rec.FilePath, rec.FileName)
}

func (s *Server) playRecording(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	rec, err := s.db.GetRecording(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recording not found"})
		return
	}

	if _, err := os.Stat(rec.FilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	relPath, err := filepath.Rel(s.recordOutputDir, rec.FilePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid file path"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"url": "/recordings/" + relPath,
	})
}

func (s *Server) takeSnapshot(c *gin.Context) {
	id := c.Param("id")
	snap, err := s.snapshotter.TakeSnapshot(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, snap)
}

func (s *Server) getSnapshots(c *gin.Context) {
	streamID := c.Query("stream_id")
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

	snapshots, total, err := s.db.GetSnapshots(streamID, offset, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":  snapshots,
		"total": total,
	})
}

func (s *Server) deleteSnapshot(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	snap, err := s.db.GetSnapshot(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Snapshot not found"})
		return
	}

	if snap.FilePath != "" {
		os.Remove(snap.FilePath)
	}

	if err := s.db.DeleteSnapshot(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Snapshot deleted"})
}

func (s *Server) downloadSnapshot(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	snap, err := s.db.GetSnapshot(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Snapshot not found"})
		return
	}

	if _, err := os.Stat(snap.FilePath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
		return
	}

	c.FileAttachment(snap.FilePath, snap.FileName)
}

func (s *Server) ptzCommand(c *gin.Context) {
	id := c.Param("id")
	cmd := c.Param("cmd")

	var req struct {
		Speed float64 `json:"speed"`
	}
	c.ShouldBindJSON(&req)

	if req.Speed == 0 {
		req.Speed = 0.5
	}

	if err := s.ptzCtrl.ExecuteCommand(id, ptz.PTZCommand(cmd), req.Speed); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "PTZ command executed"})
}

func (s *Server) ptzStop(c *gin.Context) {
	id := c.Param("id")
	if err := s.ptzCtrl.Stop(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "PTZ stopped"})
}

func (s *Server) ptzPreset(c *gin.Context) {
	id := c.Param("id")
	preset := c.Param("preset")

	if err := s.ptzCtrl.GotoPreset(id, preset); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Moved to preset"})
}

func (s *Server) Run(addr string) error {
	return s.router.Run(addr)
}

func (s *Server) GetHLSPath(streamID string) string {
	return filepath.Join("/hls", streamID, "stream.m3u8")
}
