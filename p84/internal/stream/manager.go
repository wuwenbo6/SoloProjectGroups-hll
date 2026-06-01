package stream

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"rtsp-proxy/internal/database"
)

type TranscodeMode string

const (
	ModeCopy     TranscodeMode = "copy"
	ModeSoftware TranscodeMode = "software"
	ModeHardware TranscodeMode = "hardware"
)

type Config struct {
	FFmpegPath        string
	HLSTime           float64
	HLSListSize       int
	HLSFlags          string
	VideoCodec        string
	AudioCodec        string
	VideoBitrate      string
	AudioBitrate      string
	HLSOutputDir      string
	IdleTimeout       time.Duration
	MaxRestarts       int
	RestartInterval   time.Duration
	MaxConcurrent     int
	TranscodeMode     TranscodeMode
	LowLatency        bool
	HardwareEncoder   string
	HardwareDecoder   string
}

type StreamProcess struct {
	ID         string
	cmd        *exec.Cmd
	ctx        context.Context
	cancel     context.CancelFunc
	viewers    int32
	mu         sync.RWMutex
	lastActive time.Time
	config     *StreamConfig
}

type StreamConfig struct {
	VideoCodec    string
	AudioCodec    string
	VideoBitrate  string
	AudioBitrate  string
	TranscodeMode TranscodeMode
	LowLatency    bool
}

type Manager struct {
	db           *database.DB
	config       Config
	streams      map[string]*StreamProcess
	mu           sync.RWMutex
	wg           sync.WaitGroup
	runningCount int32
}

func NewManager(db *database.DB, config Config) *Manager {
	if config.TranscodeMode == "" {
		config.TranscodeMode = detectBestMode()
	}
	if config.HardwareEncoder == "" {
		config.HardwareEncoder = detectHardwareEncoder()
	}
	if config.HardwareDecoder == "" {
		config.HardwareDecoder = detectHardwareDecoder()
	}
	if config.MaxConcurrent == 0 {
		config.MaxConcurrent = runtime.NumCPU()
	}
	if config.IdleTimeout == 0 {
		config.IdleTimeout = 60 * time.Second
	}

	if err := os.MkdirAll(config.HLSOutputDir, 0755); err != nil {
		fmt.Printf("Failed to create HLS output dir: %v\n", err)
	}

	return &Manager{
		db:      db,
		config:  config,
		streams: make(map[string]*StreamProcess),
	}
}

func detectBestMode() TranscodeMode {
	if detectHardwareEncoder() != "libx264" {
		return ModeHardware
	}
	return ModeCopy
}

func detectHardwareEncoder() string {
	if runtime.GOOS == "darwin" {
		return "h264_videotoolbox"
	}
	if _, err := exec.LookPath("nvidia-smi"); err == nil {
		return "h264_nvenc"
	}
	return "libx264"
}

func detectHardwareDecoder() string {
	if runtime.GOOS == "darwin" {
		return "h264_videotoolbox"
	}
	if _, err := exec.LookPath("nvidia-smi"); err == nil {
		return "h264_cuvid"
	}
	return ""
}

func (m *Manager) StartStream(streamID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if sp, exists := m.streams[streamID]; exists {
		sp.mu.Lock()
		sp.lastActive = time.Now()
		sp.mu.Unlock()
		return nil
	}

	if int(atomic.LoadInt32(&m.runningCount)) >= m.config.MaxConcurrent {
		return fmt.Errorf("max concurrent streams reached: %d", m.config.MaxConcurrent)
	}

	stream, err := m.db.GetStream(streamID)
	if err != nil {
		return fmt.Errorf("stream not found: %w", err)
	}

	if !stream.Enabled {
		return fmt.Errorf("stream %s is disabled", streamID)
	}

	streamConfig := m.buildStreamConfig(stream)

	ctx, cancel := context.WithCancel(context.Background())
	sp := &StreamProcess{
		ID:         streamID,
		ctx:        ctx,
		cancel:     cancel,
		lastActive: time.Now(),
		config:     streamConfig,
	}

	m.streams[streamID] = sp
	atomic.AddInt32(&m.runningCount, 1)
	m.db.UpdateStreamStatus(streamID, database.StatusStarting)
	m.db.AddLog(streamID, fmt.Sprintf("Starting stream with mode: %s", streamConfig.TranscodeMode), "info")

	go m.runFFmpeg(sp, stream)
	go m.watchViewerCount(sp)

	return nil
}

func (m *Manager) buildStreamConfig(stream *database.Stream) *StreamConfig {
	config := &StreamConfig{
		TranscodeMode: m.config.TranscodeMode,
		LowLatency:    m.config.LowLatency,
		VideoCodec:    m.config.VideoCodec,
		AudioCodec:    m.config.AudioCodec,
		VideoBitrate:  m.config.VideoBitrate,
		AudioBitrate:  m.config.AudioBitrate,
	}

	if config.VideoCodec == "" {
		switch config.TranscodeMode {
		case ModeCopy:
			config.VideoCodec = "copy"
			config.AudioCodec = "copy"
		case ModeHardware:
			config.VideoCodec = m.config.HardwareEncoder
		default:
			config.VideoCodec = "libx264"
		}
	}

	if config.AudioCodec == "" {
		config.AudioCodec = "aac"
	}

	return config
}

