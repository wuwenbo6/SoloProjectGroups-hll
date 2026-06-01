package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"mini-rgw/model"
	"mini-rgw/store"
)

type WebAPIHandler struct {
	store *store.Store
}

func NewWebAPIHandler(s *store.Store) *WebAPIHandler {
	return &WebAPIHandler{store: s}
}

func (h *S3Handler) serveWebAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	path := r.URL.Path
	switch {
	case path == "/api/tenants" && r.Method == http.MethodGet:
		h.listTenants(w, r)
	case path == "/api/tenants" && r.Method == http.MethodPost:
		h.createTenant(w, r)
	case path == "/api/buckets" && r.Method == http.MethodGet:
		h.webListBuckets(w, r)
	case path == "/api/buckets" && r.Method == http.MethodPost:
		h.webCreateBucket(w, r)
	case path == "/api/objects" && r.Method == http.MethodGet:
		h.webListObjects(w, r)
	case path == "/api/objects" && r.Method == http.MethodPost:
		h.webPutObject(w, r)
	case path == "/api/objects/get" && r.Method == http.MethodPost:
		h.webGetObject(w, r)
	case path == "/api/multipart/initiate" && r.Method == http.MethodPost:
		h.webInitiateMultipart(w, r)
	case path == "/api/multipart/upload-part" && r.Method == http.MethodPost:
		h.webUploadPart(w, r)
	case path == "/api/multipart/complete" && r.Method == http.MethodPost:
		h.webCompleteMultipart(w, r)
	case path == "/api/multipart/abort" && r.Method == http.MethodPost:
		h.webAbortMultipart(w, r)
	case path == "/api/policy" && r.Method == http.MethodGet:
		h.webGetPolicy(w, r)
	case path == "/api/policy" && r.Method == http.MethodPut:
		h.webPutPolicy(w, r)
	case path == "/api/policy" && r.Method == http.MethodDelete:
		h.webDeletePolicy(w, r)
	case path == "/api/logs" && r.Method == http.MethodGet:
		h.webGetLogs(w, r)
	case path == "/api/logs/export" && r.Method == http.MethodGet:
		h.webExportLogs(w, r)
	case strings.HasPrefix(path, "/api/credentials") && r.Method == http.MethodGet:
		h.listCredentials(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (h *S3Handler) listTenants(w http.ResponseWriter, r *http.Request) {
	creds := h.store.ListCredentials("")
	seen := make(map[string]bool)
	var tenants []string
	for _, c := range creds {
		if !seen[c.TenantID] {
			seen[c.TenantID] = true
			tenants = append(tenants, c.TenantID)
		}
	}
	if tenants == nil {
		tenants = []string{}
	}
	jsonResp(w, tenants, http.StatusOK)
}

func (h *S3Handler) createTenant(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID        string `json:"tenant_id"`
		AccessKeyID     string `json:"access_key_id"`
		SecretAccessKey string `json:"secret_access_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.AccessKeyID == "" || req.SecretAccessKey == "" {
		jsonError(w, "tenant_id, access_key_id, and secret_access_key are required", http.StatusBadRequest)
		return
	}
	cred := &model.Credential{
		AccessKeyID:     req.AccessKeyID,
		SecretAccessKey: req.SecretAccessKey,
		TenantID:        req.TenantID,
	}
	if err := h.store.RegisterCredential(cred); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]string{
		"tenant_id":     req.TenantID,
		"access_key_id": req.AccessKeyID,
		"message":       "tenant created",
	}, http.StatusCreated)
}

func (h *S3Handler) webListBuckets(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		jsonError(w, "tenant_id is required", http.StatusBadRequest)
		return
	}
	buckets, err := h.store.ListBuckets(tenantID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if buckets == nil {
		buckets = []*model.Bucket{}
	}
	jsonResp(w, buckets, http.StatusOK)
}

func (h *S3Handler) webCreateBucket(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" {
		jsonError(w, "tenant_id and bucket_name are required", http.StatusBadRequest)
		return
	}
	if err := h.store.CreateBucket(req.TenantID, req.BucketName); err != nil {
		jsonError(w, err.Error(), http.StatusConflict)
		return
	}
	jsonResp(w, map[string]string{
		"tenant_id":   req.TenantID,
		"bucket_name": req.BucketName,
		"message":     "bucket created",
	}, http.StatusCreated)
}

func (h *S3Handler) webListObjects(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	bucketName := r.URL.Query().Get("bucket_name")
	if tenantID == "" || bucketName == "" {
		jsonError(w, "tenant_id and bucket_name are required", http.StatusBadRequest)
		return
	}
	objects, err := h.store.ListObjects(tenantID, bucketName, "")
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if objects == nil {
		objects = []*model.Object{}
	}
	jsonResp(w, objects, http.StatusOK)
}

func (h *S3Handler) webPutObject(w http.ResponseWriter, r *http.Request) {
	tenantID := r.FormValue("tenant_id")
	bucketName := r.FormValue("bucket_name")
	objectKey := r.FormValue("object_key")
	if tenantID == "" || bucketName == "" || objectKey == "" {
		jsonError(w, "tenant_id, bucket_name, and object_key are required", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	contentType := "application/octet-stream"
	obj, err := h.store.PutObject(tenantID, bucketName, objectKey, contentType, file)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, obj, http.StatusCreated)
}

func (h *S3Handler) webGetObject(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
		ObjectKey  string `json:"object_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	obj, file, err := h.store.GetObject(req.TenantID, req.BucketName, req.ObjectKey)
	if err != nil {
		jsonError(w, err.Error(), http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", obj.ContentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", obj.Size))
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(req.ObjectKey)))
	io.Copy(w, file)
}

