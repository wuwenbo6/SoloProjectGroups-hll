package handler

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"path"
	"strconv"
	"strings"
	"time"

	"mini-rgw/accesslog"
	"mini-rgw/auth"
	"mini-rgw/model"
	"mini-rgw/store"
)

type contextKey struct{}

type Context struct {
	TenantID    string
	AccessKeyID string
}

func withContext(r *http.Request, ctx Context) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), contextKey{}, ctx))
}

func fromContext(r *http.Request) Context {
	val, _ := r.Context().Value(contextKey{}).(Context)
	return val
}

type S3Handler struct {
	store     *store.Store
	signer    *auth.Signer
	policy    *auth.PolicyChecker
	accessLog *accesslog.Logger
}

func NewS3Handler(s *store.Store, signer *auth.Signer, al *accesslog.Logger) *S3Handler {
	return &S3Handler{
		store:     s,
		signer:    signer,
		policy:    auth.NewPolicyChecker(),
		accessLog: al,
	}
}

func isS3Request(r *http.Request) bool {
	a := r.Header.Get("Authorization")
	if strings.HasPrefix(a, "AWS4-HMAC-SHA256") {
		return true
	}
	if r.URL.Query().Get("X-Amz-Signature") != "" {
		return true
	}
	return false
}

func (h *S3Handler) logAccess(r *http.Request, bucket, objectKey, operation string, statusCode int, errorCode string, bytesSent int64) {
	if h.accessLog == nil {
		return
	}
	ctx := fromContext(r)
	h.accessLog.Log(&model.AccessLogEntry{
		Timestamp:   time.Now().UTC(),
		RemoteIP:    strings.Split(r.RemoteAddr, ":")[0],
		TenantID:    ctx.TenantID,
		AccessKeyID: ctx.AccessKeyID,
		Bucket:      bucket,
		ObjectKey:   objectKey,
		Operation:   operation,
		HTTPMethod:  r.Method,
		StatusCode:  statusCode,
		ErrorCode:   errorCode,
		BytesSent:   bytesSent,
		UserAgent:   r.UserAgent(),
		RequestID:   fmt.Sprintf("req-%d", time.Now().UnixNano()),
	})
}

func (h *S3Handler) checkPolicy(r *http.Request, bucket, objectKey string) error {
	ctx := fromContext(r)
	policy, err := h.store.GetBucketPolicy(ctx.TenantID, bucket)
	if err != nil || policy == nil {
		return nil
	}
	action := auth.MapOperationToAction(r.Method, r.URL.Path)
	resource := auth.FormatResource(bucket, objectKey)
	if !h.policy.Check(policy, ctx.TenantID, action, resource) {
		return fmt.Errorf("access denied by bucket policy")
	}
	return nil
}

func (h *S3Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		h.serveWebAPI(w, r)
		return
	}

	if r.URL.Path == "/_health" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/web/") || r.URL.Path == "/web" || r.URL.Path == "/web/" {
		h.serveWebUI(w, r)
		return
	}

	if r.URL.Path == "/" && !isS3Request(r) {
		h.serveWebUI(w, r)
		return
	}

	authResult, err := h.signer.Authenticate(r)
	if err != nil {
		w.Header().Set("WWW-Authenticate", "AWS4-HMAC-SHA256")
		writeS3Error(w, "AccessDenied", err.Error(), http.StatusForbidden)
		return
	}
	r = withContext(r, Context{
		TenantID:    authResult.TenantID,
		AccessKeyID: authResult.AccessKeyID,
	})

	reqPath := r.URL.Path
	if reqPath == "" || reqPath == "/" {
		h.listAllBuckets(w, r)
		return
	}

	parts := strings.SplitN(strings.TrimPrefix(reqPath, "/"), "/", 2)
	bucketName := parts[0]

	if len(parts) == 1 || parts[1] == "" {
		h.handleBucketLevel(w, r, bucketName)
		return
	}

	objectKey := parts[1]
	h.handleObjectLevel(w, r, bucketName, objectKey)
}

