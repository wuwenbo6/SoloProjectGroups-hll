package recorder

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"

	"rtsp-proxy/internal/database"
)

type RecorderConfig struct {
	FFmpegPath   string
	OutputDir    string
	SegmentTime  int
	MaxDuration  time.Duration
}

type ActiveRecording struct {
	ID        uint
	StreamID  string
	Cmd       *exec.Cmd
	Ctx       context.Context
	Cancel    context.CancelFunc
	StartTime time.Time
	FilePath  string
}

type Recorder struct {
	db       *database.DB
	config   RecorderConfig
	active   map[string]*ActiveRecording
	mu       sync.RWMutex
}

func NewRecorder(db *database.DB, config RecorderConfig) *Recorder {
	if err := os.MkdirAll(config.OutputDir, 0755); err != nil {
		fmt.Printf("Failed to create recorder output dir: %v\n", err)
	}

	if config.SegmentTime == 0 {
		config.SegmentTime = 300
	}
	if config.MaxDuration == 0 {
		config.MaxDuration = 24 * time.Hour
	}

	return &Recorder{
		db:     db,
		config: config,
		active: make(map[string]*ActiveRecording),
	}
}

func (r *Recorder) StartRecording(streamID string) (*database.Recording, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.active[streamID]; exists {
		return nil, fmt.Errorf("recording already in progress for stream %s", streamID)
	}

	stream, err := r.db.GetStream(streamID)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}

	now := time.Now()
	dateDir := now.Format("2006-01-02")
	outputDir := filepath.Join(r.config.OutputDir, streamID, dateDir)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, err
	}

	fileName := fmt.Sprintf("%s_%s.mp4", streamID, now.Format("150405"))
	filePath := filepath.Join(outputDir, fileName)

	ctx, cancel := context.WithCancel(context.Background())

	rec := &ActiveRecording{
		StreamID:  streamID,
		Ctx:       ctx,
		Cancel:    cancel,
		StartTime: now,
		FilePath:  filePath,
	}

	args := []string{
		"-rtsp_transport", "tcp",
		"-i", stream.RTSPURL,
		"-c:v", "copy",
		"-c:a", "aac",
		"-b:a", "128k",
		"-movflags", "+faststart",
		"-y",
		filePath,
	}

	cmd := exec.CommandContext(ctx, r.config.FFmpegPath, args...)
	rec.Cmd = cmd

	stderr, err := cmd.StderrPipe()
	if err != nil {
		cancel()
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}

	r.active[streamID] = rec

	dbRec := &database.Recording{
		StreamID:  streamID,
		FileName:  fileName,
		FilePath:  filePath,
		StartTime: now,
		CreatedAt: now,
	}
	if err := r.db.CreateRecording(dbRec); err != nil {
		cancel()
		delete(r.active, streamID)
		return nil, err
	}
	rec.ID = dbRec.ID

	go func() {
		buf := make([]byte, 4096)
		for {
			_, err := stderr.Read(buf)
			if err != nil {
				break
			}
		}
	}()

	go func() {
		<-ctx.Done()
		r.finalizeRecording(rec)
	}()

	r.db.AddLog(streamID, fmt.Sprintf("Recording started: %s", fileName), "info")
	return dbRec, nil
}

func (r *Recorder) finalizeRecording(rec *ActiveRecording) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if rec.Cmd != nil && rec.Cmd.Process != nil {
		rec.Cmd.Process.Signal(os.Interrupt)
		time.Sleep(500 * time.Millisecond)
		rec.Cmd.Process.Kill()
	}

	endTime := time.Now()

	fileInfo, err := os.Stat(rec.FilePath)
	if err == nil {
		r.db.Model(&database.Recording{}).Where("id = ?", rec.ID).Updates(map[string]interface{}{
			"end_time": endTime,
			"file_size": fileInfo.Size(),
			"duration": endTime.Sub(rec.StartTime).Seconds(),
		})
	}

	delete(r.active, rec.StreamID)
	r.db.AddLog(rec.StreamID, fmt.Sprintf("Recording stopped: %s", rec.FileName), "info")
}

func (r *Recorder) StopRecording(streamID string) error {
	r.mu.RLock()
	rec, exists := r.active[streamID]
	r.mu.RUnlock()

	if !exists {
		return fmt.Errorf("no recording in progress for stream %s", streamID)
	}

	rec.Cancel()
	return nil
}

func (r *Recorder) IsRecording(streamID string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, exists := r.active[streamID]
	return exists
}

func (r *Recorder) GetActiveRecordings() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0, len(r.active))
	for id := range r.active {
		ids = append(ids, id)
	}
	return ids
}

func (r *Recorder) Shutdown() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, rec := range r.active {
		rec.Cancel()
	}

	time.Sleep(1 * time.Second)
}
