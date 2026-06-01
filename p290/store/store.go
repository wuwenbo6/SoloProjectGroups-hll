package store

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"mini-rgw/model"
)

type Store struct {
	baseDir string
	mu      sync.RWMutex
	creds   map[string]*model.Credential
}

func New(baseDir string) (*Store, error) {
	absDir, err := filepath.Abs(baseDir)
	if err != nil {
		return nil, fmt.Errorf("invalid base dir: %w", err)
	}
	dirs := []string{
		filepath.Join(absDir, "buckets"),
		filepath.Join(absDir, "meta"),
		filepath.Join(absDir, "multipart"),
	}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0755); err != nil {
			return nil, fmt.Errorf("create dir %s: %w", d, err)
		}
	}
	s := &Store{
		baseDir: absDir,
		creds:   make(map[string]*model.Credential),
	}
	if err := s.loadCredentials(); err != nil {
		return nil, err
	}
	return s, nil
}

func tenantBucketKey(tenantID, bucketName string) string {
	return tenantID + "/" + bucketName
}

func (s *Store) loadCredentials() error {
	path := filepath.Join(s.baseDir, "meta", "credentials.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var creds []*model.Credential
	if err := json.Unmarshal(data, &creds); err != nil {
		return err
	}
	for _, c := range creds {
		s.creds[c.AccessKeyID] = c
	}
	return nil
}

func (s *Store) saveCredentials() error {
	var creds []*model.Credential
	for _, c := range s.creds {
		creds = append(creds, c)
	}
	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}
	path := filepath.Join(s.baseDir, "meta", "credentials.json")
	return os.WriteFile(path, data, 0644)
}

func (s *Store) RegisterCredential(cred *model.Credential) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.creds[cred.AccessKeyID] = cred
	return s.saveCredentials()
}

func (s *Store) GetCredential(accessKeyID string) (*model.Credential, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.creds[accessKeyID]
	return c, ok
}

func (s *Store) CreateBucket(tenantID, bucketName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	if _, err := os.Stat(bucketDir); err == nil {
		return fmt.Errorf("bucket already exists")
	}
	if err := os.MkdirAll(bucketDir, 0755); err != nil {
		return err
	}
	meta := &model.Bucket{
		Name:      bucketName,
		TenantID:  tenantID,
		CreatedAt: getTimeNow(),
	}
	return s.writeJSON(filepath.Join(s.baseDir, "meta", "buckets", tbKey+".json"), meta)
}

func (s *Store) BucketExists(tenantID, bucketName string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	_, err := os.Stat(bucketDir)
	return err == nil
}

func (s *Store) PutObject(tenantID, bucketName, objectKey string, contentType string, reader io.Reader) (*model.Object, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	if _, err := os.Stat(bucketDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("bucket does not exist")
	}
	objPath := filepath.Join(bucketDir, objectKey)
	objDir := filepath.Dir(objPath)
	if err := os.MkdirAll(objDir, 0755); err != nil {
		return nil, err
	}
	f, err := os.Create(objPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	hasher := md5.New()
	writer := io.MultiWriter(f, hasher)
	size, err := io.Copy(writer, reader)
	if err != nil {
		os.Remove(objPath)
		return nil, err
	}
	etag := hex.EncodeToString(hasher.Sum(nil))

	obj := &model.Object{
		Key:          objectKey,
		Bucket:       bucketName,
		TenantID:     tenantID,
		Size:         size,
		ContentType:  contentType,
		ETag:         etag,
		LastModified: getTimeNow(),
	}
	metaPath := filepath.Join(s.baseDir, "meta", "objects", tbKey, objectKey+".json")
	if err := s.writeJSON(metaPath, obj); err != nil {
		return nil, err
	}
	return obj, nil
}

func (s *Store) GetObject(tenantID, bucketName, objectKey string) (*model.Object, *os.File, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	objPath := filepath.Join(s.baseDir, "buckets", tbKey, objectKey)
	f, err := os.Open(objPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, fmt.Errorf("object does not exist")
		}
		return nil, nil, err
	}
	metaPath := filepath.Join(s.baseDir, "meta", "objects", tbKey, objectKey+".json")
	var obj model.Object
	data, err := os.ReadFile(metaPath)
	if err != nil {
		f.Close()
		return nil, nil, err
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		f.Close()
		return nil, nil, err
	}
	return &obj, f, nil
}

