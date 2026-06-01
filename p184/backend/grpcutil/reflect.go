package grpcutil

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/reflection/grpc_reflection_v1"
	"google.golang.org/grpc/reflection/grpc_reflection_v1alpha"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

type reflectionStream interface {
	SendListServices(symbol string) error
	Recv() ([]string, [][]byte, error)
	CloseSend() error
}

type streamV1 struct {
	s grpc_reflection_v1.ServerReflection_ServerReflectionInfoClient
}

func (s *streamV1) SendListServices(symbol string) error {
	return s.s.Send(&grpc_reflection_v1.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_ListServices{
			ListServices: symbol,
		},
	})
}

func (s *streamV1) Recv() ([]string, [][]byte, error) {
	resp, err := s.s.Recv()
	if err != nil {
		return nil, nil, err
	}
	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, nil, fmt.Errorf("reflection error: %s (code: %d)", errResp.ErrorMessage, errResp.ErrorCode)
	}
	if ls := resp.GetListServicesResponse(); ls != nil {
		svcs := make([]string, len(ls.Service))
		for i, svc := range ls.Service {
			svcs[i] = svc.Name
		}
		return svcs, nil, nil
	}
	if fd := resp.GetFileDescriptorResponse(); fd != nil {
		return nil, fd.FileDescriptorProto, nil
	}
	return nil, nil, fmt.Errorf("unexpected response type")
}

func (s *streamV1) CloseSend() error { return s.s.CloseSend() }

type streamV1alpha struct {
	s grpc_reflection_v1alpha.ServerReflection_ServerReflectionInfoClient
}

func (s *streamV1alpha) SendListServices(symbol string) error {
	return s.s.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_ListServices{
			ListServices: symbol,
		},
	})
}

func (s *streamV1alpha) Recv() ([]string, [][]byte, error) {
	resp, err := s.s.Recv()
	if err != nil {
		return nil, nil, err
	}
	if errResp := resp.GetErrorResponse(); errResp != nil {
		return nil, nil, fmt.Errorf("reflection error: %s (code: %d)", errResp.ErrorMessage, errResp.ErrorCode)
	}
	if ls := resp.GetListServicesResponse(); ls != nil {
		svcs := make([]string, len(ls.Service))
		for i, svc := range ls.Service {
			svcs[i] = svc.Name
		}
		return svcs, nil, nil
	}
	if fd := resp.GetFileDescriptorResponse(); fd != nil {
		return nil, fd.FileDescriptorProto, nil
	}
	return nil, nil, fmt.Errorf("unexpected response type")
}

func (s *streamV1alpha) CloseSend() error { return s.s.CloseSend() }

type ReflectionClient struct {
	conn      *grpc.ClientConn
	stream    reflectionStream
	useV1     bool
	mu        sync.Mutex
	fileCache map[string]*descriptorpb.FileDescriptorProto
}

func NewReflectionClient(ctx context.Context, address string, tls bool) (*ReflectionClient, error) {
	var opts []grpc.DialOption
	if !tls {
		opts = append(opts, grpc.WithTransportCredentials(insecure.NewCredentials()))
	}
	opts = append(opts, grpc.WithBlock(), grpc.WithTimeout(10*time.Second))

	conn, err := grpc.NewClient(address, opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to dial: %w", err)
	}

	rc := &ReflectionClient{
		conn:      conn,
		fileCache: make(map[string]*descriptorpb.FileDescriptorProto),
	}

	if err := rc.initStream(ctx); err != nil {
		conn.Close()
		return nil, err
	}

	return rc, nil
}