func (m *Manager) runFFmpeg(sp *StreamProcess, stream *database.Stream) {
	m.wg.Add(1)
	defer m.wg.Done()
	defer atomic.AddInt32(&m.runningCount, -1)

	restartCount := 0

	for {
		select {
		case <-sp.ctx.Done():
			m.db.UpdateStreamStatus(sp.ID, database.StatusStopped)
			m.db.AddLog(sp.ID, "Stream stopped", "info")
			return
		default:
		}

		if restartCount >= m.config.MaxRestarts && m.config.MaxRestarts > 0 {
			m.db.UpdateStreamStatus(sp.ID, database.StatusError, "Max restart attempts reached")
			m.db.AddLog(sp.ID, "Max restart attempts reached", "error")
			return
		}

		outputDir := filepath.Join(m.config.HLSOutputDir, sp.ID)
		if err := os.MkdirAll(outputDir, 0755); err != nil {
			m.db.UpdateStreamStatus(sp.ID, database.StatusError, err.Error())
			m.db.AddLog(sp.ID, fmt.Sprintf("Failed to create output dir: %v", err), "error")
			time.Sleep(m.config.RestartInterval)
			restartCount++
			continue
		}

		args := m.buildFFmpegArgs(stream.RTSPURL, outputDir, sp.config)

		cmd := exec.CommandContext(sp.ctx, m.config.FFmpegPath, args...)
		
		stderr, err := cmd.StderrPipe()
		if err != nil {
			m.db.AddLog(sp.ID, fmt.Sprintf("Failed to get stderr pipe: %v", err), "error")
			time.Sleep(m.config.RestartInterval)
			restartCount++
			continue
		}

		stdout, err := cmd.StdoutPipe()
		if err != nil {
			m.db.AddLog(sp.ID, fmt.Sprintf("Failed to get stdout pipe: %v", err), "error")
		}

		sp.mu.Lock()
		sp.cmd = cmd
		sp.mu.Unlock()

		m.db.UpdateStreamStatus(sp.ID, database.StatusRunning)
		m.db.AddLog(sp.ID, fmt.Sprintf("FFmpeg started: %s %v", m.config.FFmpegPath, args), "info")

		go func() {
			scanner := bufio.NewScanner(stderr)
			scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
			for scanner.Scan() {
				line := scanner.Text()
				if len(line) > 0 && (len(line) < 200 || line[0] == '[') {
					m.db.AddLog(sp.ID, line, "ffmpeg")
				}
			}
		}()

		go func() {
			if stdout == nil {
				return
			}
			scanner := bufio.NewScanner(stdout)
			for scanner.Scan() {
			}
		}()

		if err := cmd.Start(); err != nil {
			m.db.UpdateStreamStatus(sp.ID, database.StatusError, err.Error())
			m.db.AddLog(sp.ID, fmt.Sprintf("Failed to start FFmpeg: %v", err), "error")
			time.Sleep(m.config.RestartInterval)
			restartCount++
			continue
		}

		if restartCount > 0 {
			m.db.IncrementRestartCount(sp.ID)
		}
		restartCount = 0

		if err := cmd.Wait(); err != nil {
			select {
			case <-sp.ctx.Done():
				return
			default:
				m.db.AddLog(sp.ID, fmt.Sprintf("FFmpeg exited: %v, restarting...", err), "warn")
				time.Sleep(m.config.RestartInterval)
				restartCount++
			}
		}
	}
}