func (s *Store) ListBuckets(tenantID string) ([]*model.Bucket, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	metaDir := filepath.Join(s.baseDir, "meta", "buckets")
	var buckets []*model.Bucket
	entries, err := os.ReadDir(metaDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		if !strings.HasPrefix(e.Name(), tenantID+"/") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(metaDir, e.Name()))
		if err != nil {
			continue
		}
		var b model.Bucket
		if err := json.Unmarshal(data, &b); err != nil {
			continue
		}
		buckets = append(buckets, &b)
	}
	return buckets, nil
}

func (s *Store) ListObjects(tenantID, bucketName, prefix string) ([]*model.Object, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	metaDir := filepath.Join(s.baseDir, "meta", "objects", tbKey)
	var objects []*model.Object
	err := filepath.Walk(metaDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(info.Name(), ".json") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		var obj model.Object
		if err := json.Unmarshal(data, &obj); err != nil {
			return nil
		}
		if prefix == "" || strings.HasPrefix(obj.Key, prefix) {
			objects = append(objects, &obj)
		}
		return nil
	})
	return objects, err
}

func (s *Store) InitiateMultipartUpload(tenantID, bucketName, objectKey, contentType string) (*model.MultipartUpload, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	if _, err := os.Stat(bucketDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("bucket does not exist")
	}
	uploadID := generateUploadID()
	mpu := &model.MultipartUpload{
		UploadID:    uploadID,
		Bucket:      bucketName,
		Key:         objectKey,
		TenantID:    tenantID,
		ContentType: contentType,
		Initiated:   getTimeNow(),
	}
	mpuDir := filepath.Join(s.baseDir, "multipart", tbKey, uploadID)
	if err := os.MkdirAll(mpuDir, 0755); err != nil {
		return nil, err
	}
	if err := s.writeJSON(filepath.Join(mpuDir, "_meta.json"), mpu); err != nil {
		os.RemoveAll(mpuDir)
		return nil, err
	}
	return mpu, nil
}

