package grpcutil

import (
	"fmt"
	"sort"
	"strings"

	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"
)

func ExportProtoSource(reg *protoregistry.Files, serviceName string) (map[string]string, error) {
	targetFiles := make(map[string]protoreflect.FileDescriptor)
	var serviceFD protoreflect.FileDescriptor

	reg.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		services := fd.Services()
		for i := 0; i < services.Len(); i++ {
			if services.Get(i).FullName() == protoreflect.FullName(serviceName) {
				serviceFD = fd
				return false
			}
		}
		return true
	})

	if serviceFD == nil {
		return nil, fmt.Errorf("service not found: %s", serviceName)
	}

	collectDependencies(reg, serviceFD, targetFiles)

	result := make(map[string]string)
	for name, fd := range targetFiles {
		result[name] = fileDescriptorToProto(fd)
	}

	return result, nil
}

func collectDependencies(reg *protoregistry.Files, fd protoreflect.FileDescriptor, collected map[string]protoreflect.FileDescriptor) {
	if _, ok := collected[fd.Path()]; ok {
		return
	}
	collected[fd.Path()] = fd

	imports := fd.Imports()
	for i := 0; i < imports.Len(); i++ {
		imp := imports.Get(i)
		if dep, err := reg.FindFileByPath(imp.Path()); err == nil {
			collectDependencies(reg, dep, collected)
		}
	}
}

func fileDescriptorToProto(fd protoreflect.FileDescriptor) string {
	var b strings.Builder

	if fd.Syntax() == protoreflect.Proto3 {
		b.WriteString("syntax = \"proto3\";\n\n")
	} else {
		b.WriteString("syntax = \"proto2\";\n\n")
	}

	if fd.Package() != "" {
		b.WriteString(fmt.Sprintf("package %s;\n\n", fd.Package()))
	}

	imports := fd.Imports()
	if imports.Len() > 0 {
		for i := 0; i < imports.Len(); i++ {
			b.WriteString(fmt.Sprintf("import \"%s\";\n", imports.Get(i).Path()))
		}
		b.WriteString("\n")
	}

	opts, ok := fd.Options().(*descriptorpb.FileOptions)
	if ok && opts != nil {
		if opts.GoPackage != nil && *opts.GoPackage != "" {
			b.WriteString(fmt.Sprintf("option go_package = \"%s\";\n\n", *opts.GoPackage))
		}
	}

	enums := fd.Enums()
	for i := 0; i < enums.Len(); i++ {
		writeEnum(&b, enums.Get(i), "")
		b.WriteString("\n")
	}

	messages := fd.Messages()
	for i := 0; i < messages.Len(); i++ {
		md := messages.Get(i)
		if md.IsMapEntry() {
			continue
		}
		writeMessage(&b, md, "")
		b.WriteString("\n")
	}

	services := fd.Services()
	for i := 0; i < services.Len(); i++ {
		writeService(&b, services.Get(i))
		b.WriteString("\n")
	}

	return b.String()
}

func writeEnum(b *strings.Builder, ed protoreflect.EnumDescriptor, indent string) {
	b.WriteString(fmt.Sprintf("%senum %s {\n", indent, ed.Name()))

	values := ed.Values()
	for i := 0; i < values.Len(); i++ {
		v := values.Get(i)
		b.WriteString(fmt.Sprintf("%s  %s = %d;\n", indent, v.Name(), v.Number()))
	}

	b.WriteString(fmt.Sprintf("%s}\n", indent))
}

func writeMessage(b *strings.Builder, md protoreflect.MessageDescriptor, indent string) {
	b.WriteString(fmt.Sprintf("%smessage %s {\n", indent, md.Name()))

	fieldIndent := indent + "  "

	oneofs := md.Oneofs()
	for i := 0; i < oneofs.Len(); i++ {
		od := oneofs.Get(i)
		b.WriteString(fmt.Sprintf("%soneof %s {\n", fieldIndent, od.Name()))
		fields := od.Fields()
		for j := 0; j < fields.Len(); j++ {
			f := fields.Get(j)
			b.WriteString(fmt.Sprintf("%s  %s %s = %d;\n", fieldIndent, fieldType(f), f.Name(), f.Number()))
		}
		b.WriteString(fmt.Sprintf("%s}\n", fieldIndent))
	}

	fields := md.Fields()
	for i := 0; i < fields.Len(); i++ {
		f := fields.Get(i)
		if f.ContainingOneof() != nil {
			continue
		}
		if f.IsMap() {
			kf := f.MapKey()
			vf := f.MapValue()
			b.WriteString(fmt.Sprintf("%smap<%s, %s> %s = %d;\n", fieldIndent, fieldType(kf), fieldType(vf), f.Name(), f.Number()))
		} else if f.IsList() {
			b.WriteString(fmt.Sprintf("%srepeated %s %s = %d;\n", fieldIndent, fieldType(f), f.Name(), f.Number()))
		} else {
			optional := ""
			if f.HasOptionalKeyword() {
				optional = "optional "
			}
			b.WriteString(fmt.Sprintf("%s%s%s %s = %d;\n", fieldIndent, optional, fieldType(f), f.Name(), f.Number()))
		}
	}

	nestedEnums := md.Enums()
	for i := 0; i < nestedEnums.Len(); i++ {
		b.WriteString("\n")
		writeEnum(b, nestedEnums.Get(i), fieldIndent)
	}

	nestedMessages := md.Messages()
	for i := 0; i < nestedMessages.Len(); i++ {
		nmd := nestedMessages.Get(i)
		if nmd.IsMapEntry() {
			continue
		}
		b.WriteString("\n")
		writeMessage(b, nmd, fieldIndent)
	}

	b.WriteString(fmt.Sprintf("%s}\n", indent))
}

