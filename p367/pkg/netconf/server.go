package netconf

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"netconf-validator/pkg/yangvalidator"
)

type Server struct {
	modelsDir    string
	dataStoreDir string
	baselineDir  string
	models       map[string]string
	baselines    map[string]BaselineData
	mu           sync.RWMutex
}

type BaselineData struct {
	Data       string `json:"data"`
	DataFormat string `json:"dataFormat"`
}

type UploadResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ValidateRequest struct {
	ModelName  string `json:"modelName"`
	Data       string `json:"data"`
	DataFormat string `json:"dataFormat"`
}

type ValidateResponse struct {
	Success bool                            `json:"success"`
	Errors  []yangvalidator.ValidationError `json:"errors"`
	Message string                          `json:"message"`
}

type ModelsListResponse struct {
	Success bool     `json:"success"`
	Models  []string `json:"models"`
}

type BaselineSaveRequest struct {
	ModelName  string `json:"modelName"`
	Data       string `json:"data"`
	DataFormat string `json:"dataFormat"`
}

type BaselineSaveResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type BaselineGetResponse struct {
	Success    bool   `json:"success"`
	Data       string `json:"data"`
	DataFormat string `json:"dataFormat"`
}

type DiffRequest struct {
	ModelName  string `json:"modelName"`
	Data       string `json:"data"`
	DataFormat string `json:"dataFormat"`
}

type DiffResponse struct {
	Success bool                    `json:"success"`
	Diffs   []yangvalidator.DiffResult `json:"diffs"`
	HasDiff bool                   `json:"hasDiff"`
	Message string                 `json:"message"`
}

func NewServer(modelsDir, dataStoreDir string) *Server {
	os.MkdirAll(modelsDir, 0755)
	os.MkdirAll(dataStoreDir, 0755)
	baselineDir := filepath.Join(dataStoreDir, "baselines")
	os.MkdirAll(baselineDir, 0755)

	return &Server{
		modelsDir:    modelsDir,
		dataStoreDir: dataStoreDir,
		baselineDir:  baselineDir,
		models:       make(map[string]string),
		baselines:    make(map[string]BaselineData),
	}
}

func (s *Server) LoadModels() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, err := os.ReadDir(s.modelsDir)
	if err != nil {
		return err
	}

	for _, file := range files {
		if filepath.Ext(file.Name()) == ".yang" {
			content, err := os.ReadFile(filepath.Join(s.modelsDir, file.Name()))
			if err != nil {
				continue
			}
			modelName := file.Name()[:len(file.Name())-5]
			s.models[modelName] = string(content)
		}
	}

	return nil
}

func (s *Server) LoadBaselines() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	files, err := os.ReadDir(s.baselineDir)
	if err != nil {
		return err
	}

	for _, file := range files {
		if filepath.Ext(file.Name()) == ".json" {
			content, err := os.ReadFile(filepath.Join(s.baselineDir, file.Name()))
			if err != nil {
				continue
			}
			modelName := file.Name()[:len(file.Name())-5]
			var baseline BaselineData
			if err := json.Unmarshal(content, &baseline); err == nil {
				s.baselines[modelName] = baseline
			}
		}
	}

	return nil
}