func (h *S3Handler) listCredentials(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	creds := h.store.ListCredentials(tenantID)
	type credInfo struct {
		AccessKeyID string `json:"access_key_id"`
		TenantID    string `json:"tenant_id"`
	}
	var result []credInfo
	for _, c := range creds {
		result = append(result, credInfo{
			AccessKeyID: c.AccessKeyID,
			TenantID:    c.TenantID,
		})
	}
	if result == nil {
		result = []credInfo{}
	}
	jsonResp(w, result, http.StatusOK)
}

func jsonResp(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (h *S3Handler) webInitiateMultipart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
		ObjectKey  string `json:"object_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" || req.ObjectKey == "" {
		jsonError(w, "tenant_id, bucket_name, and object_key are required", http.StatusBadRequest)
		return
	}
	mpu, err := h.store.InitiateMultipartUpload(req.TenantID, req.BucketName, req.ObjectKey, "application/octet-stream")
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]string{
		"upload_id": mpu.UploadID,
		"bucket":    mpu.Bucket,
		"key":       mpu.Key,
		"tenant_id": mpu.TenantID,
	}, http.StatusOK)
}

func (h *S3Handler) webUploadPart(w http.ResponseWriter, r *http.Request) {
	tenantID := r.FormValue("tenant_id")
	bucketName := r.FormValue("bucket_name")
	uploadID := r.FormValue("upload_id")
	partNumberStr := r.FormValue("part_number")
	if tenantID == "" || bucketName == "" || uploadID == "" || partNumberStr == "" {
		jsonError(w, "tenant_id, bucket_name, upload_id, and part_number are required", http.StatusBadRequest)
		return
	}
	partNumber, err := strconv.Atoi(partNumberStr)
	if err != nil || partNumber < 1 || partNumber > 10000 {
		jsonError(w, "invalid part_number", http.StatusBadRequest)
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		jsonError(w, "file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()
	part, err := h.store.UploadPart(tenantID, bucketName, uploadID, partNumber, file)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]interface{}{
		"part_number": part.PartNumber,
		"etag":        part.ETag,
		"size":        part.Size,
	}, http.StatusOK)
}

func (h *S3Handler) webCompleteMultipart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
		UploadID   string `json:"upload_id"`
		Parts      []struct {
			PartNumber int    `json:"part_number"`
			ETag       string `json:"etag"`
		} `json:"parts"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" || req.UploadID == "" || len(req.Parts) == 0 {
		jsonError(w, "tenant_id, bucket_name, upload_id, and parts are required", http.StatusBadRequest)
		return
	}
	var partNumbers []int
	for _, p := range req.Parts {
		partNumbers = append(partNumbers, p.PartNumber)
	}
	obj, err := h.store.CompleteMultipartUpload(req.TenantID, req.BucketName, req.UploadID, partNumbers)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]interface{}{
		"key":  obj.Key,
		"etag": obj.ETag,
		"size": obj.Size,
	}, http.StatusOK)
}

