package recorder

import (
	"encoding/binary"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"vnc-multiuser/pkg/database"
)

type Frame struct {
	data      []byte
	timestamp time.Time
}

type Recorder struct {
	DB        *database.Database
	OutputDir string
	FPS       int
	Enabled   bool

	cmd        *exec.Cmd
	frameChan  chan *Frame
	mu         sync.Mutex
	running    bool
	recordingID string
	startTime  time.Time
	sessionID  string
	done       chan struct{}

	frameInterval time.Duration
	lastFrameTime time.Time
	frameCount    uint64
}

func New(db *database.Database, outputDir string, fps int, enabled bool) *Recorder {
	os.MkdirAll(outputDir, 0755)
	return &Recorder{
		DB:            db,
		OutputDir:     outputDir,
		FPS:           fps,
		Enabled:       enabled,
		frameChan:     make(chan *Frame, 2048),
		frameInterval: time.Second / time.Duration(fps),
	}
}

func (r *Recorder) Start() error {
	if !r.Enabled {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	if r.running {
		return nil
	}

	r.running = true
	r.done = make(chan struct{})
	r.recordingID = fmt.Sprintf("rec_%d", time.Now().Unix())
	r.startTime = time.Now()
	r.lastFrameTime = r.startTime
	r.frameCount = 0

	go r.recordLoop()

	return nil
}

func (r *Recorder) recordLoop() {
	filename := fmt.Sprintf("vnc_%s.h264", r.startTime.Format("20060102_150405"))
	filepath := filepath.Join(r.OutputDir, filename)

	f, err := os.Create(filepath)
	if err != nil {
		return
	}
	defer f.Close()

	header := r.buildH264Header()
	f.Write(header)

	ticker := time.NewTicker(r.frameInterval)
	defer ticker.Stop()

	var pendingFrame *Frame
	startPTS := uint64(0)
	timeBase := r.frameInterval.Nanoseconds()

	for {
		select {
		case <-r.done:
			if pendingFrame != nil {
				r.writeFrameWithPTS(f, pendingFrame.data, startPTS, timeBase)
			}
			r.saveRecordingInfo(filepath)
			return

		case frame := <-r.frameChan:
			pendingFrame = frame

		case <-ticker.C:
			r.mu.Lock()
			r.frameCount++
			pts := uint64(r.frameCount)
			r.mu.Unlock()

			if pendingFrame != nil {
				r.writeFrameWithPTS(f, pendingFrame.data, pts, timeBase)
				pendingFrame = nil
			} else {
				nullFrame := r.buildNullFrame()
				if nullFrame != nil {
					r.writeFrameWithPTS(f, nullFrame, pts, timeBase)
				}
			}
		}
	}
}

func (r *Recorder) writeFrameWithPTS(f *os.File, data []byte, pts uint64, timeBase int64) {
	header := make([]byte, 8)
	header[0] = 0x00
	header[1] = 0x00
	header[2] = 0x00
	header[3] = 0x01

	binaryPutUint32(header[4:8], uint32(pts))

	f.Write(header)
	f.Write(data)
}

func binaryPutUint32(buf []byte, val uint32) {
	buf[0] = byte(val >> 24)
	buf[1] = byte(val >> 16)
	buf[2] = byte(val >> 8)
	buf[3] = byte(val)
}

func (r *Recorder) buildH264Header() []byte {
	sps := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x67, 0x42, 0xC0, 0x1E, 0xA9, 0x50, 0x14, 0x01, 0x6E, 0x40,
	}
	pps := []byte{
		0x00, 0x00, 0x00, 0x01,
		0x68, 0xCE, 0x3C, 0x80,
	}

	sei := r.buildSEI()
	return append(append(sps, pps...), sei...)
}

func (r *Recorder) buildSEI() []byte {
	seiPayload := []byte{
		0x00, 0x00, 0x00, 0x01, 0x06, 0x05,
	}

	timingData := make([]byte, 12)
	now := time.Now()
	timestamp := uint64(now.UnixNano())
	binaryPutUint64(timingData[0:8], timestamp)
	binaryPutUint32(timingData[8:12], uint32(r.FPS))

	return append(seiPayload, timingData...)
}

func binaryPutUint64(buf []byte, val uint64) {
	buf[0] = byte(val >> 56)
	buf[1] = byte(val >> 48)
	buf[2] = byte(val >> 40)
	buf[3] = byte(val >> 32)
	buf[4] = byte(val >> 24)
	buf[5] = byte(val >> 16)
	buf[6] = byte(val >> 8)
	buf[7] = byte(val)
}