func (h *S3Handler) handleBucketLevel(w http.ResponseWriter, r *http.Request, bucketName string) {
	q := r.URL.Query()

	if r.Method == http.MethodDelete && q.Has("policy") {
		h.deleteBucketPolicy(w, r, bucketName)
		return
	}
	if r.Method == http.MethodGet && q.Has("policy") {
		h.getBucketPolicy(w, r, bucketName)
		return
	}
	if r.Method == http.MethodPut && q.Has("policy") {
		h.putBucketPolicy(w, r, bucketName)
		return
	}

	if err := h.checkPolicy(r, bucketName, ""); err != nil {
		op := auth.MapOperationToAction(r.Method, r.URL.Path)
		h.logAccess(r, bucketName, "", op, http.StatusForbidden, "AccessDenied", 0)
		writeS3Error(w, "AccessDenied", err.Error(), http.StatusForbidden)
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.createBucket(w, r, bucketName)
	case http.MethodGet:
		h.listObjects(w, r, bucketName)
	case http.MethodHead:
		h.headBucket(w, r, bucketName)
	case http.MethodDelete:
		h.deleteBucket(w, r, bucketName)
	default:
		writeS3Error(w, "InvalidRequest", "unsupported method", http.StatusBadRequest)
	}
}

func (h *S3Handler) handleObjectLevel(w http.ResponseWriter, r *http.Request, bucketName, objectKey string) {
	q := r.URL.Query()

	if q.Has("uploads") && r.Method == http.MethodPost {
		if err := h.checkPolicy(r, bucketName, objectKey); err != nil {
			h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusForbidden, "AccessDenied", 0)
			writeS3Error(w, "AccessDenied", err.Error(), http.StatusForbidden)
			return
		}
		h.initiateMultipartUpload(w, r, bucketName, objectKey)
		return
	}

	if uploadID := q.Get("uploadId"); uploadID != "" {
		if err := h.checkPolicy(r, bucketName, objectKey); err != nil {
			op := auth.MapOperationToAction(r.Method, r.URL.Path)
			h.logAccess(r, bucketName, objectKey, op, http.StatusForbidden, "AccessDenied", 0)
			writeS3Error(w, "AccessDenied", err.Error(), http.StatusForbidden)
			return
		}
		switch r.Method {
		case http.MethodPut:
			if partNumberStr := q.Get("partNumber"); partNumberStr != "" {
				h.uploadPart(w, r, bucketName, objectKey, uploadID, partNumberStr)
				return
			}
		case http.MethodPost:
			h.completeMultipartUpload(w, r, bucketName, objectKey, uploadID)
			return
		case http.MethodDelete:
			h.abortMultipartUpload(w, r, bucketName, objectKey, uploadID)
			return
		}
	}

	if err := h.checkPolicy(r, bucketName, objectKey); err != nil {
		op := auth.MapOperationToAction(r.Method, r.URL.Path)
		h.logAccess(r, bucketName, objectKey, op, http.StatusForbidden, "AccessDenied", 0)
		writeS3Error(w, "AccessDenied", err.Error(), http.StatusForbidden)
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.putObject(w, r, bucketName, objectKey)
	case http.MethodGet:
		h.getObject(w, r, bucketName, objectKey)
	case http.MethodHead:
		h.headObject(w, r, bucketName, objectKey)
	default:
		writeS3Error(w, "InvalidRequest", "unsupported method", http.StatusBadRequest)
	}
}

func (h *S3Handler) createBucket(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if !h.store.BucketExists(ctx.TenantID, bucketName) {
		if err := h.store.CreateBucket(ctx.TenantID, bucketName); err != nil {
			h.logAccess(r, bucketName, "", "s3:CreateBucket", http.StatusConflict, "BucketAlreadyExists", 0)
			writeS3Error(w, "BucketAlreadyExists", err.Error(), http.StatusConflict)
			return
		}
	}
	h.logAccess(r, bucketName, "", "s3:CreateBucket", http.StatusOK, "", 0)
	w.Header().Set("Location", "/"+bucketName)
	w.WriteHeader(http.StatusOK)
}

func (h *S3Handler) headBucket(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if !h.store.BucketExists(ctx.TenantID, bucketName) {
		h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusNotFound, "NoSuchBucket", 0)
		writeS3Error(w, "NoSuchBucket", "The specified bucket does not exist", http.StatusNotFound)
		return
	}
	h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusOK, "", 0)
	w.WriteHeader(http.StatusOK)
}

func (h *S3Handler) deleteBucket(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if !h.store.BucketExists(ctx.TenantID, bucketName) {
		h.logAccess(r, bucketName, "", "s3:DeleteBucket", http.StatusNotFound, "NoSuchBucket", 0)
		writeS3Error(w, "NoSuchBucket", "The specified bucket does not exist", http.StatusNotFound)
		return
	}
	h.logAccess(r, bucketName, "", "s3:DeleteBucket", http.StatusNoContent, "", 0)
	w.WriteHeader(http.StatusNoContent)
}

