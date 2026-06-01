package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
	"google.golang.org/protobuf/types/dynamicpb"
)

const (
	port = ":50051"
)

var fileDescriptorProto = &descriptorpb.FileDescriptorProto{
	Name:    proto.String("helloworld.proto"),
	Package: proto.String("helloworld"),
	Syntax:  proto.String("proto3"),
	MessageType: []*descriptorpb.DescriptorProto{
		{
			Name: proto.String("HelloRequest"),
			Field: []*descriptorpb.FieldDescriptorProto{
				{
					Name:   proto.String("name"),
					Number: proto.Int32(1),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_STRING.Enum(),
					Label:  descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
				},
			},
		},
		{
			Name: proto.String("HelloReply"),
			Field: []*descriptorpb.FieldDescriptorProto{
				{
					Name:   proto.String("message"),
					Number: proto.Int32(1),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_STRING.Enum(),
					Label:  descriptorpb.FieldDescriptorProto_LABEL_OPTIONAL.Enum(),
				},
			},
		},
		{
			Name: proto.String("EchoRequest"),
			Field: []*descriptorpb.FieldDescriptorProto{
				{
					Name:   proto.String("value"),
					Number: proto.Int32(1),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_STRING.Enum(),
				},
				{
					Name:   proto.String("count"),
					Number: proto.Int32(2),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_INT32.Enum(),
				},
			},
		},
		{
			Name: proto.String("EchoReply"),
			Field: []*descriptorpb.FieldDescriptorProto{
				{
					Name:   proto.String("value"),
					Number: proto.Int32(1),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_STRING.Enum(),
				},
				{
					Name:   proto.String("count"),
					Number: proto.Int32(2),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_INT32.Enum(),
				},
				{
					Name:   proto.String("timestamp"),
					Number: proto.Int32(3),
					Type:   descriptorpb.FieldDescriptorProto_TYPE_INT64.Enum(),
				},
			},
		},
	},
	Service: []*descriptorpb.ServiceDescriptorProto{
		{
			Name: proto.String("Greeter"),
			Method: []*descriptorpb.MethodDescriptorProto{
				{
					Name:       proto.String("SayHello"),
					InputType:  proto.String(".helloworld.HelloRequest"),
					OutputType: proto.String(".helloworld.HelloReply"),
				},
				{
					Name:       proto.String("Echo"),
					InputType:  proto.String(".helloworld.EchoRequest"),
					OutputType: proto.String(".helloworld.EchoReply"),
				},
				{
					Name:            proto.String("ServerStream"),
					InputType:       proto.String(".helloworld.EchoRequest"),
					OutputType:      proto.String(".helloworld.EchoReply"),
					ServerStreaming: proto.Bool(true),
				},
			},
		},
	},
}

type greeterServer struct{}

func (s *greeterServer) SayHello(ctx context.Context, req interface{}) (interface{}, error) {
	msg := req.(protoreflect.ProtoMessage).ProtoReflect()
	nameField := msg.Descriptor().Fields().ByName("name")
	name := msg.Get(nameField).String()

	replyDesc, err := findMessageType("helloworld.HelloReply")
	if err != nil {
		return nil, err
	}
	reply := dynamicpb.NewMessage(replyDesc)
	messageField := replyDesc.Fields().ByName("message")
	reply.Set(messageField, protoreflect.ValueOfString(fmt.Sprintf("Hello, %s!", name)))

	return reply, nil
}

func (s *greeterServer) Echo(ctx context.Context, req interface{}) (interface{}, error) {
	msg := req.(protoreflect.ProtoMessage).ProtoReflect()
	valueField := msg.Descriptor().Fields().ByName("value")
	countField := msg.Descriptor().Fields().ByName("count")
	value := msg.Get(valueField).String()
	count := msg.Get(countField).Int()

	replyDesc, err := findMessageType("helloworld.EchoReply")
	if err != nil {
		return nil, err
	}
	reply := dynamicpb.NewMessage(replyDesc)
	reply.Set(replyDesc.Fields().ByName("value"), protoreflect.ValueOfString(fmt.Sprintf("Echo: %s", value)))
	reply.Set(replyDesc.Fields().ByName("count"), protoreflect.ValueOfInt64(count))
	reply.Set(replyDesc.Fields().ByName("timestamp"), protoreflect.ValueOfInt64(time.Now().Unix()))

	return reply, nil
}

