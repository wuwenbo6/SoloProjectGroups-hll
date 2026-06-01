package handler

import (
	"encoding/json"
	"lma/internal/cache"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

type PBURequest struct {
	MNPrefix   string `json:"mn_prefix"`
	MAGAddress  string `json:"mag_address"`
	Lifetime     uint16 `json:"lifetime"`
}

type PBUResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

type Handler struct {
	cache *cache.BindingCache
}

func NewHandler(c *cache.BindingCache) *Handler {
	return &Handler{cache: c}
}

func (h *Handler) HandlePBU(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PBURequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.MNPrefix == "" || req.MAGAddress == "" {
		http.Error(w, "mn_prefix and mag_address are required", http.StatusBadRequest)
		return
	}

	if req.Lifetime == 0 {
		req.Lifetime = 3600
	}

	h.cache.AddOrUpdate(req.MNPrefix, req.MAGAddress, req.Lifetime)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(PBUResponse{
		Status:  "success",
		Message: "PBU processed successfully",
	})
}

func (h *Handler) GetBindings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	bindings := h.cache.GetAll()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bindings)
}

func (h *Handler) ServeStatic(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		_, filename, _, _ := runtime.Caller(0)
		staticPath := filepath.Join(filepath.Dir(filename), "..", "..", "static", "index.html")
		
		content, err := os.ReadFile(staticPath)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(content)
		return
	}
	http.NotFound(w, r)
}
