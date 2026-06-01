package grpcutil

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/dynamicpb"
)

type DynamicInvoker struct {
	conn    *grpc.ClientConn
	reg     *protoregistry.Files
	address string
}

func NewDynamicInvoker(ctx context.Context, address string, tls bool, reg *protoregistry.Files) (*DynamicInvoker, error) {
	var opts []grpc.DialOption
	if !tls {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}
	opts = append(opts, grpc.WithBlock(), grpc.WithTimeout(10*time.Second))

	conn, err := grpc.NewClient(address, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to dial: %w", err)
	}

	return &DynamicInvoker{
		conn:    conn,
		reg:     reg,
		address: address,
	}, nil
}

func (di *DynamicInvoker) Close() {
	if di.conn != nil {
		di.conn.Close()
	}
}

func (di *DynamicInvoker) Invoke(ctx context.Context, fullMethod string, requestJson string, timeout time.Duration) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	sd, err := di.resolveMethod(fullMethod)
	if err != nil {
		return "", err
	}

	inputDesc := sd.Input()
	outputDesc := sd.Output()

	inputMsg, err := UnmarshalJSONToMessage(requestJson, inputDesc)
	if err != nil {
		return "", fmt.Errorf("failed to convert request JSON: %w", err)
	}

	md := metadata.Pairs()
	ctx = metadata.NewOutgoingContext(ctx, md)

	outputMsg := dynamicpb.NewMessage(outputDesc)

	opts := []grpc.CallOption{}
	if err := di.conn.Invoke(ctx, fullMethod, inputMsg, outputMsg, opts...); err != nil {
		return "", fmt.Errorf("rpc call failed: %w", err)
	}

	marshaler := protojson.MarshalOptions{
		Indent:          "  ",
		EmitUnpopulated: true,
		UseProtoNames:   true,
	}

	b, err := marshaler.Marshal(outputMsg)
	if err != nil {
		return "", fmt.Errorf("failed to marshal response: %w", err)
	}

	return string(b), nil
}

func (di *DynamicInvoker) resolveMethod(fullMethod string) (protoreflect.MethodDescriptor, error) {
	var methodName protoreflect.Name
	var serviceName protoreflect.FullName

	for i := len(fullMethod) - 1; i >= 0; i-- {
		if fullMethod[i] == '/' {
			serviceName = protoreflect.FullName(fullMethod[1:i])
			methodName = protoreflect.Name(fullMethod[i+1:])
			break
		}
	}

	if serviceName == "" || methodName == "" {
		return nil, fmt.Errorf("invalid method name: %s", fullMethod)
	}

	var sd protoreflect.ServiceDescriptor
	var found bool

	di.reg.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		services := fd.Services()
		for i := 0; i < services.Len(); i++ {
			s := services.Get(i)
			if s.FullName() == serviceName {
				sd = s
				found = true
				return false
			}
		}
		return true
	})

	if !found {
		return nil, fmt.Errorf("service not found: %s", serviceName)
	}

	methods := sd.Methods()
	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)
		if m.Name() == methodName {
			return m, nil
		}
	}

	return nil, fmt.Errorf("method not found: %s in service %s", methodName, serviceName)
}

func ResolveMethodFromReg(reg *protoregistry.Files, fullMethod string) (protoreflect.MethodDescriptor, error) {
	var methodName protoreflect.Name
	var serviceName protoreflect.FullName

	for i := len(fullMethod) - 1; i >= 0; i-- {
		if fullMethod[i] == '/' {
			serviceName = protoreflect.FullName(fullMethod[1:i])
			methodName = protoreflect.Name(fullMethod[i+1:])
			break
		}
	}

	if serviceName == "" || methodName == "" {
		return nil, fmt.Errorf("invalid method name: %s", fullMethod)
	}

	var sd protoreflect.ServiceDescriptor
	var found bool

	reg.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		services := fd.Services()
		for i := 0; i < services.Len(); i++ {
			s := services.Get(i)
			if s.FullName() == serviceName {
				sd = s
				found = true
				return false
			}
		}
		return true
	})

	if !found {
		return nil, fmt.Errorf("service not found: %s", serviceName)
	}

	methods := sd.Methods()
	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)
		if m.Name() == methodName {
			return m, nil
		}
	}

	return nil, fmt.Errorf("method not found: %s in service %s", methodName, serviceName)
}

func PrettyJSON(j string) string {
	var v interface{}
	if err := json.Unmarshal([]byte(j), &v); err != nil {
		return j
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return j
	}
	return string(b)
}
