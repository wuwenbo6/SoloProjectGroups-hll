package mp4

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"os"
	"time"
)

type TrackType int

const (
	TrackTypeVideo TrackType = iota
	TrackTypeAudio
)

type Sample struct {
	Data     []byte
	Duration uint32
	IsKey    bool
}

type Track struct {
	Type          TrackType
	Timescale     uint32
	Samples       []Sample
	Width         uint16
	Height        uint16
	FPS           float64
	Channels      uint16
	SampleRate    uint32
	SPS           []byte
	PPS           []byte
	AVCLenSize    int
	ASC           []byte
}

type MP4Parser struct {
	file   *os.File
	Tracks []*Track
}

func NewMP4Parser(filename string) (*MP4Parser, error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}

	parser := &MP4Parser{
		file:   file,
		Tracks: make([]*Track, 0),
	}

	if err := parser.parse(); err != nil {
		file.Close()
		return nil, err
	}

	return parser, nil
}

func (p *MP4Parser) Close() error {
	if p.file != nil {
		return p.file.Close()
	}
	return nil
}

func (p *MP4Parser) GetVideoTrack() *Track {
	for _, t := range p.Tracks {
		if t.Type == TrackTypeVideo {
			return t
		}
	}
	return nil
}

func (p *MP4Parser) GetAudioTrack() *Track {
	for _, t := range p.Tracks {
		if t.Type == TrackTypeAudio {
			return t
		}
	}
	return nil
}

func (p *MP4Parser) parse() error {
	if _, err := p.file.Seek(0, io.SeekStart); err != nil {
		return err
	}

	for {
		boxSize, boxType, err := p.readBoxHeader()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := currentPos + int64(boxSize) - 8

		switch boxType {
		case "moov":
			if err := p.parseMOOV(boxSize); err != nil {
				return fmt.Errorf("parse moov: %w", err)
			}
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return err
		}
	}

	if len(p.Tracks) == 0 {
		return errors.New("no tracks found")
	}

	return nil
}

func (p *MP4Parser) readBoxHeader() (uint64, string, error) {
	var size32 uint32
	if err := binary.Read(p.file, binary.BigEndian, &size32); err != nil {
		return 0, "", err
	}

	typeBytes := make([]byte, 4)
	if _, err := p.file.Read(typeBytes); err != nil {
		return 0, "", err
	}
	boxType := string(typeBytes)

	var size uint64
	if size32 == 1 {
		var size64 uint64
		if err := binary.Read(p.file, binary.BigEndian, &size64); err != nil {
			return 0, "", err
		}
		size = size64
	} else {
		size = uint64(size32)
	}

	return size, boxType, nil
}

func (p *MP4Parser) parseMOOV(size uint64) error {
	startPos, _ := p.file.Seek(0, io.SeekCurrent)
	endPos := startPos + int64(size) - 8

	for {
		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		if currentPos >= endPos {
			break
		}

		boxSize, boxType, err := p.readBoxHeader()
		if err != nil {
			return err
		}

		boxStart, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := boxStart + int64(boxSize) - 8

		switch boxType {
		case "trak":
			track, err := p.parseTRAK(boxSize)
			if err != nil {
				return fmt.Errorf("parse trak: %w", err)
			}
			if track != nil {
				p.Tracks = append(p.Tracks, track)
			}
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return err
		}
	}

	return nil
}

func (p *MP4Parser) parseTRAK(size uint64) (*Track, error) {
	startPos, _ := p.file.Seek(0, io.SeekCurrent)
	endPos := startPos + int64(size) - 8

	var trackType TrackType
	var timescale uint32
	var stsdData []byte
	var sttsData []byte
	var stszData []byte
	var stscData []byte
	var stcoData []byte
	var stssData []byte
	hasHandler := false

	for {
		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		if currentPos >= endPos {
			break
		}

		boxSize, boxType, err := p.readBoxHeader()
		if err != nil {
			return nil, err
		}

		boxStart, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := boxStart + int64(boxSize) - 8

		switch boxType {
		case "mdia":
			handlerType, ts, err := p.parseMDIA(boxSize, &stsdData, &sttsData, &stszData, &stscData, &stcoData, &stssData)
			if err != nil {
				return nil, err
			}
			hasHandler = true
			if handlerType == "vide" {
				trackType = TrackTypeVideo
			} else if handlerType == "soun" {
				trackType = TrackTypeAudio
			} else {
				p.file.Seek(nextBoxPos, io.SeekStart)
				continue
			}
			timescale = ts
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return nil, err
		}
	}

	if !hasHandler {
		return nil, nil
	}

	track := &Track{
		Type:       trackType,
		Timescale:  timescale,
		Samples:    make([]Sample, 0),
		AVCLenSize: 4,
	}

	if trackType == TrackTypeVideo {
		if err := p.parseAVCC(stsdData, track); err != nil {
			return nil, fmt.Errorf("parse avcC: %w", err)
		}
	} else if trackType == TrackTypeAudio {
		if err := p.parseESDS(stsdData, track); err != nil {
			return nil, fmt.Errorf("parse esds: %w", err)
		}
	}

	if err := p.buildSamples(sttsData, stszData, stscData, stcoData, stssData, track); err != nil {
		return nil, fmt.Errorf("build samples: %w", err)
	}

	return track, nil
}