func writeService(b *strings.Builder, sd protoreflect.ServiceDescriptor) {
	b.WriteString(fmt.Sprintf("service %s {\n", sd.Name()))

	methods := sd.Methods()
	for i := 0; i < methods.Len(); i++ {
		m := methods.Get(i)
		inputName := string(m.Input().Name())
		outputName := string(m.Output().Name())
		if m.Input().FullName().Parent() != sd.FullName().Parent() {
			inputName = string(m.Input().FullName())
		}
		if m.Output().FullName().Parent() != sd.FullName().Parent() {
			outputName = string(m.Output().FullName())
		}
		b.WriteString(fmt.Sprintf("  rpc %s(%s%s) returns (%s%s) {}\n",
			m.Name(),
			streamKeyword(m.IsStreamingClient()),
			inputName,
			streamKeyword(m.IsStreamingServer()),
			outputName,
		))
	}

	b.WriteString("}\n")
}

func fieldType(fd protoreflect.FieldDescriptor) string {
	switch fd.Kind() {
	case protoreflect.BoolKind:
		return "bool"
	case protoreflect.Int32Kind:
		return "int32"
	case protoreflect.Sint32Kind:
		return "sint32"
	case protoreflect.Sfixed32Kind:
		return "sfixed32"
	case protoreflect.Int64Kind:
		return "int64"
	case protoreflect.Sint64Kind:
		return "sint64"
	case protoreflect.Sfixed64Kind:
		return "sfixed64"
	case protoreflect.Uint32Kind:
		return "uint32"
	case protoreflect.Fixed32Kind:
		return "fixed32"
	case protoreflect.Uint64Kind:
		return "uint64"
	case protoreflect.Fixed64Kind:
		return "fixed64"
	case protoreflect.FloatKind:
		return "float"
	case protoreflect.DoubleKind:
		return "double"
	case protoreflect.StringKind:
		return "string"
	case protoreflect.BytesKind:
		return "bytes"
	case protoreflect.EnumKind:
		return string(fd.Enum().FullName())
	case protoreflect.MessageKind:
		return string(fd.Message().FullName())
	default:
		return "unknown"
	}
}

func streamKeyword(isStreaming bool) string {
	if isStreaming {
		return "stream "
	}
	return ""
}

func GetProtoFileList(reg *protoregistry.Files, serviceName string) ([]string, error) {
	fileSet := make(map[string]bool)

	reg.RangeFiles(func(fd protoreflect.FileDescriptor) bool {
		services := fd.Services()
		for i := 0; i < services.Len(); i++ {
			if string(services.Get(i).FullName()) == serviceName {
				fileSet[fd.Path()] = true
				collectDependencyPaths(reg, fd, fileSet)
				return false
			}
		}
		return true
	})

	if len(fileSet) == 0 {
		return nil, fmt.Errorf("service not found: %s", serviceName)
	}

	result := make([]string, 0, len(fileSet))
	for f := range fileSet {
		result = append(result, f)
	}
	sort.Strings(result)
	return result, nil
}

func collectDependencyPaths(reg *protoregistry.Files, fd protoreflect.FileDescriptor, collected map[string]bool) {
	imports := fd.Imports()
	for i := 0; i < imports.Len(); i++ {
		imp := imports.Get(i)
		if !collected[imp.Path()] {
			collected[imp.Path()] = true
			if dep, err := reg.FindFileByPath(imp.Path()); err == nil {
				collectDependencyPaths(reg, dep, collected)
			}
		}
	}
}
