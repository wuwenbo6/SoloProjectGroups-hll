package handler

import (
	"encoding/json"
	"net/http"

	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"

	"grpc-invoker/backend/grpcutil"
	"grpc-invoker/backend/model"
)

func HandleServices(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req model.ServicesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
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

		reg, err = rc.BuildResolver(ctx, req.Service)
		if err != nil {
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		if cacheEnabled {
			grpcutil.CacheRegistry(req.Address, req.TLS, reg)
		}
	}

	methods, err := extractMethods(reg, req.Service)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	resp := model.ServicesResponse{
		Service: req.Service,
		Methods: methods,
	}

	writeJSON(w, http.StatusOK, resp)
}

func extractMethods(reg *protoregistry.Files, serviceName string) ([]model.MethodInfo, error) {
	var result []model.MethodInfo

	var found bool

	reg.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		services := fd.Services()
		for i := 0; i < services.Len(); i++ {
			sd := services.Get(i)
			if sd.FullName() != protoreflect.FullName(serviceName) {
				continue
			}
			found = true
			methods := sd.Methods()
			for j := 0; j < methods.Len(); j++ {
				md := methods.Get(j)
				inputTypeName := string(md.Input().FullName())
				outputTypeName := string(md.Output().FullName())

				result = append(result, model.MethodInfo{
					Name:              string(md.Name()),
					FullMethod:        "/" + serviceName + "/" + string(md.Name()),
					InputType:         inputTypeName,
					OutputType:        outputTypeName,
					InputSchema:       grpcutil.MessageToSchema(md.Input()),
					OutputSchema:      grpcutil.MessageToSchema(md.Output()),
					IsServerStreaming: md.IsStreamingServer(),
					IsClientStreaming: md.IsStreamingClient(),
				})
			}
			return false
		}
		return true
	})

	if !found {
		return nil, nil
	}

	return result, nil
}