func (p *MP4Parser) parseMDIA(size uint64, stsdData, sttsData, stszData, stscData, stcoData, stssData *[]byte) (string, uint32, error) {
	startPos, _ := p.file.Seek(0, io.SeekCurrent)
	endPos := startPos + int64(size) - 8

	var handlerType string
	var timescale uint32

	for {
		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		if currentPos >= endPos {
			break
		}

		boxSize, boxType, err := p.readBoxHeader()
		if err != nil {
			return "", 0, err
		}

		boxStart, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := boxStart + int64(boxSize) - 8

		switch boxType {
		case "mdhd":
			var tmp uint32
			if err := binary.Read(p.file, binary.BigEndian, &tmp); err != nil {
				return "", 0, err
			}
			if tmp>>24 == 1 {
				p.file.Seek(16, io.SeekCurrent)
			} else {
				p.file.Seek(8, io.SeekCurrent)
			}
			if err := binary.Read(p.file, binary.BigEndian, &timescale); err != nil {
				return "", 0, err
			}
		case "hdlr":
			htype := make([]byte, 4)
			p.file.Seek(8, io.SeekCurrent)
			if _, err := p.file.Read(htype); err != nil {
				return "", 0, err
			}
			handlerType = string(htype)
		case "minf":
			if err := p.parseMINF(boxSize, stsdData, sttsData, stszData, stscData, stcoData, stssData); err != nil {
				return "", 0, err
			}
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return "", 0, err
		}
	}

	return handlerType, timescale, nil
}

func (p *MP4Parser) parseMINF(size uint64, stsdData, sttsData, stszData, stscData, stcoData, stssData *[]byte) error {
	startPos, _ := p.file.Seek(0, io.SeekCurrent)
	endPos := startPos + int64(size) - 8

	for {
		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		if currentPos >= endPos {
			break
		}

		boxSize, boxType, err := p.readBoxHeader()
		if err != nil {
			return err
		}

		boxStart, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := boxStart + int64(boxSize) - 8

		switch boxType {
		case "stbl":
			if err := p.parseSTBL(boxSize, stsdData, sttsData, stszData, stscData, stcoData, stssData); err != nil {
				return err
			}
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return err
		}
	}

	return nil
}

func (p *MP4Parser) parseSTBL(size uint64, stsdData, sttsData, stszData, stscData, stcoData, stssData *[]byte) error {
	startPos, _ := p.file.Seek(0, io.SeekCurrent)
	endPos := startPos + int64(size) - 8

	for {
		currentPos, _ := p.file.Seek(0, io.SeekCurrent)
		if currentPos >= endPos {
			break
		}

		boxSize, boxType, err := p.readBoxHeader()
		if err != nil {
			return err
		}

		boxStart, _ := p.file.Seek(0, io.SeekCurrent)
		nextBoxPos := boxStart + int64(boxSize) - 8

		dataSize := boxSize - 8
		data := make([]byte, dataSize)
		if _, err := p.file.Read(data); err != nil {
			return err
		}

		switch boxType {
		case "stsd":
			*stsdData = data
		case "stts":
			*sttsData = data
		case "stsz":
			*stszData = data
		case "stsc":
			*stscData = data
		case "stco":
			*stcoData = data
		case "co64":
			*stcoData = data
		case "stss":
			*stssData = data
		}

		if _, err := p.file.Seek(nextBoxPos, io.SeekStart); err != nil {
			return err
		}
	}

	return nil
}

