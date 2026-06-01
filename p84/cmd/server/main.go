package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"gopkg.in/yaml.v3"
	"rtsp-proxy/internal/database"
	"rtsp-proxy/internal/ptz"
	"rtsp-proxy/internal/recorder"
	"rtsp-proxy/internal/server"
	"rtsp-proxy/internal/snapshot"
	"rtsp-proxy/internal/stream"
)

type Config struct {
	Server struct {
		Port int    `yaml:"port"`
		Host string `yaml:"host"`
	} `yaml:"server"`
	Database struct {
		Path string `yaml:"path"`
	} `yaml:"database"`
	FFmpeg struct {
		Path            string  `yaml:"path"`
		HLSTime         float64 `yaml:"hls_time"`
		HLSListSize     int     `yaml:"hls_list_size"`
		HLSFlags        string  `yaml:"hls_flags"`
		VideoCodec      string  `yaml:"video_codec"`
		AudioCodec      string  `yaml:"audio_codec"`
		VideoBitrate    string  `yaml:"video_bitrate"`
		AudioBitrate    string  `yaml:"audio_bitrate"`
		TranscodeMode   string  `yaml:"transcode_mode"`
		LowLatency      bool    `yaml:"low_latency"`
		HardwareEncoder string  `yaml:"hardware_encoder"`
		HardwareDecoder string  `yaml:"hardware_decoder"`
		MaxConcurrent   int     `yaml:"max_concurrent"`
		IdleTimeoutSec  int     `yaml:"idle_timeout_sec"`
	} `yaml:"ffmpeg"`
	HLS struct {
		OutputDir string `yaml:"output_dir"`
		BaseURL   string `yaml:"base_url"`
	} `yaml:"hls"`
	Recording struct {
		OutputDir string `yaml:"output_dir"`
	} `yaml:"recording"`
	Snapshot struct {
		OutputDir string `yaml:"output_dir"`
		Quality   int    `yaml:"quality"`
	} `yaml:"snapshot"`
	Streams []struct {
		ID      string `yaml:"id"`
		Name    string `yaml:"name"`
		RTSPURL string `yaml:"rtsp_url"`
		Enabled bool   `yaml:"enabled"`
	} `yaml:"streams"`
}

func loadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var config Config
	if err := yaml.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	if config.Recording.OutputDir == "" {
		config.Recording.OutputDir = "data/recordings"
	}
	if config.Snapshot.OutputDir == "" {
		config.Snapshot.OutputDir = "data/snapshots"
	}

	return &config, nil
}

func main() {
	configPath := "configs/config.yaml"
	if len(os.Args) > 1 {
		configPath = os.Args[1]
	}

	absPath, err := filepath.Abs(configPath)
	if err != nil {
		log.Printf("Warning: could not get absolute path: %v", err)
		absPath = configPath
	}

	config, err := loadConfig(absPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.New(config.Database.Path)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	for _, s := range config.Streams {
		existing, err := db.GetStream(s.ID)
		if err != nil {
			stream := &database.Stream{
				ID:        s.ID,
				Name:      s.Name,
				RTSPURL:   s.RTSPURL,
				Enabled:   s.Enabled,
				Status:    database.StatusStopped,
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			if err := db.CreateStream(stream); err != nil {
				log.Printf("Failed to create stream %s: %v", s.ID, err)
			}
		} else {
			existing.Name = s.Name
			existing.RTSPURL = s.RTSPURL
			existing.Enabled = s.Enabled
			existing.UpdatedAt = time.Now()
			if err := db.Save(existing).Error; err != nil {
				log.Printf("Failed to update stream %s: %v", s.ID, err)
			}
		}
	}

	idleTimeout := 60 * time.Second
	if config.FFmpeg.IdleTimeoutSec > 0 {
		idleTimeout = time.Duration(config.FFmpeg.IdleTimeoutSec) * time.Second
	}

	streamConfig := stream.Config{
		FFmpegPath:      config.FFmpeg.Path,
		HLSTime:         config.FFmpeg.HLSTime,
		HLSListSize:     config.FFmpeg.HLSListSize,
		HLSFlags:        config.FFmpeg.HLSFlags,
		VideoCodec:      config.FFmpeg.VideoCodec,
		AudioCodec:      config.FFmpeg.AudioCodec,
		VideoBitrate:    config.FFmpeg.VideoBitrate,
		AudioBitrate:    config.FFmpeg.AudioBitrate,
		HLSOutputDir:    config.HLS.OutputDir,
		IdleTimeout:     idleTimeout,
		MaxRestarts:     10,
		RestartInterval: 3 * time.Second,
		MaxConcurrent:   config.FFmpeg.MaxConcurrent,
		TranscodeMode:   stream.TranscodeMode(config.FFmpeg.TranscodeMode),
		LowLatency:      config.FFmpeg.LowLatency,
		HardwareEncoder: config.FFmpeg.HardwareEncoder,
		HardwareDecoder: config.FFmpeg.HardwareDecoder,
	}

	streamMgr := stream.NewManager(db, streamConfig)

	recorderConfig := recorder.RecorderConfig{
		FFmpegPath: config.FFmpeg.Path,
		OutputDir:  config.Recording.OutputDir,
	}
	rec := recorder.NewRecorder(db, recorderConfig)

	snapshotConfig := snapshot.SnapshotConfig{
		FFmpegPath: config.FFmpeg.Path,
		OutputDir:  config.Snapshot.OutputDir,
		Quality:    config.Snapshot.Quality,
	}
	snap := snapshot.NewSnapshotter(db, snapshotConfig)

	ptzConfig := ptz.PTZConfig{
		Timeout: 5 * time.Second,
	}
	ptzCtrl := ptz.NewPTZController(db, ptzConfig)

	stats := streamMgr.GetStats()
	log.Printf("Transcode mode: %s", stats["transcode_mode"])
	log.Printf("Hardware encoder: %s", stats["hardware_encoder"])
	log.Printf("Hardware decoder: %s", stats["hardware_decoder"])
	log.Printf("Max concurrent streams: %d", stats["max_concurrent"])
	log.Printf("Low latency mode: %v", config.FFmpeg.LowLatency)

	srv := server.New(db, streamMgr, rec, snap, ptzCtrl, config.HLS.OutputDir, config.Recording.OutputDir, config.Snapshot.OutputDir)

	addr := fmt.Sprintf("%s:%d", config.Server.Host, config.Server.Port)
	go func() {
		log.Printf("Server starting on %s", addr)
		if err := srv.Run(addr); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down...")
	rec.Shutdown()
	streamMgr.Shutdown()
	log.Println("Goodbye!")
}