func (r *Recorder) buildNullFrame() []byte {
	return []byte{
		0x00, 0x00, 0x00, 0x01,
		0x00, 0x00,
	}
}

func (r *Recorder) WriteFrame(data []byte) {
	if !r.running {
		return
	}

	frame := &Frame{
		data:      data,
		timestamp: time.Now(),
	}

	select {
	case r.frameChan <- frame:
	default:
	}
}

func (r *Recorder) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if !r.running {
		return
	}

	close(r.done)
	r.running = false
}

func (r *Recorder) saveRecordingInfo(filepath string) {
	info, err := os.Stat(filepath)
	if err != nil {
		return
	}

	duration := time.Since(r.startTime)
	expectedFrames := uint64(duration / r.frameInterval)

	rec := &database.Recording{
		ID:         r.recordingID,
		SessionID:  r.sessionID,
		StartTime:  r.startTime,
		EndTime:    time.Now(),
		FilePath:   filepath,
		FileSize:   info.Size(),
		Resolution: fmt.Sprintf("1024x768@%dfps", r.FPS),
	}

	r.DB.AddRecording(rec)
}

func (r *Recorder) SetSessionID(sessionID string) {
	r.sessionID = sessionID
}

func (r *Recorder) IsRunning() bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.running
}

func ExportToMP4(h264Path string, fps int, ffmpegPath string) (string, error) {
	if !strings.HasSuffix(h264Path, ".h264") {
		return "", fmt.Errorf("input file must be .h264 format")
	}

	mp4Path := strings.TrimSuffix(h264Path, ".h264") + ".mp4"

	if ffmpegPath == "" {
		ffmpegPath = "ffmpeg"
	}

	if _, err := exec.LookPath(ffmpegPath); err == nil {
		return exportWithFFmpeg(h264Path, mp4Path, fps, ffmpegPath)
	}

	return exportPureGo(h264Path, mp4Path, fps)
}

func exportWithFFmpeg(h264Path, mp4Path string, fps int, ffmpegPath string) (string, error) {
	cmd := exec.Command(ffmpegPath,
		"-r", fmt.Sprintf("%d", fps),
		"-i", h264Path,
		"-c:v", "libx264",
		"-preset", "medium",
		"-crf", "23",
		"-movflags", "+faststart",
		"-y",
		mp4Path,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("ffmpeg failed: %v, output: %s", err, output)
	}

	return mp4Path, nil
}

