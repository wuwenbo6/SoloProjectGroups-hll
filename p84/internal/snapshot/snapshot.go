package snapshot

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"rtsp-proxy/internal/database"
)

type SnapshotConfig struct {
	FFmpegPath string
	OutputDir  string
	Quality    int
	Width      int
	Height     int
}

type Snapshotter struct {
	db     *database.DB
	config SnapshotConfig
}

func NewSnapshotter(db *database.DB, config SnapshotConfig) *Snapshotter {
	if err := os.MkdirAll(config.OutputDir, 0755); err != nil {
		fmt.Printf("Failed to create snapshot output dir: %v\n", err)
	}

	if config.Quality == 0 {
		config.Quality = 2
	}

	return &Snapshotter{
		db:     db,
		config: config,
	}
}

func (s *Snapshotter) TakeSnapshot(streamID string) (*database.Snapshot, error) {
	stream, err := s.db.GetStream(streamID)
	if err != nil {
		return nil, fmt.Errorf("stream not found: %w", err)
	}

	now := time.Now()
	dateDir := now.Format("2006-01-02")
	outputDir := filepath.Join(s.config.OutputDir, streamID, dateDir)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return nil, err
	}

	fileName := fmt.Sprintf("%s_%s.jpg", streamID, now.Format("150405"))
	filePath := filepath.Join(outputDir, fileName)

	args := []string{
		"-rtsp_transport", "tcp",
		"-i", stream.RTSPURL,
		"-vframes", "1",
		"-q:v", strconv.Itoa(s.config.Quality),
		"-y",
	}

	if s.config.Width > 0 && s.config.Height > 0 {
		args = append(args, "-vf", fmt.Sprintf("scale=%d:%d", s.config.Width, s.config.Height))
	}

	args = append(args, filePath)

	cmd := exec.Command(s.config.FFmpegPath, args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}

	fileInfo, err := os.Stat(filePath)
	if err != nil {
		return nil, err
	}

	width, height := s.getImageDimensions(filePath)

	snap := &database.Snapshot{
		StreamID:  streamID,
		FileName:  fileName,
		FilePath:  filePath,
		FileSize:  fileInfo.Size(),
		Width:     width,
		Height:    height,
		CreatedAt: now,
	}

	if err := s.db.CreateSnapshot(snap); err != nil {
		os.Remove(filePath)
		return nil, err
	}

	s.db.AddLog(streamID, fmt.Sprintf("Snapshot taken: %s", fileName), "info")
	return snap, nil
}

func (s *Snapshotter) getImageDimensions(filePath string) (int, int) {
	cmd := exec.Command(s.config.FFmpegPath, "-i", filePath)
	output, _ := cmd.CombinedOutput()
	
	outputStr := string(output)
	if idx := strings.Index(outputStr, "Video:"); idx != -1 {
		rest := outputStr[idx:]
		if startIdx := strings.Index(rest, ","); startIdx != -1 {
			rest = rest[startIdx+1:]
			rest = strings.TrimSpace(rest)
			if endIdx := strings.Index(rest, ","); endIdx != -1 {
				dimStr := strings.TrimSpace(rest[:endIdx])
				parts := strings.Split(dimStr, "x")
				if len(parts) == 2 {
					w, _ := strconv.Atoi(parts[0])
					hParts := strings.Split(parts[1], " ")
					h, _ := strconv.Atoi(hParts[0])
					return w, h
				}
			}
		}
	}
	return 0, 0
}