func (p *MP4Parser) parseAVCC(stsdData []byte, track *Track) error {
	if len(stsdData) < 8 {
		return errors.New("stsd data too short")
	}

	numEntries := binary.BigEndian.Uint32(stsdData[4:8])
	if numEntries < 1 {
		return errors.New("no sample description entries")
	}

	offset := 8
	if len(stsdData) < offset+16 {
		return errors.New("stsd entry too short")
	}

	dataFormat := string(stsdData[offset+8 : offset+12])
	if dataFormat != "avc1" {
		return fmt.Errorf("unsupported video codec: %s", dataFormat)
	}

	track.Width = binary.BigEndian.Uint16(stsdData[offset+24 : offset+26])
	track.Height = binary.BigEndian.Uint16(stsdData[offset+26 : offset+28])

	avcCOffset := offset + 78
	if len(stsdData) <= avcCOffset+8 {
		return errors.New("avcC box not found")
	}

	avcCSize := binary.BigEndian.Uint32(stsdData[avcCOffset : avcCOffset+4])
	avcCType := string(stsdData[avcCOffset+4 : avcCOffset+8])

	if avcCType != "avcC" {
		return fmt.Errorf("expected avcC, got %s", avcCType)
	}

	avcCData := stsdData[avcCOffset+8 : avcCOffset+int(avcCSize)]

	if len(avcCData) < 7 {
		return errors.New("avcC data too short")
	}

	track.AVCLenSize = int(avcCData[4]&0x03) + 1

	numSPS := int(avcCData[5] & 0x1F)
	pos := 6

	for i := 0; i < numSPS; i++ {
		if len(avcCData) < pos+2 {
			return errors.New("SPS truncated")
		}
		spsLen := int(binary.BigEndian.Uint16(avcCData[pos : pos+2]))
		pos += 2

		if len(avcCData) < pos+spsLen {
			return errors.New("SPS data truncated")
		}
		track.SPS = append(track.SPS, avcCData[pos:pos+spsLen]...)
		pos += spsLen
	}

	if len(avcCData) < pos+1 {
		return errors.New("PPS count missing")
	}
	numPPS := int(avcCData[pos])
	pos++

	for i := 0; i < numPPS; i++ {
		if len(avcCData) < pos+2 {
			return errors.New("PPS truncated")
		}
		ppsLen := int(binary.BigEndian.Uint16(avcCData[pos : pos+2]))
		pos += 2

		if len(avcCData) < pos+ppsLen {
			return errors.New("PPS data truncated")
		}
		track.PPS = append(track.PPS, avcCData[pos:pos+ppsLen]...)
		pos += ppsLen
	}

	return nil
}

func (p *MP4Parser) parseESDS(stsdData []byte, track *Track) error {
	if len(stsdData) < 8 {
		return errors.New("stsd data too short")
	}

	numEntries := binary.BigEndian.Uint32(stsdData[4:8])
	if numEntries < 1 {
		return errors.New("no sample description entries")
	}

	offset := 8
	if len(stsdData) < offset+20 {
		return errors.New("stsd entry too short")
	}

	dataFormat := string(stsdData[offset+8 : offset+12])
	if dataFormat != "mp4a" {
		return fmt.Errorf("unsupported audio codec: %s", dataFormat)
	}

	track.Channels = binary.BigEndian.Uint16(stsdData[offset+16 : offset+18])
	track.SampleRate = binary.BigEndian.Uint32(stsdData[offset+24 : offset+28]) >> 16

	esdsOffset := offset + 28
	for esdsOffset < len(stsdData)-8 {
		boxSize := int(binary.BigEndian.Uint32(stsdData[esdsOffset : esdsOffset+4]))
		boxType := string(stsdData[esdsOffset+4 : esdsOffset+8])

		if boxType == "esds" {
			esdsData := stsdData[esdsOffset+8 : esdsOffset+boxSize]
			return p.extractASCFromESDS(esdsData, track)
		}

		if boxSize <= 0 {
			break
		}
		esdsOffset += boxSize
	}

	return nil
}