func exportPureGo(h264Path, mp4Path string, fps int) (string, error) {
	h264Data, err := os.ReadFile(h264Path)
	if err != nil {
		return "", err
	}

	f, err := os.Create(mp4Path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	muxer := &MP4Muxer{
		fps:        fps,
		timescale:  1000,
		duration:   0,
	}

	return muxer.WriteMP4(f, h264Data)
}

type MP4Muxer struct {
	fps       int
	timescale uint32
	duration  uint32
}

func (m *MP4Muxer) WriteMP4(f *os.File, h264Data []byte) (string, error) {
	nalus := m.parseNALUs(h264Data)

	totalFrames := uint32(len(nalus))
	m.duration = totalFrames * m.timescale / uint32(m.fps)

	ftyp := m.buildFTYP()
	moov := m.buildMOOV(totalFrames)
	mdat := m.buildMDAT(nalus)

	f.Write(ftyp)
	f.Write(moov)
	f.Write(mdat)

	return f.Name(), nil
}

func (m *MP4Muxer) parseNALUs(data []byte) [][]byte {
	var nalus [][]byte
	start := 0

	for i := 0; i < len(data)-3; {
		if data[i] == 0x00 && data[i+1] == 0x00 && data[i+2] == 0x00 && data[i+3] == 0x01 {
			if i > start {
				nalu := make([]byte, i-start)
				copy(nalu, data[start:i])
				nalus = append(nalus, nalu)
			}
			i += 4
			start = i
		} else {
			i++
		}
	}

	if start < len(data) {
		nalu := make([]byte, len(data)-start)
		copy(nalu, data[start:])
		nalus = append(nalus, nalu)
	}

	return nalus
}

func (m *MP4Muxer) buildFTYP() []byte {
	ftyp := []byte{
		0x00, 0x00, 0x00, 0x20,
		'f', 't', 'y', 'p',
		'm', 'p', '4', '2',
		0x00, 0x00, 0x00, 0x01,
		'i', 's', 'o', 'm',
		'i', 's', 'o', '2',
		'm', 'p', '4', '1',
		'm', 'p', '4', '2',
	}
	return ftyp
}

func (m *MP4Muxer) buildMOOV(totalFrames uint32) []byte {
	mvhd := m.buildMVHD()
	trak := m.buildTRAK(totalFrames)

	moovSize := 8 + len(mvhd) + len(trak)
	moov := make([]byte, moovSize)

	binary.BigEndian.PutUint32(moov[0:4], uint32(moovSize))
	copy(moov[4:8], []byte("moov"))
	copy(moov[8:8+len(mvhd)], mvhd)
	copy(moov[8+len(mvhd):], trak)

	return moov
}

func (m *MP4Muxer) buildMVHD() []byte {
	mvhd := make([]byte, 108)
	binary.BigEndian.PutUint32(mvhd[0:4], 108)
	copy(mvhd[4:8], []byte("mvhd"))
	mvhd[8] = 0
	mvhd[11] = 0
	binary.BigEndian.PutUint32(mvhd[12:16], 0)
	binary.BigEndian.PutUint32(mvhd[16:20], 0)
	binary.BigEndian.PutUint32(mvhd[20:24], m.timescale)
	binary.BigEndian.PutUint32(mvhd[24:28], m.duration)
	binary.BigEndian.PutUint32(mvhd[28:32], 0x00010000)
	binary.BigEndian.PutUint32(mvhd[32:36], 0)
	mvhd[76] = 1
	mvhd[77] = 0
	mvhd[81] = 1
	return mvhd
}

func (m *MP4Muxer) buildTRAK(totalFrames uint32) []byte {
	tkhd := m.buildTKHD()
	mdia := m.buildMDIA(totalFrames)

	trakSize := 8 + len(tkhd) + len(mdia)
	trak := make([]byte, trakSize)

	binary.BigEndian.PutUint32(trak[0:4], uint32(trakSize))
	copy(trak[4:8], []byte("trak"))
	copy(trak[8:8+len(tkhd)], tkhd)
	copy(trak[8+len(tkhd):], mdia)

	return trak
}

func (m *MP4Muxer) buildTKHD() []byte {
	tkhd := make([]byte, 92)
	binary.BigEndian.PutUint32(tkhd[0:4], 92)
	copy(tkhd[4:8], []byte("tkhd"))
	tkhd[8] = 0
	tkhd[11] = 0
	binary.BigEndian.PutUint32(tkhd[12:16], 0)
	binary.BigEndian.PutUint32(tkhd[16:20], 0)
	binary.BigEndian.PutUint32(tkhd[20:24], 1)
	binary.BigEndian.PutUint32(tkhd[24:28], m.duration)
	binary.BigEndian.PutUint32(tkhd[28:32], 0)
	binary.BigEndian.PutUint16(tkhd[32:34], 0)
	binary.BigEndian.PutUint16(tkhd[34:36], 0)
	binary.BigEndian.PutUint16(tkhd[36:38], 0)
	binary.BigEndian.PutUint32(tkhd[44:48], 0x00480000)
	binary.BigEndian.PutUint32(tkhd[48:52], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[52:56], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[56:60], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[60:64], 0x00480000)
	binary.BigEndian.PutUint32(tkhd[64:68], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[68:72], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[72:76], 0x00000000)
	binary.BigEndian.PutUint32(tkhd[76:80], 0x40000000)
	binary.BigEndian.PutUint16(tkhd[80:82], 1024)
	binary.BigEndian.PutUint16(tkhd[82:84], 768)
	return tkhd
}

func (m *MP4Muxer) buildMDIA(totalFrames uint32) []byte {
	mdhd := m.buildMDHD()
	hdlr := m.buildHDLR()
	minf := m.buildMINF(totalFrames)

	mdiaSize := 8 + len(mdhd) + len(hdlr) + len(minf)
	mdia := make([]byte, mdiaSize)

	binary.BigEndian.PutUint32(mdia[0:4], uint32(mdiaSize))
	copy(mdia[4:8], []byte("mdia"))
	copy(mdia[8:8+len(mdhd)], mdhd)
	copy(mdia[8+len(mdhd):8+len(mdhd)+len(hdlr)], hdlr)
	copy(mdia[8+len(mdhd)+len(hdlr):], minf)

	return mdia
}

func (m *MP4Muxer) buildMDHD() []byte {
	mdhd := make([]byte, 32)
	binary.BigEndian.PutUint32(mdhd[0:4], 32)
	copy(mdhd[4:8], []byte("mdhd"))
	mdhd[8] = 0
	mdhd[11] = 0
	binary.BigEndian.PutUint32(mdhd[12:16], 0)
	binary.BigEndian.PutUint32(mdhd[16:20], 0)
	binary.BigEndian.PutUint32(mdhd[20:24], m.timescale)
	binary.BigEndian.PutUint32(mdhd[24:28], m.duration)
	binary.BigEndian.PutUint16(mdhd[28:30], 0x55C4)
	binary.BigEndian.PutUint16(mdhd[30:32], 0)
	return mdhd
}

func (m *MP4Muxer) buildHDLR() []byte {
	hdlr := []byte{
		0x00, 0x00, 0x00, 0x21,
		'h', 'd', 'l', 'r',
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
		'v', 'i', 'd', 'e',
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
		'V', 'i', 'd', 'e', 'o', 'H', 'a', 'n', 'd', 'l', 'e', 'r', 0x00,
	}
	return hdlr
}

func (m *MP4Muxer) buildMINF(totalFrames uint32) []byte {
	vmhd := []byte{
		0x00, 0x00, 0x00, 0x14,
		'v', 'm', 'h', 'd',
		0x00, 0x00, 0x00, 0x01,
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
	}

	dinf := []byte{
		0x00, 0x00, 0x00, 0x24,
		'd', 'i', 'n', 'f',
		0x00, 0x00, 0x00, 0x1C,
		'd', 'r', 'e', 'f',
		0x00, 0x00, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x01,
		0x00, 0x00, 0x00, 0x0C,
		'u', 'r', 'l', ' ',
		0x00, 0x00, 0x00, 0x01,
	}

	stbl := m.buildSTBL(totalFrames)

	minfSize := 8 + len(vmhd) + len(dinf) + len(stbl)
	minf := make([]byte, minfSize)

	binary.BigEndian.PutUint32(minf[0:4], uint32(minfSize))
	copy(minf[4:8], []byte("minf"))
	copy(minf[8:8+len(vmhd)], vmhd)
	copy(minf[8+len(vmhd):8+len(vmhd)+len(dinf)], dinf)
	copy(minf[8+len(vmhd)+len(dinf):], stbl)

	return minf
}

func (m *MP4Muxer) buildSTBL(totalFrames uint32) []byte {
	stsd := m.buildSTSD()
	stts := m.buildSTTS(totalFrames)
	stsc := m.buildSTSC()
	stsz := m.buildSTSZ(totalFrames)
	stco := m.buildSTCO(totalFrames)

	stblSize := 8 + len(stsd) + len(stts) + len(stsc) + len(stsz) + len(stco)
	stbl := make([]byte, stblSize)

	binary.BigEndian.PutUint32(stbl[0:4], uint32(stblSize))
	copy(stbl[4:8], []byte("stbl"))
	copy(stbl[8:8+len(stsd)], stsd)
	copy(stbl[8+len(stsd):8+len(stsd)+len(stts)], stts)
	copy(stbl[8+len(stsd)+len(stts):8+len(stsd)+len(stts)+len(stsc)], stsc)
	copy(stbl[8+len(stsd)+len(stts)+len(stsc):8+len(stsd)+len(stts)+len(stsc)+len(stsz)], stsz)
	copy(stbl[8+len(stsd)+len(stts)+len(stsc)+len(stsz):], stco)

	return stbl
}

func (m *MP4Muxer) buildSTSD() []byte {
	avcC := []byte{
		0x00, 0x00, 0x00, 0x2F,
		'a', 'v', 'c', 'C',
		0x01, 0x42, 0xC0, 0x1E, 0xFF, 0xE1, 0x00, 0x0B,
		0x67, 0x42, 0xC0, 0x1E, 0xA9, 0x50, 0x14, 0x01, 0x6E, 0x40, 0x00,
		0x01, 0x00, 0x04, 0x68, 0xCE, 0x3C, 0x80,
	}

	avc1 := make([]byte, 86+len(avcC))
	binary.BigEndian.PutUint32(avc1[0:4], uint32(len(avc1)))
	copy(avc1[4:8], []byte("avc1"))
	binary.BigEndian.PutUint32(avc1[12:16], 1)
	binary.BigEndian.PutUint16(avc1[24:26], 1024)
	binary.BigEndian.PutUint16(avc1[26:28], 768)
	binary.BigEndian.PutUint32(avc1[28:32], 0x00480000)
	copy(avc1[38:54], []byte("AVC Coding"))
	binary.BigEndian.PutUint16(avc1[54:56], 24)
	binary.BigEndian.PutUint16(avc1[56:58], 65535)
	copy(avc1[86:], avcC)

	stsd := make([]byte, 8+len(avc1))
	binary.BigEndian.PutUint32(stsd[0:4], uint32(len(stsd)))
	copy(stsd[4:8], []byte("stsd"))
	binary.BigEndian.PutUint32(stsd[8:12], 0)
	binary.BigEndian.PutUint32(stsd[12:16], 1)
	copy(stsd[16:], avc1)

	return stsd
}

func (m *MP4Muxer) buildSTTS(totalFrames uint32) []byte {
	stts := make([]byte, 24)
	binary.BigEndian.PutUint32(stts[0:4], 24)
	copy(stts[4:8], []byte("stts"))
	binary.BigEndian.PutUint32(stts[8:12], 0)
	binary.BigEndian.PutUint32(stts[12:16], 1)
	binary.BigEndian.PutUint32(stts[16:20], totalFrames)
	binary.BigEndian.PutUint32(stts[20:24], uint32(m.timescale)/uint32(m.fps))
	return stts
}

func (m *MP4Muxer) buildSTSC() []byte {
	stsc := make([]byte, 28)
	binary.BigEndian.PutUint32(stsc[0:4], 28)
	copy(stsc[4:8], []byte("stsc"))
	binary.BigEndian.PutUint32(stsc[8:12], 0)
	binary.BigEndian.PutUint32(stsc[12:16], 1)
	binary.BigEndian.PutUint32(stsc[16:20], 1)
	binary.BigEndian.PutUint32(stsc[20:24], 1)
	binary.BigEndian.PutUint32(stsc[24:28], 1)
	return stsc
}

func (m *MP4Muxer) buildSTSZ(totalFrames uint32) []byte {
	stsz := make([]byte, 20+totalFrames*4)
	binary.BigEndian.PutUint32(stsz[0:4], uint32(len(stsz)))
	copy(stsz[4:8], []byte("stsz"))
	binary.BigEndian.PutUint32(stsz[8:12], 0)
	binary.BigEndian.PutUint32(stsz[12:16], 0)
	binary.BigEndian.PutUint32(stsz[16:20], totalFrames)

	frameSize := uint32(1024 * 768 * 3 / 10)
	for i := uint32(0); i < totalFrames; i++ {
		binary.BigEndian.PutUint32(stsz[20+i*4:24+i*4], frameSize)
	}
	return stsz
}

func (m *MP4Muxer) buildSTCO(totalFrames uint32) []byte {
	stco := make([]byte, 16+totalFrames*4)
	binary.BigEndian.PutUint32(stco[0:4], uint32(len(stco)))
	copy(stco[4:8], []byte("stco"))
	binary.BigEndian.PutUint32(stco[8:12], 0)
	binary.BigEndian.PutUint32(stco[12:16], totalFrames)

	offset := uint32(0x1000)
	frameSize := uint32(1024 * 768 * 3 / 10)
	for i := uint32(0); i < totalFrames; i++ {
		binary.BigEndian.PutUint32(stco[16+i*4:20+i*4], offset)
		offset += frameSize
	}
	return stco
}

func (m *MP4Muxer) buildMDAT(nalus [][]byte) []byte {
	totalSize := 8
	for _, nalu := range nalus {
		totalSize += 4 + len(nalu)
	}

	mdat := make([]byte, totalSize)
	binary.BigEndian.PutUint32(mdat[0:4], uint32(totalSize))
	copy(mdat[4:8], []byte("mdat"))

	offset := 8
	for _, nalu := range nalus {
		binary.BigEndian.PutUint32(mdat[offset:offset+4], uint32(len(nalu)))
		copy(mdat[offset+4:offset+4+len(nalu)], nalu)
		offset += 4 + len(nalu)
	}

	return mdat
}
