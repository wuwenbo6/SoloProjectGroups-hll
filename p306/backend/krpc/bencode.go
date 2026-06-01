package krpc

import (
	"bytes"
	"errors"
	"fmt"
	"sort"
	"strconv"
)

func Encode(data interface{}) ([]byte, error) {
	var buf bytes.Buffer
	err := encodeValue(&buf, data)
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func encodeValue(buf *bytes.Buffer, data interface{}) error {
	switch v := data.(type) {
	case string:
		buf.WriteString(strconv.Itoa(len(v)))
		buf.WriteByte(':')
		buf.WriteString(v)
	case []byte:
		buf.WriteString(strconv.Itoa(len(v)))
		buf.WriteByte(':')
		buf.Write(v)
	case int:
		buf.WriteByte('i')
		buf.WriteString(strconv.Itoa(v))
		buf.WriteByte('e')
	case int64:
		buf.WriteByte('i')
		buf.WriteString(strconv.FormatInt(v, 10))
		buf.WriteByte('e')
	case []interface{}:
		buf.WriteByte('l')
		for _, item := range v {
			if err := encodeValue(buf, item); err != nil {
				return err
			}
		}
		buf.WriteByte('e')
	case map[string]interface{}:
		buf.WriteByte('d')
		keys := make([]string, 0, len(v))
		for k := range v {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if err := encodeValue(buf, k); err != nil {
				return err
			}
			if err := encodeValue(buf, v[k]); err != nil {
				return err
			}
		}
		buf.WriteByte('e')
	default:
		return fmt.Errorf("unsupported type: %T", data)
	}
	return nil
}

func Decode(data []byte) (interface{}, error) {
	buf := bytes.NewBuffer(data)
	return decodeValue(buf)
}

func decodeValue(buf *bytes.Buffer) (interface{}, error) {
	b, err := buf.ReadByte()
	if err != nil {
		return nil, err
	}
	switch b {
	case 'i':
		return decodeInt(buf)
	case 'l':
		return decodeList(buf)
	case 'd':
		return decodeDict(buf)
	default:
		buf.UnreadByte()
		return decodeString(buf)
	}
}

func decodeInt(buf *bytes.Buffer) (interface{}, error) {
	var num []byte
	for {
		b, err := buf.ReadByte()
		if err != nil {
			return nil, err
		}
		if b == 'e' {
			break
		}
		num = append(num, b)
	}
	val, err := strconv.ParseInt(string(num), 10, 64)
	if err != nil {
		return nil, err
	}
	return int(val), nil
}

func decodeString(buf *bytes.Buffer) (interface{}, error) {
	var length []byte
	for {
		b, err := buf.ReadByte()
		if err != nil {
			return nil, err
		}
		if b == ':' {
			break
		}
		length = append(length, b)
	}
	l, err := strconv.Atoi(string(length))
	if err != nil {
		return nil, err
	}
	data := make([]byte, l)
	n, err := buf.Read(data)
	if n != l {
		return nil, errors.New("short read in string")
	}
	if err != nil {
		return nil, err
	}
	if isBinary(data) {
		return data, nil
	}
	return string(data), nil
}

func isBinary(data []byte) bool {
	for _, b := range data {
		if b < 0x20 || b > 0x7e {
			return true
		}
	}
	return false
}

func decodeList(buf *bytes.Buffer) (interface{}, error) {
	var list []interface{}
	for {
		peek, err := buf.ReadByte()
		if err != nil {
			return nil, err
		}
		if peek == 'e' {
			break
		}
		buf.UnreadByte()
		val, err := decodeValue(buf)
		if err != nil {
			return nil, err
		}
		list = append(list, val)
	}
	return list, nil
}

func decodeDict(buf *bytes.Buffer) (interface{}, error) {
	dict := make(map[string]interface{})
	for {
		peek, err := buf.ReadByte()
		if err != nil {
			return nil, err
		}
		if peek == 'e' {
			break
		}
		buf.UnreadByte()
		keyVal, err := decodeValue(buf)
		if err != nil {
			return nil, err
		}
		var key string
		switch k := keyVal.(type) {
		case string:
			key = k
		case []byte:
			key = string(k)
		default:
			return nil, fmt.Errorf("dict key must be string, got %T", keyVal)
		}
		val, err := decodeValue(buf)
		if err != nil {
			return nil, err
		}
		dict[key] = val
	}
	return dict, nil
}