func (h *S3Handler) webAbortMultipart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
		UploadID   string `json:"upload_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" || req.UploadID == "" {
		jsonError(w, "tenant_id, bucket_name, and upload_id are required", http.StatusBadRequest)
		return
	}
	if err := h.store.AbortMultipartUpload(req.TenantID, req.BucketName, req.UploadID); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]string{"message": "upload aborted"}, http.StatusOK)
}

func (h *S3Handler) webGetPolicy(w http.ResponseWriter, r *http.Request) {
	tenantID := r.URL.Query().Get("tenant_id")
	bucketName := r.URL.Query().Get("bucket_name")
	if tenantID == "" || bucketName == "" {
		jsonError(w, "tenant_id and bucket_name are required", http.StatusBadRequest)
		return
	}
	policy, err := h.store.GetBucketPolicy(tenantID, bucketName)
	if err != nil {
		jsonError(w, "no policy set on this bucket", http.StatusNotFound)
		return
	}
	jsonResp(w, policy, http.StatusOK)
}

func (h *S3Handler) webPutPolicy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string             `json:"tenant_id"`
		BucketName string             `json:"bucket_name"`
		Policy     model.BucketPolicy `json:"policy"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" {
		jsonError(w, "tenant_id and bucket_name are required", http.StatusBadRequest)
		return
	}
	if err := h.store.PutBucketPolicy(req.TenantID, req.BucketName, &req.Policy); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]string{"message": "policy updated"}, http.StatusOK)
}

func (h *S3Handler) webDeletePolicy(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID   string `json:"tenant_id"`
		BucketName string `json:"bucket_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TenantID == "" || req.BucketName == "" {
		jsonError(w, "tenant_id and bucket_name are required", http.StatusBadRequest)
		return
	}
	if err := h.store.DeleteBucketPolicy(req.TenantID, req.BucketName); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResp(w, map[string]string{"message": "policy deleted"}, http.StatusOK)
}

func (h *S3Handler) webGetLogs(w http.ResponseWriter, r *http.Request) {
	if h.accessLog == nil {
		jsonResp(w, []struct{}{}, http.StatusOK)
		return
	}
	tenantID := r.URL.Query().Get("tenant_id")
	bucket := r.URL.Query().Get("bucket_name")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	limit := 100
	offset := 0
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}
	entries := h.accessLog.Query(tenantID, bucket, startDate, endDate, limit, offset)
	if entries == nil {
		entries = []*model.AccessLogEntry{}
	}
	jsonResp(w, entries, http.StatusOK)
}

func (h *S3Handler) webExportLogs(w http.ResponseWriter, r *http.Request) {
	if h.accessLog == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	tenantID := r.URL.Query().Get("tenant_id")
	bucket := r.URL.Query().Get("bucket_name")
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	switch format {
	case "csv":
		data, err := h.accessLog.ExportCSV(tenantID, bucket, startDate, endDate)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=\"s3_access_log.csv\"")
		w.Write(data)
	default:
		data, err := h.accessLog.ExportJSON(tenantID, bucket, startDate, endDate)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=\"s3_access_log.json\"")
		w.Write(data)
	}
}