func (h *S3Handler) putObject(w http.ResponseWriter, r *http.Request, bucketName, objectKey string) {
	ctx := fromContext(r)
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	obj, err := h.store.PutObject(ctx.TenantID, bucketName, objectKey, contentType, r.Body)
	if err != nil {
		if strings.Contains(err.Error(), "bucket does not exist") {
			h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusNotFound, "NoSuchBucket", 0)
			writeS3Error(w, "NoSuchBucket", err.Error(), http.StatusNotFound)
			return
		}
		h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusInternalServerError, "InternalError", 0)
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusOK, "", obj.Size)
	w.Header().Set("ETag", "\""+obj.ETag+"\"")
	w.WriteHeader(http.StatusOK)
}

func (h *S3Handler) getObject(w http.ResponseWriter, r *http.Request, bucketName, objectKey string) {
	ctx := fromContext(r)
	obj, file, err := h.store.GetObject(ctx.TenantID, bucketName, objectKey)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusNotFound, "NoSuchKey", 0)
			writeS3Error(w, "NoSuchKey", "The specified key does not exist", http.StatusNotFound)
			return
		}
		h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusInternalServerError, "InternalError", 0)
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusOK, "", obj.Size)
	w.Header().Set("Content-Type", obj.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	w.Header().Set("ETag", "\""+obj.ETag+"\"")
	w.Header().Set("Last-Modified", obj.LastModified.Format(time.RFC1123))
	w.Header().Set("x-amz-request-id", fmt.Sprintf("req-%d", time.Now().UnixNano()))
	io.Copy(w, file)
}

func (h *S3Handler) headObject(w http.ResponseWriter, r *http.Request, bucketName, objectKey string) {
	ctx := fromContext(r)
	obj, file, err := h.store.GetObject(ctx.TenantID, bucketName, objectKey)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusNotFound, "NoSuchKey", 0)
			writeS3Error(w, "NoSuchKey", "The specified key does not exist", http.StatusNotFound)
			return
		}
		h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusInternalServerError, "InternalError", 0)
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	h.logAccess(r, bucketName, objectKey, "s3:GetObject", http.StatusOK, "", obj.Size)
	w.Header().Set("Content-Type", obj.ContentType)
	w.Header().Set("Content-Length", strconv.FormatInt(obj.Size, 10))
	w.Header().Set("ETag", "\""+obj.ETag+"\"")
	w.Header().Set("Last-Modified", obj.LastModified.Format(time.RFC1123))
	w.WriteHeader(http.StatusOK)
}

func (h *S3Handler) listObjects(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if !h.store.BucketExists(ctx.TenantID, bucketName) {
		h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusNotFound, "NoSuchBucket", 0)
		writeS3Error(w, "NoSuchBucket", "The specified bucket does not exist", http.StatusNotFound)
		return
	}
	prefix := r.URL.Query().Get("prefix")
	objects, err := h.store.ListObjects(ctx.TenantID, bucketName, prefix)
	if err != nil {
		h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusInternalServerError, "InternalError", 0)
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	type contents struct {
		Key          string `xml:"Key"`
		LastModified string `xml:"LastModified"`
		ETag         string `xml:"ETag"`
		Size         int64  `xml:"Size"`
		StorageClass string `xml:"StorageClass"`
	}

	type listResult struct {
		XMLNS       string     `xml:"xmlns,attr"`
		Name        string     `xml:"Name"`
		Prefix      string     `xml:"Prefix"`
		Marker      string     `xml:"Marker"`
		MaxKeys     int        `xml:"MaxKeys"`
		IsTruncated bool       `xml:"IsTruncated"`
		Contents    []contents `xml:"Contents"`
	}

	result := listResult{
		XMLNS:       "http://s3.amazonaws.com/doc/2006-03-01/",
		Name:        bucketName,
		Prefix:      prefix,
		MaxKeys:     1000,
		IsTruncated: false,
	}
	for _, obj := range objects {
		result.Contents = append(result.Contents, contents{
			Key:          obj.Key,
			LastModified: obj.LastModified.Format(time.RFC3339),
			ETag:         "\"" + obj.ETag + "\"",
			Size:         obj.Size,
			StorageClass: "STANDARD",
		})
	}

	output, err := xml.Marshal(result)
	if err != nil {
		h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusInternalServerError, "InternalError", 0)
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, "", "s3:ListBucket", http.StatusOK, "", int64(len(output)))
	w.Header().Set("Content-Type", "application/xml")
	w.Write([]byte(xml.Header + string(output)))
}