func (rc *ReflectionClient) initStream(ctx context.Context) error {
	v1Client := grpc_reflection_v1.NewServerReflectionClient(rc.conn)
	v1Stream, err := v1Client.ServerReflectionInfo(ctx)
	if err == nil {
		rc.stream = &streamV1{s: v1Stream}
		rc.useV1 = true
		if err := rc.stream.SendListServices("*"); err == nil {
			if _, _, err := rc.stream.Recv(); err == nil {
				return nil
			}
		}
		rc.stream.CloseSend()
	}

	v1aClient := grpc_reflection_v1alpha.NewServerReflectionClient(rc.conn)
	v1aStream, err := v1aClient.ServerReflectionInfo(ctx)
	if err != nil {
		return fmt.Errorf("failed to create reflection stream (v1 and v1alpha failed): %w", err)
	}
	rc.stream = &streamV1alpha{s: v1aStream}
	rc.useV1 = false

	if err := rc.stream.SendListServices("*"); err != nil {
		rc.stream.CloseSend()
		return fmt.Errorf("failed to test reflection stream: %w", err)
	}
	if _, _, err := rc.stream.Recv(); err != nil {
		rc.stream.CloseSend()
		return fmt.Errorf("reflection test request failed: %w", err)
	}

	return nil
}

func (rc *ReflectionClient) Close() {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	if rc.stream != nil {
		rc.stream.CloseSend()
	}
	if rc.conn != nil {
		rc.conn.Close()
	}
}

func (rc *ReflectionClient) ListServices(ctx context.Context) ([]string, error) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if err := rc.stream.SendListServices("*"); err != nil {
		return nil, err
	}
	svcs, _, err := rc.stream.Recv()
	if err != nil {
		return nil, err
	}
	return svcs, nil
}

func (rc *ReflectionClient) sendFileBySymbol(symbol string) error {
	if rc.useV1 {
		return rc.stream.(*streamV1).s.Send(&grpc_reflection_v1.ServerReflectionRequest{
			MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileContainingSymbol{
				FileContainingSymbol: symbol,
			},
		})
	}
	return rc.stream.(*streamV1alpha).s.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileContainingSymbol{
			FileContainingSymbol: symbol,
		},
	})
}

func (rc *ReflectionClient) sendFileByName(filename string) error {
	if rc.useV1 {
		return rc.stream.(*streamV1).s.Send(&grpc_reflection_v1.ServerReflectionRequest{
			MessageRequest: &grpc_reflection_v1.ServerReflectionRequest_FileByFilename{
				FileByFilename: filename,
			},
		})
	}
	return rc.stream.(*streamV1alpha).s.Send(&grpc_reflection_v1alpha.ServerReflectionRequest{
		MessageRequest: &grpc_reflection_v1alpha.ServerReflectionRequest_FileByFilename{
			FileByFilename: filename,
		},
	})
}

func (rc *ReflectionClient) FileBySymbol(ctx context.Context, symbol string) (*descriptorpb.FileDescriptorProto, error) {
	rc.mu.Lock()
	defer rc.mu.Unlock()

	if err := rc.sendFileBySymbol(symbol); err != nil {
		return nil, err
	}
	_, fds, err := rc.stream.Recv()
	if err != nil {
		return nil, err
	}
	if len(fds) == 0 {
		return nil, fmt.Errorf("no file descriptor for symbol %s", symbol)
	}
	return rc.processFile(fds[0])
}

func (rc *ReflectionClient) processFile(raw []byte) (*descriptorpb.FileDescriptorProto, error) {
	fd := &descriptorpb.FileDescriptorProto{}
	if err := proto.Unmarshal(raw, fd); err != nil {
		return nil, fmt.Errorf("failed to unmarshal file descriptor: %w", err)
	}
	rc.fileCache[fd.GetName()] = fd
	return fd, nil
}

func (rc *ReflectionClient) GetFileDescriptor(ctx context.Context, filename string) (*descriptorpb.FileDescriptorProto, error) {
	if fd, ok := rc.fileCache[filename]; ok {
		return fd, nil
	}

	rc.mu.Lock()
	defer rc.mu.Unlock()

	if err := rc.sendFileByName(filename); err != nil {
		return nil, err
	}
	_, fds, err := rc.stream.Recv()
	if err != nil {
		return nil, err
	}
	if len(fds) == 0 {
		return nil, fmt.Errorf("no file descriptor for %s", filename)
	}
	return rc.processFile(fds[0])
}

func (rc *ReflectionClient) loadDependencies(ctx context.Context, fd *descriptorpb.FileDescriptorProto, files map[string]*descriptorpb.FileDescriptorProto) error {
	for _, dep := range fd.GetDependency() {
		if _, ok := files[dep]; ok {
			continue
		}
		depFd, err := rc.GetFileDescriptor(ctx, dep)
		if err != nil {
			return err
		}
		files[dep] = depFd
		if err := rc.loadDependencies(ctx, depFd, files); err != nil {
			return err
		}
	}
	return nil
}

