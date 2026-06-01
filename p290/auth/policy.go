package auth

import (
	"strings"

	"mini-rgw/model"
)

type PolicyChecker struct{}

func NewPolicyChecker() *PolicyChecker {
	return &PolicyChecker{}
}

func (p *PolicyChecker) Check(policy *model.BucketPolicy, tenantID, action, resource string) bool {
	if policy == nil {
		return true
	}
	for _, stmt := range policy.Statement {
		if p.matchStatement(&stmt, tenantID, action, resource) {
			return stmt.Effect == "Allow"
		}
	}
	return true
}

func (p *PolicyChecker) matchStatement(stmt *model.PolicyStatement, tenantID, action, resource string) bool {
	principalMatch := p.matchPrincipal(stmt, tenantID)
	if !principalMatch {
		return false
	}
	actionMatch := p.matchAction(stmt, action)
	if !actionMatch {
		return false
	}
	resourceMatch := p.matchResource(stmt, resource)
	if !resourceMatch {
		return false
	}
	return true
}

func (p *PolicyChecker) matchPrincipal(stmt *model.PolicyStatement, tenantID string) bool {
	if len(stmt.Principal.AWS) == 0 {
		return true
	}
	for _, arn := range stmt.Principal.AWS {
		if arn == "*" {
			return true
		}
		if strings.Contains(arn, tenantID) {
			return true
		}
	}
	return false
}

func (p *PolicyChecker) matchAction(stmt *model.PolicyStatement, action string) bool {
	for _, a := range stmt.Action {
		if a == "*" || a == "s3:*" {
			return true
		}
		if a == action {
			return true
		}
		if strings.HasSuffix(a, "*") && strings.HasPrefix(action, strings.TrimSuffix(a, "*")) {
			return true
		}
	}
	return false
}

func (p *PolicyChecker) matchResource(stmt *model.PolicyStatement, resource string) bool {
	for _, r := range stmt.Resource {
		if r == "*" {
			return true
		}
		if r == resource {
			return true
		}
		if strings.HasSuffix(r, "*") && strings.HasPrefix(resource, strings.TrimSuffix(r, "*")) {
			return true
		}
	}
	return false
}

func MapOperationToAction(method, path string) string {
	qIdx := strings.Index(path, "?")
	if qIdx > 0 {
		path = path[:qIdx]
	}
	parts := strings.SplitN(strings.TrimPrefix(path, "/"), "/", 2)
	bucket := ""
	if len(parts) > 0 {
		bucket = parts[0]
	}
	isObject := len(parts) == 2 && parts[1] != ""

	switch {
	case method == "GET" && path == "/":
		return "s3:ListAllMyBuckets"
	case method == "PUT" && bucket != "" && !isObject:
		return "s3:CreateBucket"
	case method == "GET" && bucket != "" && !isObject:
		return "s3:ListBucket"
	case method == "HEAD" && bucket != "" && !isObject:
		return "s3:ListBucket"
	case method == "DELETE" && bucket != "" && !isObject:
		return "s3:DeleteBucket"
	case method == "PUT" && isObject:
		return "s3:PutObject"
	case method == "GET" && isObject:
		return "s3:GetObject"
	case method == "HEAD" && isObject:
		return "s3:GetObject"
	case method == "DELETE" && isObject:
		return "s3:DeleteObject"
	default:
		return "s3:*"
	}
}

func FormatResource(bucket, objectKey string) string {
	if objectKey != "" {
		return "arn:aws:s3:::" + bucket + "/" + objectKey
	}
	return "arn:aws:s3:::" + bucket
}