func (p *MP4Parser) extractASCFromESDS(esdsData []byte, track *Track) error {
	pos := 4
	for pos < len(esdsData) {
		tag := esdsData[pos]
		pos++

		var size int
		for i := 0; i < 4; i++ {
			b := esdsData[pos]
			pos++
			size = (size << 7) | int(b&0x7F)
			if b&0x80 == 0 {
				break
			}
		}

		if tag == 0x03 {
			pos += 3
		} else if tag == 0x04 {
			pos += 13
		} else if tag == 0x05 {
			if pos+size <= len(esdsData) {
				track.ASC = make([]byte, size)
				copy(track.ASC, esdsData[pos:pos+size])
				return nil
			}
		} else {
			pos += size
		}
	}

	if len(track.ASC) == 0 {
		if track.Channels == 2 && track.SampleRate == 44100 {
			track.ASC = []byte{0x12, 0x10}
		} else if track.Channels == 2 && track.SampleRate == 48000 {
			track.ASC = []byte{0x11, 0x90}
		}
	}

	return nil
}

func (p *MP4Parser) buildSamples(sttsData, stszData, stscData, stcoData, stssData []byte, track *Track) error {
	sampleDurations, err := p.parseSTTS(sttsData)
	if err != nil {
		return err
	}

	sampleSizes, err := p.parseSTSZ(stszData)
	if err != nil {
		return err
	}

	sampleToChunk, err := p.parseSTSC(stscData)
	if err != nil {
		return err
	}

	chunkOffsets, err := p.parseSTCO(stcoData)
	if err != nil {
		return err
	}

	keyFrames := make(map[int]bool)
	if len(stssData) > 0 {
		kfs, err := p.parseSTSS(stssData)
		if err != nil {
			return err
		}
		for _, kf := range kfs {
			keyFrames[int(kf-1)] = true
		}
	}

	numSamples := len(sampleSizes)
	if numSamples == 0 {
		return errors.New("no samples")
	}

	if len(sampleDurations) == 1 {
		duration := sampleDurations[0]
		sampleDurations = make([]uint32, numSamples)
		for i := range sampleDurations {
			sampleDurations[i] = duration
		}
	} else if len(sampleDurations) < numSamples {
		return fmt.Errorf("sample duration count mismatch: %d vs %d", len(sampleDurations), numSamples)
	}

	sampleChunkIndex := make([]int, numSamples)
	sampleIndexInChunk := make([]int, numSamples)

	chunkIdx := 0
	sampleInChunk := 0
	samplesPerChunk := 0

	for sampleIdx := 0; sampleIdx < numSamples; sampleIdx++ {
		if sampleInChunk >= samplesPerChunk {
			chunkIdx++
			sampleInChunk = 0

			for j := len(sampleToChunk) - 1; j >= 0; j-- {
				if chunkIdx >= int(sampleToChunk[j].FirstChunk) {
					samplesPerChunk = int(sampleToChunk[j].SamplesPerChunk)
					break
				}
			}

			if samplesPerChunk == 0 {
				samplesPerChunk = 1
			}
		}

		sampleChunkIndex[sampleIdx] = chunkIdx - 1
		sampleIndexInChunk[sampleIdx] = sampleInChunk
		sampleInChunk++
	}

	track.Samples = make([]Sample, 0, numSamples)

	for sampleIdx := 0; sampleIdx < numSamples; sampleIdx++ {
		chunkIdx := sampleChunkIndex[sampleIdx]
		if chunkIdx < 0 || chunkIdx >= len(chunkOffsets) {
			return fmt.Errorf("chunk index out of range: %d", chunkIdx)
		}

		chunkOffset := chunkOffsets[chunkIdx]

		var offsetInChunk uint64
		for i := 0; i < sampleIndexInChunk[sampleIdx]; i++ {
			prevSampleIdx := sampleIdx - sampleIndexInChunk[sampleIdx] + i
			offsetInChunk += uint64(sampleSizes[prevSampleIdx])
		}

		sampleSize := sampleSizes[sampleIdx]
		sampleData := make([]byte, sampleSize)

		_, err := p.file.Seek(int64(chunkOffset+offsetInChunk), io.SeekStart)
		if err != nil {
			return fmt.Errorf("seek to sample: %w", err)
		}

		if _, err := io.ReadFull(p.file, sampleData); err != nil {
			return fmt.Errorf("read sample data: %w", err)
		}

		var finalData []byte
		if track.Type == TrackTypeVideo {
			finalData = p.convertAVCCToAnnexB(sampleData, track.AVCLenSize)
		} else {
			finalData = sampleData
		}

		isKey := keyFrames[sampleIdx]
		if track.Type == TrackTypeVideo && len(sampleData) > 4 {
			naluType := sampleData[4] & 0x1F
			isKey = isKey || (naluType == 5)
		}

		track.Samples = append(track.Samples, Sample{
			Data:     finalData,
			Duration: sampleDurations[sampleIdx],
			IsKey:    isKey,
		})
	}

	if track.Type == TrackTypeVideo && track.Timescale > 0 && len(track.Samples) > 1 {
		totalDuration := uint64(0)
		for _, s := range track.Samples {
			totalDuration += uint64(s.Duration)
		}
		track.FPS = float64(len(track.Samples)) * float64(track.Timescale) / float64(totalDuration)
	}

	return nil
}