var fileDesc protoreflect.FileDescriptor

func findMessageType(name string) (protoreflect.MessageDescriptor, error) {
	fullName := protoreflect.FullName(name)
	msgs := fileDesc.Messages()
	for i := 0; i < msgs.Len(); i++ {
		md := msgs.Get(i)
		if md.FullName() == fullName {
			return md, nil
		}
	}
	return nil, fmt.Errorf("message %s not found", name)
}

type dynamicHandler struct {
	methods map[string]func(context.Context, interface{}) (interface{}, error)
}

func (h *dynamicHandler) SayHelloHandler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	inDesc, _ := findMessageType("helloworld.HelloRequest")
	in := dynamicpb.NewMessage(inDesc)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return h.methods["SayHello"](ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/helloworld.Greeter/SayHello"}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return h.methods["SayHello"](ctx, req)
	}
	return interceptor(ctx, in, info, handler)
}

func (h *dynamicHandler) EchoHandler(srv interface{}, ctx context.Context, dec func(interface{}) error, interceptor grpc.UnaryServerInterceptor) (interface{}, error) {
	inDesc, _ := findMessageType("helloworld.EchoRequest")
	in := dynamicpb.NewMessage(inDesc)
	if err := dec(in); err != nil {
		return nil, err
	}
	if interceptor == nil {
		return h.methods["Echo"](ctx, in)
	}
	info := &grpc.UnaryServerInfo{Server: srv, FullMethod: "/helloworld.Greeter/Echo"}
	handler := func(ctx context.Context, req interface{}) (interface{}, error) {
		return h.methods["Echo"](ctx, req)
	}
	return interceptor(ctx, in, info, handler)
}

func main() {
	var err error
	fileDesc, err = protodesc.NewFile(fileDescriptorProto, protoregistry.GlobalFiles)
	if err != nil {
		log.Fatalf("failed to create file descriptor: %v", err)
	}

	if err := protoregistry.GlobalFiles.RegisterFile(fileDesc); err != nil {
		log.Printf("warning: failed to register file descriptor globally: %v", err)
	}

	reg := grpc.NewServer()

	greeter := &greeterServer{}
	handler := &dynamicHandler{
		methods: map[string]func(context.Context, interface{}) (interface{}, error){
			"SayHello": greeter.SayHello,
			"Echo":     greeter.Echo,
		},
	}

	sd := &grpc.ServiceDesc{
		ServiceName: "helloworld.Greeter",
		HandlerType: (*interface{})(nil),
		Methods: []grpc.MethodDesc{
			{
				MethodName: "SayHello",
				Handler:    handler.SayHelloHandler,
			},
			{
				MethodName: "Echo",
				Handler:    handler.EchoHandler,
			},
		},
		Streams: []grpc.StreamDesc{
			{
				StreamName:    "ServerStream",
				Handler:       func(srv interface{}, stream grpc.ServerStream) error { return nil },
				ServerStreams: true,
			},
		},
		Metadata: "helloworld.proto",
	}

	reg.RegisterService(sd, greeter)

	reflection.Register(reg)

	lis, err := net.Listen("tcp", port)
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	log.Printf("Test gRPC server listening on port %s", port)
	log.Printf("Services:")
	log.Printf("  helloworld.Greeter")
	log.Printf("    - SayHello(HelloRequest) returns (HelloReply)")
	log.Printf("    - Echo(EchoRequest) returns (EchoReply)")
	log.Printf("    - ServerStream(EchoRequest) returns (stream EchoReply)")

	if err := reg.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
