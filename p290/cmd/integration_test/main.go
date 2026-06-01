package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

func main() {
	accessKey := "AKIA_TENANT_A"
	secretKey := "secret_key_a_1234567890abcdef"
	endpoint := "http://localhost:9000"
	region := "us-east-1"
	service := "s3"

	fmt.Println("=== Mini RGW Integration Test (Policy + Access Log) ===\n")

	setupTenant()

	passed := 0
	failed := 0

	check := func(name string, ok bool, detail string) {
		if ok {
			fmt.Printf("  ✅ %s\n", name)
			passed++
		} else {
			fmt.Printf("  ❌ %s — %s\n", name, detail)
			failed++
		}
	}

	fmt.Println("1. Basic Operations (with access logging)")
	resp, body := doSignedRequest("PUT", endpoint+"/policy-test-bucket", nil, accessKey, secretKey, region, service)
	check("CreateBucket", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("PUT", endpoint+"/policy-test-bucket/hello.txt", []byte("Hello Policy!"), accessKey, secretKey, region, service)
	check("PutObject", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("GET", endpoint+"/policy-test-bucket/hello.txt", nil, accessKey, secretKey, region, service)
	check("GetObject (allowed, no policy)", resp.StatusCode == 200, fmt.Sprintf("status=%d body=%s", resp.StatusCode, truncate(string(body), 50)))

	fmt.Println("\n2. Bucket Policy — Deny GetObject")

	policy := map[string]interface{}{
		"Version": "2012-10-17",
		"Statement": []map[string]interface{}{
			{
				"Sid":    "DenyRead",
				"Effect": "Deny",
				"Principal": map[string]interface{}{
					"AWS": []string{"*"},
				},
				"Action":   []string{"s3:GetObject"},
				"Resource": []string{"arn:aws:s3:::policy-test-bucket/*"},
			},
		},
	}
	policyJSON, _ := json.Marshal(policy)

	resp, body = doSignedRequest("PUT", endpoint+"/policy-test-bucket?policy", policyJSON, accessKey, secretKey, region, service)
	check("PutBucketPolicy (Deny GetObject)", resp.StatusCode == 204, fmt.Sprintf("status=%d body=%s", resp.StatusCode, truncate(string(body), 200)))

	resp, body = doSignedRequest("GET", endpoint+"/policy-test-bucket?policy", nil, accessKey, secretKey, region, service)
	check("GetBucketPolicy", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("GET", endpoint+"/policy-test-bucket/hello.txt", nil, accessKey, secretKey, region, service)
	check("GetObject (denied by policy)", resp.StatusCode == 403, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("PUT", endpoint+"/policy-test-bucket/still-write.txt", []byte("Write still works"), accessKey, secretKey, region, service)
	check("PutObject (still allowed)", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	fmt.Println("\n3. Bucket Policy — Allow Only Specific Action")

	allowPolicy := map[string]interface{}{
		"Version": "2012-10-17",
		"Statement": []map[string]interface{}{
			{
				"Sid":    "AllowPutOnly",
				"Effect": "Allow",
				"Principal": map[string]interface{}{
					"AWS": []string{"*"},
				},
				"Action":   []string{"s3:PutObject"},
				"Resource": []string{"arn:aws:s3:::policy-test-bucket/*"},
			},
			{
				"Sid":    "DenyAll",
				"Effect": "Deny",
				"Principal": map[string]interface{}{
					"AWS": []string{"*"},
				},
				"Action":   []string{"s3:*"},
				"Resource": []string{"arn:aws:s3:::policy-test-bucket/*"},
			},
		},
	}
	allowPolicyJSON, _ := json.Marshal(allowPolicy)
	resp, body = doSignedRequest("PUT", endpoint+"/policy-test-bucket?policy", allowPolicyJSON, accessKey, secretKey, region, service)
	check("PutBucketPolicy (Allow Put, Deny All)", resp.StatusCode == 204, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("GET", endpoint+"/policy-test-bucket/hello.txt", nil, accessKey, secretKey, region, service)
	check("GetObject (denied by Deny statement)", resp.StatusCode == 403, fmt.Sprintf("status=%d", resp.StatusCode))

	fmt.Println("\n4. Delete Bucket Policy → Access Restored")

	resp, body = doSignedRequest("DELETE", endpoint+"/policy-test-bucket?policy", nil, accessKey, secretKey, region, service)
	check("DeleteBucketPolicy", resp.StatusCode == 204, fmt.Sprintf("status=%d", resp.StatusCode))

	resp, body = doSignedRequest("GET", endpoint+"/policy-test-bucket/hello.txt", nil, accessKey, secretKey, region, service)
	check("GetObject (restored after policy delete)", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	fmt.Println("\n5. Access Log Verification")

	time.Sleep(500 * time.Millisecond)

	resp, body = httpGet(endpoint + "/api/logs?tenant_id=tenant-a&limit=5")
	check("Access Log API", resp.StatusCode == 200, fmt.Sprintf("status=%d", resp.StatusCode))

	var logs []map[string]interface{}
	json.Unmarshal(body, &logs)
	check("Access logs present", len(logs) > 0, fmt.Sprintf("log count=%d", len(logs)))
	if len(logs) > 0 {
		lastLog := logs[0]
		hasOperation := lastLog["operation"] != nil && lastLog["operation"] != ""
		check("Log entry has operation field", hasOperation, fmt.Sprintf("operation=%v", lastLog["operation"]))
	}

	resp, body = httpGet(endpoint + "/api/logs/export?tenant_id=tenant-a&format=json")
	check("Export Logs (JSON)", resp.StatusCode == 200 && resp.Header.Get("Content-Disposition") != "", fmt.Sprintf("status=%d disposition=%s", resp.StatusCode, resp.Header.Get("Content-Disposition")))

	resp, body = httpGet(endpoint + "/api/logs/export?tenant_id=tenant-a&format=csv")
	check("Export Logs (CSV)", resp.StatusCode == 200 && strings.Contains(string(body[:min(100, len(body))]), "timestamp"), fmt.Sprintf("status=%d startsWith=%s", resp.StatusCode, truncate(string(body), 80)))

	fmt.Println("\n6. Policy Validation — Invalid Effect")

	badPolicy := map[string]interface{}{
		"Version": "2012-10-17",
		"Statement": []map[string]interface{}{
			{
				"Effect": "InvalidEffect",
				"Principal": map[string]interface{}{
					"AWS": []string{"*"},
				},
				"Action":   []string{"s3:GetObject"},
				"Resource": []string{"arn:aws:s3:::policy-test-bucket/*"},
			},
		},
	}
	badPolicyJSON, _ := json.Marshal(badPolicy)
	resp, body = doSignedRequest("PUT", endpoint+"/policy-test-bucket?policy", badPolicyJSON, accessKey, secretKey, region, service)
	check("PutBucketPolicy (invalid Effect rejected)", resp.StatusCode == 400, fmt.Sprintf("status=%d", resp.StatusCode))

	fmt.Printf("\n=== Results: %d passed, %d failed ===\n", passed, failed)
}

func setupTenant() {
	http.Post("http://localhost:9000/api/tenants", "application/json",
		strings.NewReader(`{"tenant_id":"tenant-a","access_key_id":"AKIA_TENANT_A","secret_access_key":"secret_key_a_1234567890abcdef"}`))
}

func httpGet(url string) (*http.Response, []byte) {
	resp, err := http.Get(url)
	if err != nil {
		return &http.Response{StatusCode: 0}, nil
	}
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, body
}

func doSignedRequest(method, rawURL string, body []byte, accessKey, secretKey, region, service string) (*http.Response, []byte) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return nil, nil
	}

	now := time.Now().UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	var bodyReader io.Reader
	payloadHash := sha256HashHex(nil)
	if body != nil {
		bodyReader = bytes.NewReader(body)
		payloadHash = sha256HashHex(body)
	}

	host := parsedURL.Host
	canonicalURI := parsedURL.EscapedPath()
	if canonicalURI == "" {
		canonicalURI = "/"
	}

	signedHeaders := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	sort.Strings(signedHeaders)

	var req http.Request
	req.Method = method
	req.URL = parsedURL
	req.Host = host
	req.Header = make(http.Header)
	req.Header.Set("Host", host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)

	canonicalHeaders := buildCanonicalHeaders(&req, signedHeaders)
	signedHeadersStr := strings.Join(signedHeaders, ";")

	canonicalQueryString := ""
	if parsedURL.RawQuery != "" {
		params := parsedURL.Query()
		var keys []string
		for k := range params {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		var qs []string
		for _, k := range keys {
			for _, v := range params[k] {
				qs = append(qs, url.QueryEscape(k)+"="+url.QueryEscape(v))
			}
		}
		canonicalQueryString = strings.Join(qs, "&")
	}

	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		"",
		signedHeadersStr,
		payloadHash,
	}, "\n")

	credentialScope := fmt.Sprintf("%s/%s/%s/aws4_request", dateStamp, region, service)
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256HashHex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := getSigningKey(secretKey, dateStamp, region, service)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, credentialScope, signedHeadersStr, signature)

	req.Header.Set("Authorization", authHeader)

	if bodyReader != nil {
		req.Body = io.NopCloser(bodyReader)
		req.ContentLength = int64(len(body))
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(&req)
	if err != nil {
		return nil, nil
	}
	respBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	return resp, respBody
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

func sha256HashHex(data []byte) string {
	h := sha256.New()
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil))
}

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func getSigningKey(secretKey, dateStamp, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(dateStamp))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte("aws4_request"))
	return kSigning
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func init() {
	http.DefaultTransport.(*http.Transport).DisableKeepAlives = true
}