func (h *S3Handler) listAllBuckets(w http.ResponseWriter, r *http.Request) {
	ctx := fromContext(r)
	buckets, err := h.store.ListBuckets(ctx.TenantID)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	type bucketXML struct {
		Name string `xml:"Name"`
	}
	type owner struct {
		ID          string `xml:"ID"`
		DisplayName string `xml:"DisplayName"`
	}
	type listAllMyBucketsResult struct {
		XMLNS   string      `xml:"xmlns,attr"`
		Owner   owner       `xml:"Owner"`
		Buckets []bucketXML `xml:"Buckets>Bucket"`
	}

	result := listAllMyBucketsResult{
		XMLNS: "http://s3.amazonaws.com/doc/2006-03-01/",
		Owner: owner{
			ID:          ctx.TenantID,
			DisplayName: ctx.TenantID,
		},
	}
	for _, b := range buckets {
		result.Buckets = append(result.Buckets, bucketXML{Name: b.Name})
	}

	output, err := xml.Marshal(result)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, "", "", "s3:ListAllMyBuckets", http.StatusOK, "", int64(len(output)))
	w.Header().Set("Content-Type", "application/xml")
	w.Write([]byte(xml.Header + string(output)))
}

func (h *S3Handler) initiateMultipartUpload(w http.ResponseWriter, r *http.Request, bucketName, objectKey string) {
	ctx := fromContext(r)
	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	mpu, err := h.store.InitiateMultipartUpload(ctx.TenantID, bucketName, objectKey, contentType)
	if err != nil {
		if strings.Contains(err.Error(), "bucket does not exist") {
			writeS3Error(w, "NoSuchBucket", err.Error(), http.StatusNotFound)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	type initiateResult struct {
		XMLNS    string `xml:"xmlns,attr"`
		Bucket   string `xml:"Bucket"`
		Key      string `xml:"Key"`
		UploadID string `xml:"UploadId"`
	}

	result := initiateResult{
		XMLNS:    "http://s3.amazonaws.com/doc/2006-03-01/",
		Bucket:   bucketName,
		Key:      objectKey,
		UploadID: mpu.UploadID,
	}
	output, err := xml.Marshal(result)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusOK, "", 0)
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(xml.Header + string(output)))
}