func (rc *ReflectionClient) BuildResolver(ctx context.Context, serviceName string) (*protoregistry.Files, error) {
	fd, err := rc.FileBySymbol(ctx, serviceName)
	if err != nil {
		return nil, err
	}

	files := make(map[string]*descriptorpb.FileDescriptorProto)
	files[fd.GetName()] = fd
	if err := rc.loadDependencies(ctx, fd, files); err != nil {
		return nil, err
	}

	fileList := make([]*descriptorpb.FileDescriptorProto, 0, len(files))
	for _, f := range files {
		fileList = append(fileList, f)
	}

	reg, err := protodesc.NewFiles(&descriptorpb.FileDescriptorSet{
		File: fileList,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to build resolver: %w", err)
	}

	return reg, nil
}

func MessageToSchema(md protoreflect.MessageDescriptor) map[string]interface{} {
	schema := make(map[string]interface{})
	fields := md.Fields()
	for i := 0; i < fields.Len(); i++ {
		fd := fields.Get(i)
		var typeName string
		switch fd.Kind() {
		case protoreflect.BoolKind:
			typeName = "bool"
		case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
			typeName = "int32"
		case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
			typeName = "int64"
		case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
			typeName = "uint32"
		case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
			typeName = "uint64"
		case protoreflect.FloatKind:
			typeName = "float"
		case protoreflect.DoubleKind:
			typeName = "double"
		case protoreflect.StringKind:
			typeName = "string"
		case protoreflect.BytesKind:
			typeName = "bytes"
		case protoreflect.EnumKind:
			typeName = "enum:" + string(fd.Enum().FullName())
		case protoreflect.MessageKind:
			typeName = "message:" + string(fd.Message().FullName())
		default:
			typeName = "unknown"
		}

		if fd.IsList() {
			typeName = "[]" + typeName
		}
		if fd.IsMap() {
			typeName = "map<>"
		}

		schema[string(fd.Name())] = map[string]interface{}{
			"type":     typeName,
			"number":   fd.Number(),
			"required": fd.HasPresence(),
		}
	}
	return schema
}

func GenerateJSONTemplate(md protoreflect.MessageDescriptor) string {
	msg := dynamicpb.NewMessage(md)
	fields := md.Fields()
	for i := 0; i < fields.Len(); i++ {
		fd := fields.Get(i)
		if fd.IsMap() || fd.IsList() {
			continue
		}
		switch fd.Kind() {
		case protoreflect.MessageKind:
			sub := dynamicpb.NewMessage(fd.Message())
			msg.Set(fd, protoreflect.ValueOfMessage(sub))
		case protoreflect.StringKind:
			msg.Set(fd, protoreflect.ValueOfString(""))
		case protoreflect.BoolKind:
			msg.Set(fd, protoreflect.ValueOfBool(false))
		case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
			msg.Set(fd, protoreflect.ValueOfInt32(0))
		case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
			msg.Set(fd, protoreflect.ValueOfInt64(0))
		case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
			msg.Set(fd, protoreflect.ValueOfUint32(0))
		case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
			msg.Set(fd, protoreflect.ValueOfUint64(0))
		case protoreflect.FloatKind:
			msg.Set(fd, protoreflect.ValueOfFloat32(0))
		case protoreflect.DoubleKind:
			msg.Set(fd, protoreflect.ValueOfFloat64(0.0))
		case protoreflect.EnumKind:
			if fd.Enum().Values().Len() > 0 {
				msg.Set(fd, protoreflect.ValueOfEnum(fd.Enum().Values().Get(0).Number()))
			}
		}
	}

	marshaler := protojson.MarshalOptions{
		Indent:          "  ",
		EmitUnpopulated: true,
		UseProtoNames:   true,
	}
	b, err := marshaler.Marshal(msg)
	if err != nil {
		return "{}"
	}
	result := string(b)
	result = strings.ReplaceAll(result, "\"\"", "\"<string>\"")
	return result
}
