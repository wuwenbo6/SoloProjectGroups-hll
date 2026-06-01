package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"grpc-invoker/backend/grpcutil"
	"grpc-invoker/backend/model"
)

var cacheEnabled = true

func HandleConnect(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req model.ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if cacheEnabled {
		if cached, ok := grpcutil.GetCachedServices(req.Address, req.TLS); ok {
			filtered := make([]string, 0, len(cached))
			for _, s := range cached {
				if !strings.HasPrefix(s, "grpc.reflection") {
					filtered = append(filtered, s)
				}
			}
			writeJSON(w, http.StatusOK, model.ConnectResponse{Services: filtered})
			return
		}
	}

	ctx := r.Context()

	rc, err := grpcutil.NewReflectionClient(ctx, req.Address, req.TLS)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	defer rc.Close()

	services, err := rc.ListServices(ctx)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	filtered := make([]string, 0, len(services))
	for _, s := range services {
		if !strings.HasPrefix(s, "grpc.reflection") {
			filtered = append(filtered, s)
		}
	}

	grpcutil.CacheServices(req.Address, req.TLS, services)

	resp := model.ConnectResponse{
		Services: filtered,
	}

	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, errMsg string) {
	resp := model.InvokeResponse{
		Error:    errMsg,
		Status:   "ERROR",
		Duration: "0ms",
	}
	writeJSON(w, code, resp)
}

func writeInvokeResult(w http.ResponseWriter, resp string, err error, start time.Time) {
	duration := time.Since(start)
	if err != nil {
		writeJSON(w, http.StatusOK, model.InvokeResponse{
			Error:    err.Error(),
			Status:   "ERROR",
			Duration: duration.Round(time.Millisecond).String(),
		})
		return
	}
	writeJSON(w, http.StatusOK, model.InvokeResponse{
		Response: resp,
		Status:   "OK",
		Duration: duration.Round(time.Millisecond).String(),
	})
}