func (h *S3Handler) uploadPart(w http.ResponseWriter, r *http.Request, bucketName, objectKey, uploadID, partNumberStr string) {
	ctx := fromContext(r)
	partNumber, err := strconv.Atoi(partNumberStr)
	if err != nil || partNumber < 1 || partNumber > 10000 {
		writeS3Error(w, "InvalidArgument", "PartNumber must be between 1 and 10000", http.StatusBadRequest)
		return
	}

	part, err := h.store.UploadPart(ctx.TenantID, bucketName, uploadID, partNumber, r.Body)
	if err != nil {
		if strings.Contains(err.Error(), "no such upload") {
			writeS3Error(w, "NoSuchUpload", "The specified multipart upload does not exist", http.StatusNotFound)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("ETag", "\""+part.ETag+"\"")
	w.WriteHeader(http.StatusOK)
}

func (h *S3Handler) completeMultipartUpload(w http.ResponseWriter, r *http.Request, bucketName, objectKey, uploadID string) {
	ctx := fromContext(r)

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	type completedPart struct {
		XMLName    xml.Name `xml:"Part"`
		PartNumber int      `xml:"PartNumber"`
		ETag       string   `xml:"ETag"`
	}
	type completeMultipartUpload struct {
		XMLName xml.Name        `xml:"CompleteMultipartUpload"`
		Parts   []completedPart `xml:"Part"`
	}

	var cmu completeMultipartUpload
	if err := xml.Unmarshal(body, &cmu); err != nil {
		writeS3Error(w, "MalformedXML", "The XML you provided was not well-formed", http.StatusBadRequest)
		return
	}

	if len(cmu.Parts) == 0 {
		writeS3Error(w, "InvalidArgument", "You must specify at least one part", http.StatusBadRequest)
		return
	}

	var partNumbers []int
	for _, p := range cmu.Parts {
		partNumbers = append(partNumbers, p.PartNumber)
	}

	obj, err := h.store.CompleteMultipartUpload(ctx.TenantID, bucketName, uploadID, partNumbers)
	if err != nil {
		if strings.Contains(err.Error(), "no such upload") {
			writeS3Error(w, "NoSuchUpload", "The specified multipart upload does not exist", http.StatusNotFound)
			return
		}
		if strings.Contains(err.Error(), "not found") {
			writeS3Error(w, "InvalidPart", err.Error(), http.StatusBadRequest)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	type completeResult struct {
		XMLNS  string `xml:"xmlns,attr"`
		Bucket string `xml:"Bucket"`
		Key    string `xml:"Key"`
		ETag   string `xml:"ETag"`
	}

	result := completeResult{
		XMLNS:  "http://s3.amazonaws.com/doc/2006-03-01/",
		Bucket: bucketName,
		Key:    objectKey,
		ETag:   "\"" + obj.ETag + "\"",
	}
	output, err := xml.Marshal(result)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, objectKey, "s3:PutObject", http.StatusOK, "", obj.Size)
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(xml.Header + string(output)))
}

func (h *S3Handler) abortMultipartUpload(w http.ResponseWriter, r *http.Request, bucketName, objectKey, uploadID string) {
	ctx := fromContext(r)
	if err := h.store.AbortMultipartUpload(ctx.TenantID, bucketName, uploadID); err != nil {
		if strings.Contains(err.Error(), "no such upload") {
			writeS3Error(w, "NoSuchUpload", "The specified multipart upload does not exist", http.StatusNotFound)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, objectKey, "s3:AbortMultipartUpload", http.StatusNoContent, "", 0)
	w.WriteHeader(http.StatusNoContent)
}

func (h *S3Handler) putBucketPolicy(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if !h.store.BucketExists(ctx.TenantID, bucketName) {
		writeS3Error(w, "NoSuchBucket", "The specified bucket does not exist", http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}

	var policy model.BucketPolicy
	if err := json.Unmarshal(body, &policy); err != nil {
		writeS3Error(w, "MalformedPolicy", "Invalid policy document", http.StatusBadRequest)
		return
	}

	for i := range policy.Statement {
		if policy.Statement[i].Effect != "Allow" && policy.Statement[i].Effect != "Deny" {
			writeS3Error(w, "MalformedPolicy", fmt.Sprintf("Invalid Effect '%s' in statement %d", policy.Statement[i].Effect, i), http.StatusBadRequest)
			return
		}
	}

	if err := h.store.PutBucketPolicy(ctx.TenantID, bucketName, &policy); err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, "", "s3:PutBucketPolicy", http.StatusOK, "", 0)
	w.WriteHeader(http.StatusNoContent)
}

func (h *S3Handler) getBucketPolicy(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	policy, err := h.store.GetBucketPolicy(ctx.TenantID, bucketName)
	if err != nil {
		if strings.Contains(err.Error(), "no policy") {
			writeS3Error(w, "NoSuchBucketPolicy", "The bucket policy does not exist", http.StatusNotFound)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	output, err := json.Marshal(policy)
	if err != nil {
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, "", "s3:GetBucketPolicy", http.StatusOK, "", int64(len(output)))
	w.Header().Set("Content-Type", "application/json")
	w.Write(output)
}

func (h *S3Handler) deleteBucketPolicy(w http.ResponseWriter, r *http.Request, bucketName string) {
	ctx := fromContext(r)
	if err := h.store.DeleteBucketPolicy(ctx.TenantID, bucketName); err != nil {
		if strings.Contains(err.Error(), "no policy") {
			writeS3Error(w, "NoSuchBucketPolicy", "The bucket policy does not exist", http.StatusNotFound)
			return
		}
		writeS3Error(w, "InternalError", err.Error(), http.StatusInternalServerError)
		return
	}
	h.logAccess(r, bucketName, "", "s3:DeleteBucketPolicy", http.StatusNoContent, "", 0)
	w.WriteHeader(http.StatusNoContent)
}

func writeS3Error(w http.ResponseWriter, code, message string, statusCode int) {
	type s3Error struct {
		XMLNS   string `xml:"xmlns,attr"`
		Code    string `xml:"Code"`
		Message string `xml:"Message"`
	}
	errResp := s3Error{
		XMLNS:   "http://s3.amazonaws.com/doc/2006-03-01/",
		Code:    code,
		Message: message,
	}
	output, _ := xml.Marshal(errResp)
	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(statusCode)
	w.Write([]byte(xml.Header + string(output)))
}

func (h *S3Handler) serveWebUI(w http.ResponseWriter, r *http.Request) {
	filePath := r.URL.Path
	if filePath == "/" || filePath == "/web" || filePath == "/web/" {
		filePath = "/web/index.html"
	}
	fullPath := path.Join(".", filePath)
	http.ServeFile(w, r, fullPath)
}
