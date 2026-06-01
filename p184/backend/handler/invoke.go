package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"grpc-invoker/backend/grpcutil"
	"grpc-invoker/backend/model"
	"google.golang.org/protobuf/reflect/protoregistry"
)

func HandleInvoke(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	start := time.Now()

	var req model.InvokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}

	if req.Timeout <= 0 {
		req.Timeout = 10
	}

	ctx := r.Context()

	rc, err := grpcutil.NewReflectionClient(ctx, req.Address, req.TLS)
	if err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}
	defer rc.Close()

	var serviceName string
	for i := len(req.Method) - 1; i >= 0; i-- {
		if req.Method[i] == '/' {
			serviceName = req.Method[1:i]
			break
		}
	}

	reg, err := rc.BuildResolver(ctx, serviceName)
	if err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}

	md, err := grpcutil.ResolveMethodFromReg(reg, req.Method)
	if err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}

	if md.IsStreamingClient() || md.IsStreamingServer() {
		writeInvokeResult(w, "", nil, start)
		return
	}

	di, err := grpcutil.NewDynamicInvoker(ctx, req.Address, req.TLS, reg)
	if err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}
	defer di.Close()

	resp, err := di.Invoke(ctx, req.Method, req.RequestJson, time.Duration(req.Timeout)*time.Second)
	if err != nil {
		writeInvokeResult(w, "", err, start)
		return
	}

	writeInvokeResult(w, resp, nil, start)
}

func HandleSchema(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req model.InvokeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if cacheEnabled {
		if cached, ok := grpcutil.GetCachedMethod(req.Address, req.TLS, req.Method); ok {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"template":     cached.Template,
				"inputType":    cached.InputType,
				"outputType":   cached.OutputType,
				"inputSchema":  cached.InputSchema,
				"outputSchema": cached.OutputSchema,
			})
			return
		}
	}

	ctx := r.Context()

	var reg *protoregistry.Files
	var err error

	if cacheEnabled {
		if cachedReg, ok := grpcutil.GetCachedRegistry(req.Address, req.TLS); ok {
			reg = cachedReg
		}
	}

	if reg == nil {
		rc, err := grpcutil.NewReflectionClient(ctx, req.Address, req.TLS)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}
		defer rc.Close()

		var serviceName string
		for i := len(req.Method) - 1; i >= 0; i-- {
			if req.Method[i] == '/' {
				serviceName = req.Method[1:i]
				break
			}
		}

		reg, err = rc.BuildResolver(ctx, serviceName)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		if cacheEnabled {
			grpcutil.CacheRegistry(req.Address, req.TLS, reg)
		}
	}

	md, err := grpcutil.ResolveMethodFromReg(reg, req.Method)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	template := grpcutil.GenerateJSONTemplate(md.Input())
	inputSchema := grpcutil.MessageToSchema(md.Input())
	outputSchema := grpcutil.MessageToSchema(md.Output())

	if cacheEnabled {
		grpcutil.CacheMethod(req.Address, req.TLS, req.Method, &grpcutil.MethodCacheEntry{
			Template:     template,
			InputType:    string(md.Input().FullName()),
			OutputType:   string(md.Output().FullName()),
			InputSchema:  inputSchema,
			OutputSchema: outputSchema,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"template":     template,
		"inputType":    string(md.Input().FullName()),
		"outputType":   string(md.Output().FullName()),
		"inputSchema":  inputSchema,
		"outputSchema": outputSchema,
	})
}