func (s *Server) UploadModelHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Failed to get file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	content, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file: "+err.Error(), http.StatusBadRequest)
		return
	}

	modelName := r.FormValue("name")
	if modelName == "" {
		modelName = "uploaded-model"
	}

	s.mu.Lock()
	s.models[modelName] = string(content)
	s.mu.Unlock()

	err = os.WriteFile(filepath.Join(s.modelsDir, modelName+".yang"), content, 0644)
	if err != nil {
		http.Error(w, "Failed to save model: "+err.Error(), http.StatusInternalServerError)
		return
	}

	response := UploadResponse{
		Success: true,
		Message: fmt.Sprintf("Model '%s' uploaded successfully", modelName),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) ValidateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ValidateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	modelContent, exists := s.models[req.ModelName]
	s.mu.RUnlock()

	if !exists {
		response := ValidateResponse{
			Success: false,
			Message: fmt.Sprintf("Model '%s' not found", req.ModelName),
			Errors:  []yangvalidator.ValidationError{},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	errors, err := yangvalidator.ValidateAgainstYANG(modelContent, req.Data, req.DataFormat)
	if err != nil {
		response := ValidateResponse{
			Success: false,
			Message: "Validation error: " + err.Error(),
			Errors:  []yangvalidator.ValidationError{},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := ValidateResponse{
		Success: len(errors) == 0,
		Errors:  errors,
		Message: fmt.Sprintf("Validation completed with %d errors", len(errors)),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) ModelsHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	s.mu.RLock()
	modelNames := make([]string, 0, len(s.models))
	for name := range s.models {
		modelNames = append(modelNames, name)
	}
	s.mu.RUnlock()

	response := ModelsListResponse{
		Success: true,
		Models:  modelNames,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) GetModelHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	modelName := r.URL.Query().Get("name")
	if modelName == "" {
		http.Error(w, "Model name is required", http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	modelContent, exists := s.models[modelName]
	s.mu.RUnlock()

	if !exists {
		http.Error(w, "Model not found", http.StatusNotFound)
		return
	}

	schema, err := yangvalidator.ParseYANG(modelContent)
	if err != nil {
		http.Error(w, "Failed to parse model: "+err.Error(), http.StatusInternalServerError)
		return
	}

	structure := yangvalidator.GetSchemaStructure(schema, 0)

	w.Header().Set("Content-Type", "text/plain")
	w.Write([]byte(structure))
}

func (s *Server) SaveBaselineHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BaselineSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ModelName == "" {
		http.Error(w, "Model name is required", http.StatusBadRequest)
		return
	}

	baseline := BaselineData{
		Data:       req.Data,
		DataFormat: req.DataFormat,
	}

	s.mu.Lock()
	s.baselines[req.ModelName] = baseline
	s.mu.Unlock()

	data, _ := json.Marshal(baseline)
	err := os.WriteFile(filepath.Join(s.baselineDir, req.ModelName+".json"), data, 0644)
	if err != nil {
		http.Error(w, "Failed to save baseline: "+err.Error(), http.StatusInternalServerError)
		return
	}

	response := BaselineSaveResponse{
		Success: true,
		Message: fmt.Sprintf("Baseline for model '%s' saved successfully", req.ModelName),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) GetBaselineHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	modelName := r.URL.Query().Get("modelName")
	if modelName == "" {
		http.Error(w, "Model name is required", http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	baseline, exists := s.baselines[modelName]
	s.mu.RUnlock()

	if !exists {
		response := BaselineGetResponse{
			Success: false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	response := BaselineGetResponse{
		Success:    true,
		Data:       baseline.Data,
		DataFormat: baseline.DataFormat,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) DiffHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req DiffRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if req.ModelName == "" {
		http.Error(w, "Model name is required", http.StatusBadRequest)
		return
	}

	s.mu.RLock()
	baseline, exists := s.baselines[req.ModelName]
	s.mu.RUnlock()

	if !exists {
		response := DiffResponse{
			Success: false,
			Message: "No baseline found for this model",
			HasDiff: false,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
		return
	}

	var baseNode, currentNode *yangvalidator.DataNode
	var err error

	if strings.ToLower(baseline.DataFormat) == "json" {
		baseNode, err = yangvalidator.ParseJSONData(baseline.Data)
	} else {
		baseNode, err = yangvalidator.ParseXMLData(baseline.Data)
	}
	if err != nil {
		http.Error(w, "Failed to parse baseline data: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if strings.ToLower(req.DataFormat) == "json" {
		currentNode, err = yangvalidator.ParseJSONData(req.Data)
	} else {
		currentNode, err = yangvalidator.ParseXMLData(req.Data)
	}
	if err != nil {
		http.Error(w, "Failed to parse current data: "+err.Error(), http.StatusInternalServerError)
		return
	}

	diffs := yangvalidator.CompareDataNodes(baseNode, currentNode)

	response := DiffResponse{
		Success: true,
		Diffs:   diffs,
		HasDiff: len(diffs) > 0,
		Message: fmt.Sprintf("Found %d differences", len(diffs)),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Server) SetupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/upload", s.UploadModelHandler)
	mux.HandleFunc("/api/validate", s.ValidateHandler)
	mux.HandleFunc("/api/models", s.ModelsHandler)
	mux.HandleFunc("/api/model", s.GetModelHandler)
	mux.HandleFunc("/api/baseline", s.SaveBaselineHandler)
	mux.HandleFunc("/api/baseline/get", s.GetBaselineHandler)
	mux.HandleFunc("/api/diff", s.DiffHandler)
}