func (p *MP4Parser) convertAVCCToAnnexB(data []byte, lengthSize int) []byte {
	var result []byte
	startCode := []byte{0x00, 0x00, 0x00, 0x01}

	pos := 0
	for pos < len(data) {
		if pos+lengthSize > len(data) {
			break
		}

		var naluLen int
		switch lengthSize {
		case 1:
			naluLen = int(data[pos])
			pos += 1
		case 2:
			naluLen = int(binary.BigEndian.Uint16(data[pos : pos+2]))
			pos += 2
		case 4:
			naluLen = int(binary.BigEndian.Uint32(data[pos : pos+4]))
			pos += 4
		default:
			return data
		}

		if naluLen <= 0 || pos+naluLen > len(data) {
			break
		}

		result = append(result, startCode...)
		result = append(result, data[pos:pos+naluLen]...)
		pos += naluLen
	}

	return result
}

func (p *MP4Parser) parseSTTS(data []byte) ([]uint32, error) {
	if len(data) < 8 {
		return nil, errors.New("stts data too short")
	}

	numEntries := binary.BigEndian.Uint32(data[4:8])
	var durations []uint32

	pos := 8
	for i := 0; i < int(numEntries); i++ {
		if len(data) < pos+8 {
			return nil, errors.New("stts entry truncated")
		}

		sampleCount := binary.BigEndian.Uint32(data[pos : pos+4])
		sampleDelta := binary.BigEndian.Uint32(data[pos+4 : pos+8])
		pos += 8

		for j := 0; j < int(sampleCount); j++ {
			durations = append(durations, sampleDelta)
		}
	}

	return durations, nil
}

func (p *MP4Parser) parseSTSZ(data []byte) ([]uint32, error) {
	if len(data) < 12 {
		return nil, errors.New("stsz data too short")
	}

	sampleSize := binary.BigEndian.Uint32(data[4:8])
	numSamples := binary.BigEndian.Uint32(data[8:12])

	if sampleSize != 0 {
		sizes := make([]uint32, numSamples)
		for i := range sizes {
			sizes[i] = sampleSize
		}
		return sizes, nil
	}

	sizes := make([]uint32, numSamples)
	pos := 12
	for i := 0; i < int(numSamples); i++ {
		if len(data) < pos+4 {
			return nil, errors.New("stsz size truncated")
		}
		sizes[i] = binary.BigEndian.Uint32(data[pos : pos+4])
		pos += 4
	}

	return sizes, nil
}

type SampleToChunkEntry struct {
	FirstChunk      uint32
	SamplesPerChunk uint32
	SampleDescIndex uint32
}

func (p *MP4Parser) parseSTSC(data []byte) ([]SampleToChunkEntry, error) {
	if len(data) < 8 {
		return nil, errors.New("stsc data too short")
	}

	numEntries := binary.BigEndian.Uint32(data[4:8])
	entries := make([]SampleToChunkEntry, numEntries)

	pos := 8
	for i := 0; i < int(numEntries); i++ {
		if len(data) < pos+12 {
			return nil, errors.New("stsc entry truncated")
		}

		entries[i].FirstChunk = binary.BigEndian.Uint32(data[pos : pos+4])
		entries[i].SamplesPerChunk = binary.BigEndian.Uint32(data[pos+4 : pos+8])
		entries[i].SampleDescIndex = binary.BigEndian.Uint32(data[pos+8 : pos+12])
		pos += 12
	}

	return entries, nil
}

func (p *MP4Parser) parseSTCO(data []byte) ([]uint64, error) {
	if len(data) < 8 {
		return nil, errors.New("stco data too short")
	}

	numEntries := binary.BigEndian.Uint32(data[4:8])
	offsets := make([]uint64, numEntries)

	pos := 8
	for i := 0; i < int(numEntries); i++ {
		if len(data) < pos+4 {
			if len(data) < pos+8 {
				return nil, errors.New("stco entry truncated")
			}
			offsets[i] = binary.BigEndian.Uint64(data[pos : pos+8])
			pos += 8
		} else {
			offsets[i] = uint64(binary.BigEndian.Uint32(data[pos : pos+4]))
			pos += 4
		}
	}

	return offsets, nil
}