func (s *Store) UploadPart(tenantID, bucketName, uploadID string, partNumber int, reader io.Reader) (*model.Part, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	mpuDir := filepath.Join(s.baseDir, "multipart", tbKey, uploadID)
	metaPath := filepath.Join(mpuDir, "_meta.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, fmt.Errorf("no such upload")
	}
	var mpu model.MultipartUpload
	if err := json.Unmarshal(data, &mpu); err != nil {
		return nil, err
	}
	if mpu.TenantID != tenantID {
		return nil, fmt.Errorf("upload belongs to different tenant")
	}

	partPath := filepath.Join(mpuDir, fmt.Sprintf("part_%d", partNumber))
	f, err := os.Create(partPath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	hasher := md5.New()
	writer := io.MultiWriter(f, hasher)
	size, err := io.Copy(writer, reader)
	if err != nil {
		os.Remove(partPath)
		return nil, err
	}
	etag := hex.EncodeToString(hasher.Sum(nil))

	part := &model.Part{
		PartNumber:   partNumber,
		ETag:         etag,
		Size:         size,
		LastModified: getTimeNow(),
	}
	if err := s.writeJSON(filepath.Join(mpuDir, fmt.Sprintf("part_%d.json", partNumber)), part); err != nil {
		return nil, err
	}
	return part, nil
}

func (s *Store) CompleteMultipartUpload(tenantID, bucketName, uploadID string, requestedParts []int) (*model.Object, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	mpuDir := filepath.Join(s.baseDir, "multipart", tbKey, uploadID)
	metaPath := filepath.Join(mpuDir, "_meta.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return nil, fmt.Errorf("no such upload")
	}
	var mpu model.MultipartUpload
	if err := json.Unmarshal(data, &mpu); err != nil {
		return nil, err
	}
	if mpu.TenantID != tenantID {
		return nil, fmt.Errorf("upload belongs to different tenant")
	}

	sort.Ints(requestedParts)

	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	objPath := filepath.Join(bucketDir, mpu.Key)
	objDir := filepath.Dir(objPath)
	if err := os.MkdirAll(objDir, 0755); err != nil {
		return nil, err
	}

	outFile, err := os.Create(objPath)
	if err != nil {
		return nil, err
	}
	defer outFile.Close()

	finalHasher := md5.New()
	var totalSize int64
	var partETags []string

	for _, pn := range requestedParts {
		partPath := filepath.Join(mpuDir, fmt.Sprintf("part_%d", pn))
		pf, err := os.Open(partPath)
		if err != nil {
			outFile.Close()
			os.Remove(objPath)
			return nil, fmt.Errorf("part %d not found", pn)
		}
		partHasher := md5.New()
		w := io.MultiWriter(outFile, finalHasher, partHasher)
		n, err := io.Copy(w, pf)
		pf.Close()
		if err != nil {
			outFile.Close()
			os.Remove(objPath)
			return nil, fmt.Errorf("error reading part %d: %w", pn, err)
		}
		totalSize += n
		partETags = append(partETags, hex.EncodeToString(partHasher.Sum(nil)))
	}

	finalETag := computeMultipartETag(partETags)

	obj := &model.Object{
		Key:          mpu.Key,
		Bucket:       bucketName,
		TenantID:     tenantID,
		Size:         totalSize,
		ContentType:  mpu.ContentType,
		ETag:         finalETag,
		LastModified: getTimeNow(),
	}
	objMetaPath := filepath.Join(s.baseDir, "meta", "objects", tbKey, mpu.Key+".json")
	if err := s.writeJSON(objMetaPath, obj); err != nil {
		return nil, err
	}

	os.RemoveAll(mpuDir)

	return obj, nil
}

func (s *Store) AbortMultipartUpload(tenantID, bucketName, uploadID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	mpuDir := filepath.Join(s.baseDir, "multipart", tbKey, uploadID)
	metaPath := filepath.Join(mpuDir, "_meta.json")
	data, err := os.ReadFile(metaPath)
	if err != nil {
		return fmt.Errorf("no such upload")
	}
	var mpu model.MultipartUpload
	if err := json.Unmarshal(data, &mpu); err != nil {
		return err
	}
	if mpu.TenantID != tenantID {
		return fmt.Errorf("upload belongs to different tenant")
	}
	return os.RemoveAll(mpuDir)
}

func (s *Store) ListMultipartUploads(tenantID, bucketName string) ([]*model.MultipartUpload, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	mpuBaseDir := filepath.Join(s.baseDir, "multipart", tbKey)
	entries, err := os.ReadDir(mpuBaseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var uploads []*model.MultipartUpload
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		metaPath := filepath.Join(mpuBaseDir, e.Name(), "_meta.json")
		data, err := os.ReadFile(metaPath)
		if err != nil {
			continue
		}
		var mpu model.MultipartUpload
		if err := json.Unmarshal(data, &mpu); err != nil {
			continue
		}
		uploads = append(uploads, &mpu)
	}
	return uploads, nil
}

func (s *Store) ListCredentials(tenantID string) []*model.Credential {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []*model.Credential
	for _, c := range s.creds {
		if tenantID == "" || c.TenantID == tenantID {
			result = append(result, c)
		}
	}
	return result
}

func (s *Store) BaseDir() string {
	return s.baseDir
}

func (s *Store) PutBucketPolicy(tenantID, bucketName string, policy *model.BucketPolicy) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	bucketDir := filepath.Join(s.baseDir, "buckets", tbKey)
	if _, err := os.Stat(bucketDir); os.IsNotExist(err) {
		return fmt.Errorf("bucket does not exist")
	}
	return s.writeJSON(filepath.Join(s.baseDir, "meta", "policies", tbKey+".json"), policy)
}

func (s *Store) GetBucketPolicy(tenantID, bucketName string) (*model.BucketPolicy, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	path := filepath.Join(s.baseDir, "meta", "policies", tbKey+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("no policy")
		}
		return nil, err
	}
	var policy model.BucketPolicy
	if err := json.Unmarshal(data, &policy); err != nil {
		return nil, err
	}
	return &policy, nil
}

func (s *Store) DeleteBucketPolicy(tenantID, bucketName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	tbKey := tenantBucketKey(tenantID, bucketName)
	path := filepath.Join(s.baseDir, "meta", "policies", tbKey+".json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("no policy")
	}
	return os.Remove(path)
}

func (s *Store) writeJSON(path string, v interface{}) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func computeMultipartETag(partETags []string) string {
	if len(partETags) == 0 {
		return ""
	}
	h := md5.New()
	for _, etag := range partETags {
		b, _ := hex.DecodeString(etag)
		h.Write(b)
	}
	return hex.EncodeToString(h.Sum(nil)) + "-" + fmt.Sprintf("%d", len(partETags))
}

func generateUploadID() string {
	h := md5.New()
	h.Write([]byte(fmt.Sprintf("%d", time.Now().UnixNano())))
	return hex.EncodeToString(h.Sum(nil))
}

func getTimeNow() time.Time {
	return time.Now().UTC()
}