func (m *Manager) buildFFmpegArgs(rtspURL, outputDir string, config *StreamConfig) []string {
	args := []string{
		"-hide_banner",
		"-loglevel", "warning",
	}

	if config.LowLatency {
		args = append(args,
			"-fflags", "nobuffer",
			"-avioflags", "direct",
			"-flags", "low_delay",
			"-strict", "experimental",
			"-analyzeduration", "1000000",
			"-probesize", "1000000",
		)
	}

	args = append(args,
		"-rtsp_transport", "tcp",
		"-timeout", "5000000",
		"-max_delay", "500000",
		"-reorder_queue_size", "1024",
	)

	if m.config.HardwareDecoder != "" && config.TranscodeMode == ModeHardware {
		args = append(args, "-c:v", m.config.HardwareDecoder)
	}

	args = append(args, "-i", rtspURL)

	if config.VideoCodec == "copy" {
		args = append(args, "-c:v", "copy")
	} else {
		args = append(args, "-c:v", config.VideoCodec)
		
		if config.VideoBitrate != "" {
			args = append(args, "-b:v", config.VideoBitrate)
		}

		if config.LowLatency {
			if config.VideoCodec == "libx264" {
				args = append(args,
					"-preset", "ultrafast",
					"-tune", "zerolatency",
					"-x264-params", "keyint=30:min-keyint=30:scenecut=0",
				)
			} else if config.VideoCodec == "h264_videotoolbox" {
				args = append(args,
					"-realtime", "true",
					"-allow_sw", "true",
				)
			} else if config.VideoCodec == "h264_nvenc" {
				args = append(args,
					"-preset", "p1",
					"-tune", "ull",
					"-rc", "cbr",
				)
			}
		} else {
			if config.VideoCodec == "libx264" {
				args = append(args, "-preset", "fast", "-tune", "zerolatency")
			}
		}
	}

	args = append(args, "-c:a", config.AudioCodec)
	if config.AudioCodec != "copy" && config.AudioBitrate != "" {
		args = append(args, "-b:a", config.AudioBitrate)
	}

	hlsTime := m.config.HLSTime
	if hlsTime == 0 {
		hlsTime = 1.0
	}
	if config.LowLatency {
		hlsTime = 0.5
	}

	hlsListSize := m.config.HLSListSize
	if hlsListSize == 0 {
		hlsListSize = 4
	}
	if config.LowLatency {
		hlsListSize = 3
	}

	hlsFlags := m.config.HLSFlags
	if hlsFlags == "" {
		hlsFlags = "delete_segments+append_list+omit_endlist"
	}
	if config.LowLatency {
		hlsFlags = "delete_segments+append_list+omit_endlist+discont_start"
	}

	args = append(args,
		"-f", "hls",
		"-hls_time", fmt.Sprintf("%.1f", hlsTime),
		"-hls_list_size", fmt.Sprintf("%d", hlsListSize),
		"-hls_flags", hlsFlags,
		"-hls_delete_threshold", "1",
		"-hls_allow_cache", "0",
		"-hls_segment_type", "mpegts",
		"-method", "PUT",
	)

	if config.LowLatency {
		args = append(args,
			"-hls_fmp4_init_filename", "init.mp4",
			"-hls_segment_filename", filepath.Join(outputDir, "segment_%03d.ts"),
		)
	} else {
		args = append(args,
			"-hls_segment_filename", filepath.Join(outputDir, "segment_%03d.ts"),
		)
	}

	args = append(args, filepath.Join(outputDir, "stream.m3u8"))

	return args
}

func (m *Manager) watchViewerCount(sp *StreamProcess) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-sp.ctx.Done():
			return
		case <-ticker.C:
			viewers := int(atomic.LoadInt32(&sp.viewers))
			m.db.UpdateViewerCount(sp.ID, viewers)

			sp.mu.RLock()
			lastActive := sp.lastActive
			sp.mu.RUnlock()

			if viewers == 0 && time.Since(lastActive) > m.config.IdleTimeout {
				m.db.AddLog(sp.ID, "Idle timeout, stopping stream", "info")
				m.StopStream(sp.ID)
				return
			}
		}
	}
}

func (m *Manager) StopStream(streamID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	sp, exists := m.streams[streamID]
	if !exists {
		return fmt.Errorf("stream %s is not running", streamID)
	}

	sp.cancel()

	sp.mu.Lock()
	if sp.cmd != nil && sp.cmd.Process != nil {
		sp.cmd.Process.Kill()
	}
	sp.mu.Unlock()

	delete(m.streams, streamID)
	m.db.UpdateViewerCount(streamID, 0)

	return nil
}

func (m *Manager) AddViewer(streamID string) error {
	m.mu.RLock()
	sp, exists := m.streams[streamID]
	m.mu.RUnlock()

	if !exists {
		if err := m.StartStream(streamID); err != nil {
			return err
		}
		m.mu.RLock()
		sp = m.streams[streamID]
		m.mu.RUnlock()
	}

	if sp != nil {
		atomic.AddInt32(&sp.viewers, 1)
		sp.mu.Lock()
		sp.lastActive = time.Now()
		sp.mu.Unlock()
	}

	return nil
}

func (m *Manager) RemoveViewer(streamID string) {
	m.mu.RLock()
	sp, exists := m.streams[streamID]
	m.mu.RUnlock()

	if !exists {
		return
	}

	atomic.AddInt32(&sp.viewers, -1)
}

func (m *Manager) GetStreamStatus(streamID string) (bool, int) {
	m.mu.RLock()
	sp, exists := m.streams[streamID]
	m.mu.RUnlock()

	if !exists {
		return false, 0
	}

	viewers := int(atomic.LoadInt32(&sp.viewers))
	return true, viewers
}

func (m *Manager) GetStats() map[string]interface{} {
	m.mu.RLock()
	count := len(m.streams)
	m.mu.RUnlock()

	return map[string]interface{}{
		"running_streams": count,
		"max_concurrent":  m.config.MaxConcurrent,
		"transcode_mode":  m.config.TranscodeMode,
		"hardware_encoder": m.config.HardwareEncoder,
		"hardware_decoder": m.config.HardwareDecoder,
	}
}

func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, sp := range m.streams {
		sp.cancel()
		if sp.cmd != nil && sp.cmd.Process != nil {
			sp.cmd.Process.Kill()
		}
		m.db.UpdateStreamStatus(id, database.StatusStopped)
		m.db.UpdateViewerCount(id, 0)
	}

	m.wg.Wait()
}
