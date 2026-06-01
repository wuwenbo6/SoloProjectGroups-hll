package grpcutil

import (
	"encoding/json"
	"fmt"
	"math"

	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/dynamicpb"
)

func UnmarshalJSONToMessage(jsonStr string, md protoreflect.MessageDescriptor) (*dynamicpb.Message, error) {
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(jsonStr), &raw); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w", err)
	}

	msg := dynamicpb.NewMessage(md)
	if err := populateMessageFromMap(msg, raw, md); err != nil {
		return nil, err
	}

	return msg, nil
}

func populateMessageFromMap(msg *dynamicpb.Message, data map[string]interface{}, md protoreflect.MessageDescriptor) error {
	fields := md.Fields()

	for jsonKey, value := range data {
		fd := fields.ByJSONName(jsonKey)
		if fd == nil {
			fd = fields.ByName(protoreflect.Name(jsonKey))
		}
		if fd == nil {
			continue
		}

		if fd.ContainingOneof() != nil {
			od := fd.ContainingOneof()
			oneofFields := od.Fields()
			for i := 0; i < oneofFields.Len(); i++ {
				of := oneofFields.Get(i)
				if msg.Has(of) {
					msg.Clear(of)
				}
			}
		}

		if value == nil {
			continue
		}

		var err error
		switch {
		case fd.IsList():
			err = setRepeatedField(msg, fd, value)
		case fd.IsMap():
			err = setMapField(msg, fd, value)
		default:
			err = setSingularField(msg, fd, value)
		}
		if err != nil {
			return fmt.Errorf("field %s: %w", fd.Name(), err)
		}
	}

	return nil
}

func setSingularField(msg *dynamicpb.Message, fd protoreflect.FieldDescriptor, value interface{}) error {
	protoValue, err := convertToProtoValue(fd, value)
	if err != nil {
		return err
	}
	msg.Set(fd, protoValue)
	return nil
}

func setRepeatedField(msg *dynamicpb.Message, fd protoreflect.FieldDescriptor, value interface{}) error {
	arr, ok := value.([]interface{})
	if !ok {
		return fmt.Errorf("expected array for repeated field")
	}

	list := msg.Mutable(fd).List()
	for _, item := range arr {
		protoValue, err := convertToProtoValue(fd, item)
		if err != nil {
			return err
		}
		list.Append(protoValue)
	}

	return nil
}

func setMapField(msg *dynamicpb.Message, fd protoreflect.FieldDescriptor, value interface{}) error {
	m, ok := value.(map[string]interface{})
	if !ok {
		return fmt.Errorf("expected object for map field")
	}

	mapField := msg.Mutable(fd).Map()
	keyFD := fd.MapKey()
	valFD := fd.MapValue()

	for k, v := range m {
		keyValue, err := convertToProtoValue(keyFD, k)
		if err != nil {
			return fmt.Errorf("map key: %w", err)
		}

		valValue, err := convertToProtoValue(valFD, v)
		if err != nil {
			return fmt.Errorf("map value: %w", err)
		}

		mapField.Set(keyValue.MapKey(), valValue)
	}

	return nil
}

func convertToProtoValue(fd protoreflect.FieldDescriptor, value interface{}) (protoreflect.Value, error) {
	switch fd.Kind() {
	case protoreflect.BoolKind:
		v, ok := value.(bool)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("expected bool")
		}
		return protoreflect.ValueOfBool(v), nil

	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind:
		return protoreflect.ValueOfInt32(convertToInt32(value)), nil

	case protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		return protoreflect.ValueOfInt64(convertToInt64(value)), nil

	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind:
		return protoreflect.ValueOfUint32(convertToUint32(value)), nil

	case protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return protoreflect.ValueOfUint64(convertToUint64(value)), nil

	case protoreflect.FloatKind:
		return protoreflect.ValueOfFloat32(convertToFloat32(value)), nil

	case protoreflect.DoubleKind:
		return protoreflect.ValueOfFloat64(convertToFloat64(value)), nil

	case protoreflect.StringKind:
		v, ok := value.(string)
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("expected string")
		}
		return protoreflect.ValueOfString(v), nil

	case protoreflect.BytesKind:
		switch v := value.(type) {
		case string:
			return protoreflect.ValueOfBytes([]byte(v)), nil
		case []byte:
			return protoreflect.ValueOfBytes(v), nil
		default:
			return protoreflect.Value{}, fmt.Errorf("expected string or bytes")
		}

	case protoreflect.EnumKind:
		ed := fd.Enum()
		switch v := value.(type) {
		case string:
			ev := ed.Values().ByName(protoreflect.Name(v))
			if ev == nil {
				return protoreflect.Value{}, fmt.Errorf("unknown enum value: %s", v)
			}
			return protoreflect.ValueOfEnum(ev.Number()), nil
		case float64:
			return protoreflect.ValueOfEnum(protoreflect.EnumNumber(int32(math.Round(v)))), nil
		case int:
			return protoreflect.ValueOfEnum(protoreflect.EnumNumber(v)), nil
		case int32:
			return protoreflect.ValueOfEnum(protoreflect.EnumNumber(v)), nil
		default:
			return protoreflect.Value{}, fmt.Errorf("expected string or number for enum")
		}

	case protoreflect.MessageKind:
		subMD := fd.Message()
		subMsg := dynamicpb.NewMessage(subMD)

		m, ok := value.(map[string]interface{})
		if !ok {
			return protoreflect.Value{}, fmt.Errorf("expected object for message")
		}

		if err := populateMessageFromMap(subMsg, m, subMD); err != nil {
			return protoreflect.Value{}, err
		}

		return protoreflect.ValueOfMessage(subMsg), nil

	default:
		return protoreflect.Value{}, fmt.Errorf("unsupported field kind: %s", fd.Kind())
	}
}

func convertToInt32(v interface{}) int32 {
	switch val := v.(type) {
	case float64:
		return int32(math.Round(val))
	case float32:
		return int32(math.Round(float64(val)))
	case int:
		return int32(val)
	case int32:
		return val
	case int64:
		return int32(val)
	case string:
		return int32(0)
	default:
		return 0
	}
}

func convertToInt64(v interface{}) int64 {
	switch val := v.(type) {
	case float64:
		return int64(math.Round(val))
	case float32:
		return int64(math.Round(float64(val)))
	case int:
		return int64(val)
	case int32:
		return int64(val)
	case int64:
		return val
	case string:
		return int64(0)
	default:
		return 0
	}
}

func convertToUint32(v interface{}) uint32 {
	switch val := v.(type) {
	case float64:
		return uint32(math.Round(val))
	case float32:
		return uint32(math.Round(float64(val)))
	case int:
		return uint32(val)
	case uint32:
		return val
	case uint64:
		return uint32(val)
	case string:
		return uint32(0)
	default:
		return 0
	}
}

func convertToUint64(v interface{}) uint64 {
	switch val := v.(type) {
	case float64:
		return uint64(math.Round(val))
	case float32:
		return uint64(math.Round(float64(val)))
	case int:
		return uint64(val)
	case uint32:
		return uint64(val)
	case uint64:
		return val
	case string:
		return uint64(0)
	default:
		return 0
	}
}

func convertToFloat32(v interface{}) float32 {
	switch val := v.(type) {
	case float64:
		return float32(val)
	case float32:
		return val
	case int:
		return float32(val)
	case int32:
		return float32(val)
	case int64:
		return float32(val)
	default:
		return 0
	}
}

func convertToFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int32:
		return float64(val)
	case int64:
		return float64(val)
	default:
		return 0
	}
}
