package handler

import (
	"encoding/json"
	"net/http"

	"grpc-invoker/backend/grpcutil"
	"google.golang.org/protobuf/reflect/protoregistry"
)

func HandleProtoExport(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req struct {
		Address    string `json:"address"`
		TLS        bool   `json:"tls"`
		Service    string `json:"service"`
		MethodName string `json:"methodName"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()

	var reg *protoregistry.Files

	if cachedReg, ok := grpcutil.GetCachedRegistry(req.Address, req.TLS); ok {
		reg = cachedReg
	}

	if reg == nil {
		rc, err := grpcutil.NewReflectionClient(ctx, req.Address, req.TLS)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer rc.Close()

		serviceName := req.Service
		if serviceName == "" && req.MethodName != "" {
			for i := len(req.MethodName) - 1; i >= 0; i-- {
				if req.MethodName[i] == '/' {
					serviceName = req.MethodName[1:i]
					break
				}
			}
		}

		reg, err = rc.BuildResolver(ctx, serviceName)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		grpcutil.CacheRegistry(req.Address, req.TLS, reg)
	}

	serviceName := req.Service
	if serviceName == "" && req.MethodName != "" {
		for i := len(req.MethodName) - 1; i >= 0; i-- {
			if req.MethodName[i] == '/' {
				serviceName = req.MethodName[1:i]
				break
			}
		}
	}

	protoFiles, err := grpcutil.ExportProtoSource(reg, serviceName)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"files":   protoFiles,
		"service": serviceName,
	})
}