func (p *MP4Parser) parseSTSS(data []byte) ([]uint32, error) {
	if len(data) < 8 {
		return nil, errors.New("stss data too short")
	}

	numEntries := binary.BigEndian.Uint32(data[4:8])
	samples := make([]uint32, numEntries)

	pos := 8
	for i := 0; i < int(numEntries); i++ {
		if len(data) < pos+4 {
			return nil, errors.New("stss entry truncated")
		}
		samples[i] = binary.BigEndian.Uint32(data[pos : pos+4])
		pos += 4
	}

	return samples, nil
}

func (t *Track) ExtractNALUs(data []byte) [][]byte {
	var nalus [][]byte

	for len(data) >= 4 {
		if data[0] == 0x00 && data[1] == 0x00 && data[2] == 0x00 && data[3] == 0x01 {
			rest := data[4:]
			nextStart := -1

			for i := 0; i < len(rest)-3; i++ {
				if rest[i] == 0x00 && rest[i+1] == 0x00 && rest[i+2] == 0x00 && rest[i+3] == 0x01 {
					nextStart = i
					break
				}
			}

			var nalu []byte
			if nextStart >= 0 {
				nalu = rest[:nextStart]
				data = rest[nextStart:]
			} else {
				nalu = rest
				data = nil
			}

			if len(nalu) > 0 {
				nalus = append(nalus, nalu)
			}
		} else {
			break
		}
	}

	return nalus
}

func (t *Track) GetSampleDuration() time.Duration {
	if t.Timescale == 0 {
		return time.Second / 30
	}

	if len(t.Samples) == 0 {
		return time.Second / 30
	}

	totalDuration := uint64(0)
	for _, s := range t.Samples {
		totalDuration += uint64(s.Duration)
	}

	avgDuration := float64(totalDuration) / float64(len(t.Samples))
	return time.Duration(avgDuration * float64(time.Second) / float64(t.Timescale))
}

func (t *Track) GetTimestampIncrement(clockRate uint32) uint32 {
	if t.Timescale == 0 || len(t.Samples) == 0 {
		return 3000
	}

	totalDuration := uint64(0)
	for _, s := range t.Samples {
		totalDuration += uint64(s.Duration)
	}
	avgDuration := totalDuration / uint64(len(t.Samples))

	return uint32(float64(avgDuration) * float64(clockRate) / float64(t.Timescale))
}

func (t *Track) GetTotalDuration() float64 {
	if t.Timescale == 0 || len(t.Samples) == 0 {
		return 0
	}

	totalDuration := uint64(0)
	for _, s := range t.Samples {
		totalDuration += uint64(s.Duration)
	}

	return float64(totalDuration) / float64(t.Timescale)
}

func (t *Track) GetSampleIndexByTime(npt float64) int {
	if t.Timescale == 0 || len(t.Samples) == 0 {
		return 0
	}

	targetTime := uint64(npt * float64(t.Timescale))

	var cumulativeTime uint64
	for i, s := range t.Samples {
		if cumulativeTime+uint64(s.Duration) > targetTime {
			keyFrameIdx := t.findNearestKeyFrame(i)
			return keyFrameIdx
		}
		cumulativeTime += uint64(s.Duration)
	}

	return 0
}

func (t *Track) findNearestKeyFrame(sampleIndex int) int {
	for i := sampleIndex; i >= 0; i-- {
		if t.Samples[i].IsKey {
			return i
		}
	}
	return 0
}

func (t *Track) GetRTPTimestampAtSample(sampleIndex int, clockRate uint32) uint32 {
	if t.Timescale == 0 {
		return 0
	}

	var cumulativeTime uint64
	for i := 0; i < sampleIndex && i < len(t.Samples); i++ {
		cumulativeTime += uint64(t.Samples[i].Duration)
	}

	return uint32(float64(cumulativeTime) * float64(clockRate) / float64(t.Timescale))
}

func (t *Track) GetSampleTimestampIncrement(sampleIndex int, clockRate uint32) uint32 {
	if t.Timescale == 0 || sampleIndex >= len(t.Samples) {
		return t.GetTimestampIncrement(clockRate)
	}

	duration := t.Samples[sampleIndex].Duration
	return uint32(float64(duration) * float64(clockRate) / float64(t.Timescale))
}
