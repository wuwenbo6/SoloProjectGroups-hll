package handler

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"lma/internal/imgutil"
	"net/http"
	"path"
	"strings"
	"time"
)

type BatchConvertRequest struct {
	Format  string   `json:"format"`
	Quality int      `json:"quality"`
	Files   []string `json:"files"`
}

type FormatInfo struct {
	Name      string `json:"name"`
	Available bool   `json:"available"`
}

func (h *Handler) HandleImageConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Missing image field", http.StatusBadRequest)
		return
	}
	defer file.Close()

	format := r.FormValue("format")
	if format == "" {
		format = "png"
	}

	quality := 0
	if q := r.FormValue("quality"); q != "" {
		fmt.Sscanf(q, "%d", &quality)
	}

	data, err := imgutil.Convert(file, imgutil.ConvertOptions{Format: format, Quality: quality})
	if err != nil {
		http.Error(w, fmt.Sprintf("Convert failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", imgutil.FormatContentType(format))
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s%s\"",
		strings.TrimSuffix(header.Filename, path.Ext(header.Filename)),
		imgutil.FormatExtension(format)))
	w.Write(data)
}

func (h *Handler) HandleBatchConvert(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if err := r.ParseMultipartForm(100 << 20); err != nil {
		http.Error(w, fmt.Sprintf("Parse multipart form failed: %v", err), http.StatusBadRequest)
		return
	}

	format := r.FormValue("format")
	if format == "" {
		format = "png"
	}

	quality := 0
	if q := r.FormValue("quality"); q != "" {
		fmt.Sscanf(q, "%d", &quality)
	}

	files := r.MultipartForm.File["images"]
	if len(files) == 0 {
		http.Error(w, "No images uploaded", http.StatusBadRequest)
		return
	}

	if len(files) == 1 {
		file, err := files[0].Open()
		if err != nil {
			http.Error(w, "Failed to open uploaded file", http.StatusInternalServerError)
			return
		}
		defer file.Close()

		data, err := imgutil.Convert(file, imgutil.ConvertOptions{Format: format, Quality: quality})
		if err != nil {
			http.Error(w, fmt.Sprintf("Convert failed: %v", err), http.StatusInternalServerError)
			return
		}

		baseName := strings.TrimSuffix(files[0].Filename, path.Ext(files[0].Filename))
		ext := imgutil.FormatExtension(format)
		w.Header().Set("Content-Type", imgutil.FormatContentType(format))
		w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=\"%s%s\"", baseName, ext))
		w.Write(data)
		return
	}

	zipBuf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(zipBuf)

	for _, fh := range files {
		file, err := fh.Open()
		if err != nil {
			continue
		}

		imgData, _, err := image.Decode(file)
		file.Close()
		if err != nil {
			continue
		}

		converted, err := imgutil.ConvertSingle(imgData, format, quality)
		if err != nil {
			continue
		}

		baseName := strings.TrimSuffix(fh.Filename, path.Ext(fh.Filename))
		ext := imgutil.FormatExtension(format)
		zipEntryName := baseName + ext

		wf, err := zipWriter.Create(zipEntryName)
		if err != nil {
			continue
		}

		wf.Write(converted)
	}

	zipWriter.Close()

	timestamp := time.Now().Format("20060102_150405")
	zipName := fmt.Sprintf("converted_%s.zip", timestamp)

	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", zipName))
	w.Write(zipBuf.Bytes())
}

func (h *Handler) HandleFormats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	available := imgutil.AvailableFormats()
	formats := make([]FormatInfo, 0)
	for _, name := range imgutil.SupportedFormats() {
		formats = append(formats, FormatInfo{
			Name:      name,
			Available: available[name],
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(formats)
}
