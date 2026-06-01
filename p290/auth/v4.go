package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"mini-rgw/store"
)

const (
	aws4Algorithm = "AWS4-HMAC-SHA256"
	service       = "s3"
	region        = "us-east-1"
)

type Signer struct {
	store *store.Store
}

func NewSigner(s *store.Store) *Signer {
	return &Signer{store: s}
}

type AuthResult struct {
	TenantID    string
	AccessKeyID string
}

func (s *Signer) Authenticate(r *http.Request) (*AuthResult, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		querySig := r.URL.Query().Get("X-Amz-Signature")
		if querySig != "" {
			return s.authenticatePresignedURL(r)
		}
		return nil, fmt.Errorf("missing authorization")
	}
	return s.authenticateHeader(r, authHeader)
}

func (s *Signer) authenticateHeader(r *http.Request, authHeader string) (*AuthResult, error) {
	if !strings.HasPrefix(authHeader, aws4Algorithm+" ") {
		return nil, fmt.Errorf("unsupported authorization algorithm")
	}
	re := regexp.MustCompile(`AWS4-HMAC-SHA256 Credential=([^,]+),\s*SignedHeaders=([^,]+),\s*Signature=(.+)$`)
	matches := re.FindStringSubmatch(authHeader)
	if len(matches) != 4 {
		return nil, fmt.Errorf("malformed authorization header")
	}
	credential := matches[1]
	signedHeadersStr := matches[2]
	signature := matches[3]

	credParts := strings.Split(credential, "/")
	if len(credParts) != 5 {
		return nil, fmt.Errorf("malformed credential")
	}
	accessKeyID := credParts[0]
	dateStamp := credParts[1]
	regionVal := credParts[2]
	serviceVal := credParts[3]

	cred, ok := s.store.GetCredential(accessKeyID)
	if !ok {
		return nil, fmt.Errorf("access key not found")
	}

	amzDate := r.Header.Get("X-Amz-Date")
	if amzDate == "" {
		amzDate = r.Header.Get("Date")
	}

	scope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, regionVal, serviceVal)

	signedHeaders := strings.Split(signedHeadersStr, ";")
	canonicalHeaders := buildCanonicalHeaders(r, signedHeaders)
	signedHeadersSorted := make([]string, len(signedHeaders))
	copy(signedHeadersSorted, signedHeaders)
	sort.Strings(signedHeadersSorted)

	payloadHash := r.Header.Get("X-Amz-Content-Sha256")
	if payloadHash == "" {
		payloadHash = "UNSIGNED-PAYLOAD"
	}

	canonicalURI := getCanonicalURI(r)
	canonicalQueryString := getCanonicalQueryString(r)
	canonicalRequest := strings.Join([]string{
		r.Method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		"",
		strings.Join(signedHeadersSorted, ";"),
		payloadHash,
	}, "\n")

	stringToSign := strings.Join([]string{
		aws4Algorithm,
		amzDate,
		scope,
		hex.EncodeToString(sha256Hash([]byte(canonicalRequest))),
	}, "\n")

	signingKey := getSigningKey(cred.SecretAccessKey, dateStamp, regionVal, serviceVal)
	expectedSignature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	if signature != expectedSignature {
		return nil, fmt.Errorf("signature mismatch")
	}

	return &AuthResult{
		TenantID:    cred.TenantID,
		AccessKeyID: accessKeyID,
	}, nil
}

func (s *Signer) authenticatePresignedURL(r *http.Request) (*AuthResult, error) {
	q := r.URL.Query()
	credential := q.Get("X-Amz-Credential")
	if credential == "" {
		return nil, fmt.Errorf("missing credential in query")
	}
	credParts := strings.Split(credential, "/")
	if len(credParts) != 5 {
		return nil, fmt.Errorf("malformed credential")
	}
	accessKeyID := credParts[0]
	dateStamp := credParts[1]
	regionVal := credParts[2]
	serviceVal := credParts[3]

	cred, ok := s.store.GetCredential(accessKeyID)
	if !ok {
		return nil, fmt.Errorf("access key not found")
	}

	expires := q.Get("X-Amz-Expires")
	dateStr := q.Get("X-Amz-Date")
	if dateStr == "" || expires == "" {
		return nil, fmt.Errorf("missing date or expires")
	}
	signDate, err := time.Parse("20060102T150405Z", dateStr)
	if err != nil {
		return nil, fmt.Errorf("invalid date format")
	}
	expiresDur, err := time.ParseDuration(expires + "s")
	if err != nil {
		return nil, fmt.Errorf("invalid expires")
	}
	if time.Since(signDate) > expiresDur {
		return nil, fmt.Errorf("request expired")
	}

	signature := q.Get("X-Amz-Signature")
	signedHeadersStr := q.Get("X-Amz-SignedHeaders")

	scope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, regionVal, serviceVal)

	signedHeaders := strings.Split(signedHeadersStr, ";")
	canonicalHeaders := buildCanonicalHeaders(r, signedHeaders)
	sort.Strings(signedHeaders)

	canonicalURI := getCanonicalURI(r)

	var queryParams []string
	for k, vs := range q {
		for _, v := range vs {
			if k == "X-Amz-Signature" {
				continue
			}
			queryParams = append(queryParams, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	sort.Strings(queryParams)
	canonicalQueryString := strings.Join(queryParams, "&")

	canonicalRequest := strings.Join([]string{
		r.Method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		"",
		strings.Join(signedHeaders, ";"),
		"UNSIGNED-PAYLOAD",
	}, "\n")

	stringToSign := strings.Join([]string{
		aws4Algorithm,
		dateStr,
		scope,
		hex.EncodeToString(sha256Hash([]byte(canonicalRequest))),
	}, "\n")

	signingKey := getSigningKey(cred.SecretAccessKey, dateStamp, regionVal, serviceVal)
	expectedSignature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	if signature != expectedSignature {
		return nil, fmt.Errorf("signature mismatch")
	}

	return &AuthResult{
		TenantID:    cred.TenantID,
		AccessKeyID: accessKeyID,
	}, nil
}

func buildCanonicalHeaders(r *http.Request, signedHeaders []string) string {
	var lines []string
	for _, h := range signedHeaders {
		val := r.Header.Get(h)
		if h == "host" {
			val = r.Host
		}
		val = strings.TrimSpace(val)
		val = strings.Join(strings.Fields(val), " ")
		lines = append(lines, strings.ToLower(h)+":"+val)
	}
	var result strings.Builder
	for _, l := range lines {
		result.WriteString(l)
		result.WriteString("\n")
	}
	return result.String()
}

func getCanonicalURI(r *http.Request) string {
	path := r.URL.EscapedPath()
	if path == "" {
		path = "/"
	}
	return path
}

func getCanonicalQueryString(r *http.Request) string {
	q := r.URL.Query()
	var keys []string
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var parts []string
	for _, k := range keys {
		for _, v := range q[k] {
			parts = append(parts, url.QueryEscape(k)+"="+url.QueryEscape(v))
		}
	}
	return strings.Join(parts, "&")
}

func sha256Hash(data []byte) []byte {
	h := sha256.New()
	h.Write(data)
	return h.Sum(nil)
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func getSigningKey(secretKey, dateStamp, regionVal, serviceVal string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(regionVal))
	kService := hmacSHA256(kRegion, []byte(serviceVal))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	return kSigning
}
