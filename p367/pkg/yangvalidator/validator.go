package yangvalidator

import (
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

type ValidationError struct {
	Path    string `json:"path"`
	Message string `json:"message"`
	Type    string `json:"type"`
}

type MustCondition struct {
	XPath       string `json:"xpath"`
	Description string `json:"description,omitempty"`
}

type SchemaNode struct {
	Name          string
	Type          string
	BaseType      string
	Description   string
	Mandatory     bool
	Default       string
	MinValue      *float64
	MaxValue      *float64
	Pattern       string
	LengthMin     *int
	LengthMax     *int
	EnumValues    []string
	Children      map[string]*SchemaNode
	IsList        bool
	IsLeafList    bool
	Key           string
	Typedefs      map[string]*SchemaNode
	Units         string
	MustConditions []MustCondition
}

type DataNode struct {
	Name       string
	Value      string
	Children   []*DataNode
	Attributes map[string]string
	IsListEntry bool
}

func NewSchemaNode(name string) *SchemaNode {
	return &SchemaNode{
		Name:     name,
		Children: make(map[string]*SchemaNode),
		Typedefs: make(map[string]*SchemaNode),
	}
}

func (sn *SchemaNode) AddChild(child *SchemaNode) {
	sn.Children[child.Name] = child
}

func ParseYANG(content string) (*SchemaNode, error) {
	root := NewSchemaNode("root")
	var stack []*SchemaNode
	stack = append(stack, root)

	tokens := tokenizeYANG(content)
	i := 0

	for i < len(tokens) {
		token := tokens[i]

		switch token {
		case "container", "list", "leaf", "leaf-list":
			if i+1 < len(tokens) {
				nodeType := token
				nodeName := tokens[i+1]
				i += 2

				newNode := NewSchemaNode(nodeName)
				newNode.Type = nodeType

				if nodeType == "list" {
					newNode.IsList = true
				}
				if nodeType == "leaf-list" {
					newNode.IsLeafList = true
				}

				parent := stack[len(stack)-1]
				parent.AddChild(newNode)

				if i < len(tokens) && tokens[i] == "{" {
					stack = append(stack, newNode)
					i++
					continue
				}
			}
		case "typedef":
			if i+1 < len(tokens) {
				typedefName := tokens[i+1]
				i += 2

				typedefNode := NewSchemaNode(typedefName)

				if i < len(tokens) && tokens[i] == "{" {
					i++
					braceCount := 1
					for i < len(tokens) && braceCount > 0 {
						switch tokens[i] {
						case "{":
							braceCount++
							i++
						case "}":
							braceCount--
							i++
						case "type":
							if i+1 < len(tokens) {
								baseType := tokens[i+1]
								typedefNode.Type = baseType
								typedefNode.BaseType = baseType
								i += 2

								if i < len(tokens) && tokens[i] == "{" {
									i++
									typeBraceCount := 1
									for i < len(tokens) && typeBraceCount > 0 {
										switch tokens[i] {
										case "{":
											typeBraceCount++
											i++
										case "}":
											typeBraceCount--
											i++
										case "range":
											if i+1 < len(tokens) {
												rangeStr := tokens[i+1]
												rangeVals := strings.Split(rangeStr, "..")
												if len(rangeVals) == 2 {
													if min, err := strconv.ParseFloat(rangeVals[0], 64); err == nil {
														typedefNode.MinValue = &min
													}
													if max, err := strconv.ParseFloat(rangeVals[1], 64); err == nil {
														typedefNode.MaxValue = &max
													}
												}
											}
											i += 2
										case "length":
											if i+1 < len(tokens) {
												lengthStr := tokens[i+1]
												lengthVals := strings.Split(lengthStr, "..")
												if len(lengthVals) == 2 {
													if min, err := strconv.Atoi(lengthVals[0]); err == nil {
														typedefNode.LengthMin = &min
													}
													if max, err := strconv.Atoi(lengthVals[1]); err == nil {
														typedefNode.LengthMax = &max
													}
												}
											}
											i += 2
										case "pattern":
											if i+1 < len(tokens) {
												typedefNode.Pattern = strings.Trim(tokens[i+1], "\"';")
											}
											i += 2
										case "enum":
											if i+1 < len(tokens) {
												enumVal := strings.Trim(tokens[i+1], "\"';")
												typedefNode.EnumValues = append(typedefNode.EnumValues, enumVal)
											}
											i += 2
										default:
											i++
										}
									}
								}
							}
						case "description":
							if i+1 < len(tokens) {
								typedefNode.Description = strings.Trim(tokens[i+1], "\"';")
								i += 2
							}
						case "units":
							if i+1 < len(tokens) {
								typedefNode.Units = strings.Trim(tokens[i+1], "\"';")
								i += 2
							}
						default:
							i++
						}
					}
				}

				parent := stack[len(stack)-1]
				parent.Typedefs[typedefName] = typedefNode
				continue
			}
		case "type":
			if i+1 < len(tokens) && len(stack) > 1 {
				typeName := tokens[i+1]
				stack[len(stack)-1].Type = typeName
				i += 2

				if i < len(tokens) && tokens[i] == "{" {
					i++
					braceCount := 1
					for i < len(tokens) && braceCount > 0 {
						switch tokens[i] {
						case "{":
							braceCount++
							i++
						case "}":
							braceCount--
							i++
						case "range":
							if i+1 < len(tokens) {
								rangeStr := tokens[i+1]
								rangeVals := strings.Split(rangeStr, "..")
								if len(rangeVals) == 2 {
									if min, err := strconv.ParseFloat(rangeVals[0], 64); err == nil {
										stack[len(stack)-1].MinValue = &min
									}
									if max, err := strconv.ParseFloat(rangeVals[1], 64); err == nil {
										stack[len(stack)-1].MaxValue = &max
									}
								}
							}
							i += 2
						case "length":
							if i+1 < len(tokens) {
								lengthStr := tokens[i+1]
								lengthVals := strings.Split(lengthStr, "..")
								if len(lengthVals) == 2 {
									if min, err := strconv.Atoi(lengthVals[0]); err == nil {
										stack[len(stack)-1].LengthMin = &min
									}
									if max, err := strconv.Atoi(lengthVals[1]); err == nil {
										stack[len(stack)-1].LengthMax = &max
									}
								}
							}
							i += 2
						case "pattern":
							if i+1 < len(tokens) {
								stack[len(stack)-1].Pattern = strings.Trim(tokens[i+1], "\"';")
							}
							i += 2
						case "enum":
							if i+1 < len(tokens) {
								enumVal := strings.Trim(tokens[i+1], "\"';")
								stack[len(stack)-1].EnumValues = append(stack[len(stack)-1].EnumValues, enumVal)
							}
							i += 2
						default:
							i++
						}
					}
				}
				continue
			}
		case "mandatory":
			if i+1 < len(tokens) && len(stack) > 1 {
				stack[len(stack)-1].Mandatory = tokens[i+1] == "true"
				i += 2
				continue
			}
		case "default":
			if i+1 < len(tokens) && len(stack) > 1 {
				stack[len(stack)-1].Default = strings.Trim(tokens[i+1], "\"';")
				i += 2
				continue
			}
		case "key":
			if i+1 < len(tokens) && len(stack) > 1 {
				stack[len(stack)-1].Key = strings.Trim(tokens[i+1], "\"';")
				i += 2
				continue
			}
		case "description":
			if i+1 < len(tokens) && len(stack) > 1 {
				stack[len(stack)-1].Description = strings.Trim(tokens[i+1], "\"';")
				i += 2
				continue
			}
		case "units":
			if i+1 < len(tokens) && len(stack) > 1 {
				stack[len(stack)-1].Units = strings.Trim(tokens[i+1], "\"';")
				i += 2
				continue
			}
		case "must":
			if i+1 < len(tokens) && len(stack) > 1 {
				mustCond := MustCondition{
					XPath: strings.Trim(tokens[i+1], "\"';"),
				}
				i += 2

				if i < len(tokens) && tokens[i] == "{" {
					i++
					braceCount := 1
					for i < len(tokens) && braceCount > 0 {
						switch tokens[i] {
						case "{":
							braceCount++
							i++
						case "}":
							braceCount--
							i++
						case "description":
							if i+1 < len(tokens) {
								mustCond.Description = strings.Trim(tokens[i+1], "\"';")
								i += 2
							}
						default:
							i++
						}
					}
				}

				stack[len(stack)-1].MustConditions = append(stack[len(stack)-1].MustConditions, mustCond)
				continue
			}
		case "unique":
			i += 2
			continue
		case "{":
			i++
			continue
		case "}":
			if len(stack) > 1 {
				stack = stack[:len(stack)-1]
			}
			i++
			continue
		}

		i++
	}

	resolveDerivedTypes(root, root)

	return root, nil
}

var builtInTypes = map[string]bool{
	"int8":         true,
	"int16":        true,
	"int32":        true,
	"int64":        true,
	"int":          true,
	"uint8":        true,
	"uint16":       true,
	"uint32":       true,
	"uint64":       true,
	"uint":         true,
	"string":       true,
	"decimal64":     true,
	"number":       true,
	"float":        true,
	"boolean":      true,
	"bool":         true,
	"enumeration":  true,
	"enum":         true,
	"binary":       true,
	"bits":         true,
	"empty":        true,
	"instance-identifier": true,
	"leafref":      true,
	"identityref":  true,
	"union":        true,
}

func resolveDerivedTypes(node *SchemaNode, root *SchemaNode) {
	for _, child := range node.Children {
		if child.Type != "" && !isBuiltInType(child.Type) {
			typedef := findTypedef(root, child.Type)
			if typedef != nil {
				resolveTypedefConstraints(child, typedef, root)
			}
		}
		resolveDerivedTypes(child, root)
	}

	for _, typedef := range node.Typedefs {
		if typedef.Type != "" && !isBuiltInType(typedef.Type) {
			baseTypedef := findTypedef(root, typedef.Type)
			if baseTypedef != nil {
				resolveTypedefConstraints(typedef, baseTypedef, root)
			}
		}
	}
}

func resolveTypedefConstraints(target *SchemaNode, typedef *SchemaNode, root *SchemaNode) {
	if typedef.MinValue != nil && target.MinValue == nil {
		target.MinValue = typedef.MinValue
	}
	if typedef.MaxValue != nil && target.MaxValue == nil {
		target.MaxValue = typedef.MaxValue
	}
	if typedef.LengthMin != nil && target.LengthMin == nil {
		target.LengthMin = typedef.LengthMin
	}
	if typedef.LengthMax != nil && target.LengthMax == nil {
		target.LengthMax = typedef.LengthMax
	}
	if typedef.Pattern != "" && target.Pattern == "" {
		target.Pattern = typedef.Pattern
	}
	if len(typedef.EnumValues) > 0 && target.EnumValues == nil {
		target.EnumValues = typedef.EnumValues
	}
	if typedef.BaseType == "" {
		target.BaseType = typedef.Type
	} else {
		target.BaseType = typedef.BaseType
	}

	if typedef.Type != "" && !isBuiltInType(typedef.Type) {
		nextTypedef := findTypedef(root, typedef.Type)
		if nextTypedef != nil {
			resolveTypedefConstraints(target, nextTypedef, root)
		}
	}
}

func findTypedef(node *SchemaNode, typeName string) *SchemaNode {
	if typedef, exists := node.Typedefs[typeName]; exists {
		return typedef
	}

	for _, child := range node.Children {
		if typedef := findTypedef(child, typeName); typedef != nil {
			return typedef
		}
	}

	return nil
}

func isBuiltInType(typeName string) bool {
	return builtInTypes[typeName]
}

func tokenizeYANG(content string) []string {
	var tokens []string
	var current strings.Builder
	inString := false
	stringChar := rune(0)

	for i := 0; i < len(content); i++ {
		c := rune(content[i])

		if inString {
			if c == stringChar {
				tokens = append(tokens, current.String())
				current.Reset()
				inString = false
			} else {
				current.WriteRune(c)
			}
			continue
		}

		switch c {
		case '"', '\'':
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			inString = true
			stringChar = c
		case '{', '}', ';':
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
			tokens = append(tokens, string(c))
		case ' ', '\t', '\n', '\r':
			if current.Len() > 0 {
				tokens = append(tokens, current.String())
				current.Reset()
			}
		default:
			current.WriteRune(c)
		}
	}

	if current.Len() > 0 {
		tokens = append(tokens, current.String())
	}

	return tokens
}



func ParseXMLData(content string) (*DataNode, error) {
	root := &DataNode{
		Children:   make([]*DataNode, 0),
		Attributes: make(map[string]string),
	}

	decoder := xml.NewDecoder(strings.NewReader(content))
	var stack []*DataNode
	stack = append(stack, root)

	for {
		token, err := decoder.Token()
		if err != nil {
			if err.Error() == "EOF" {
				break
			}
			return nil, err
		}

		switch t := token.(type) {
		case xml.StartElement:
			node := &DataNode{
				Name:       t.Name.Local,
				Children:   make([]*DataNode, 0),
				Attributes: make(map[string]string),
			}
			for _, attr := range t.Attr {
				node.Attributes[attr.Name.Local] = attr.Value
			}
			parent := stack[len(stack)-1]
			parent.Children = append(parent.Children, node)
			stack = append(stack, node)

		case xml.EndElement:
			if len(stack) > 1 {
				stack = stack[:len(stack)-1]
			}

		case xml.CharData:
			text := strings.TrimSpace(string(t))
			if text != "" && len(stack) > 0 {
				stack[len(stack)-1].Value = text
			}
		}
	}

	if len(root.Children) == 1 {
		return root.Children[0], nil
	}
	return root, nil
}

func ParseJSONData(content string) (*DataNode, error) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(content), &data); err != nil {
		return nil, err
	}

	root := &DataNode{
		Name:     "root",
		Children: make([]*DataNode, 0),
	}

	for k, v := range data {
		child := mapToDataNode(k, v)
		root.Children = append(root.Children, child)
	}

	return root, nil
}

func mapToDataNode(name string, value interface{}) *DataNode {
	node := &DataNode{
		Name:       name,
		Children:   make([]*DataNode, 0),
		Attributes: make(map[string]string),
	}

	switch v := value.(type) {
	case string:
		node.Value = v
	case float64:
		node.Value = fmt.Sprintf("%v", v)
	case bool:
		node.Value = fmt.Sprintf("%v", v)
	case map[string]interface{}:
		for k, val := range v {
			node.Children = append(node.Children, mapToDataNode(k, val))
		}
	case []interface{}:
		for _, item := range v {
			if itemMap, ok := item.(map[string]interface{}); ok {
				for k, val := range itemMap {
					node.Children = append(node.Children, mapToDataNode(k, val))
				}
			} else {
				childNode := &DataNode{
					Name:       "item",
					Children:   make([]*DataNode, 0),
					Attributes: make(map[string]string),
				}
				childNode.Value = fmt.Sprintf("%v", item)
				node.Children = append(node.Children, childNode)
			}
		}
	}

	return node
}

func Validate(schema *SchemaNode, data *DataNode) []ValidationError {
	var errors []ValidationError
	validateNode(schema, data, data, "", &errors)
	return errors
}

func validateNode(schema *SchemaNode, data *DataNode, root *DataNode, path string, errors *[]ValidationError) {
	currentPath := path
	if data.Name != "" && data.Name != "root" {
		if currentPath == "" {
			currentPath = data.Name
		} else {
			currentPath = currentPath + "/" + data.Name
		}
	}

	checkMustConditions(schema, data, root, currentPath, errors)

	leafListValues := make(map[string][]string)
	for _, child := range data.Children {
		schemaChild, exists := schema.Children[child.Name]
		if !exists {
			childPath := currentPath
			if childPath == "" {
				childPath = child.Name
			} else {
				childPath = childPath + "/" + child.Name
			}
			*errors = append(*errors, ValidationError{
				Path:    childPath,
				Message: fmt.Sprintf("Unknown element '%s' not defined in schema", child.Name),
				Type:    "unknown_element",
			})
			continue
		}

		childPath := currentPath
		if childPath == "" {
			childPath = child.Name
		} else {
			childPath = childPath + "/" + child.Name
		}

		if schemaChild.IsLeafList && child.Value != "" {
			leafListValues[child.Name] = append(leafListValues[child.Name], child.Value)
		}

		if child.Value != "" {
			validateValue(schemaChild, child.Value, childPath, errors)
		}

		validateNode(schemaChild, child, root, currentPath, errors)
	}

	for name, values := range leafListValues {
		schemaChild := schema.Children[name]
		checkLeafListUniqueness(values, schemaChild, currentPath+"/"+name, errors)
	}

	for name, schemaChild := range schema.Children {
		if schemaChild.Mandatory {
			found := false
			for _, child := range data.Children {
				if child.Name == name {
					found = true
					break
				}
			}
			if !found {
				mandatoryPath := currentPath
				if mandatoryPath == "" {
					mandatoryPath = name
				} else {
					mandatoryPath = mandatoryPath + "/" + name
				}
				*errors = append(*errors, ValidationError{
					Path:    mandatoryPath,
					Message: fmt.Sprintf("Mandatory element '%s' is missing", name),
					Type:    "missing_mandatory",
				})
			}
		}
	}
}

func checkLeafListUniqueness(values []string, schema *SchemaNode, path string, errors *[]ValidationError) {
	valueCount := make(map[string]int)
	for _, v := range values {
		valueCount[v]++
	}

	for value, count := range valueCount {
		if count > 1 {
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("Duplicate value '%s' in leaf-list, values must be unique (appears %d times)", value, count),
				Type:    "duplicate_value",
			})
		}
	}
}

func validateValue(schema *SchemaNode, value string, path string, errors *[]ValidationError) {
	effectiveType := schema.Type
	if schema.BaseType != "" {
		effectiveType = schema.BaseType
	}

	switch effectiveType {
	case "int8", "int16", "int32", "int64", "int":
		if _, err := strconv.ParseInt(value, 10, 64); err != nil {
			typeInfo := ""
			if schema.BaseType != "" {
				typeInfo = fmt.Sprintf(" (derived from %s)", schema.Type)
			}
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("Value '%s' is not a valid integer%s", value, typeInfo),
				Type:    "type_mismatch",
			})
			return
		}
		validateRange(value, path, schema, errors)

	case "uint8", "uint16", "uint32", "uint64", "uint":
		if _, err := strconv.ParseUint(value, 10, 64); err != nil {
			typeInfo := ""
			if schema.BaseType != "" {
				typeInfo = fmt.Sprintf(" (derived from %s)", schema.Type)
			}
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("Value '%s' is not a valid unsigned integer%s", value, typeInfo),
				Type:    "type_mismatch",
			})
			return
		}
		validateRange(value, path, schema, errors)

	case "decimal64", "number", "float":
		if _, err := strconv.ParseFloat(value, 64); err != nil {
			typeInfo := ""
			if schema.BaseType != "" {
				typeInfo = fmt.Sprintf(" (derived from %s)", schema.Type)
			}
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("Value '%s' is not a valid number%s", value, typeInfo),
				Type:    "type_mismatch",
			})
			return
		}
		validateRange(value, path, schema, errors)

	case "string":
		validateStringLength(value, path, schema, errors)

	case "boolean", "bool":
		if value != "true" && value != "false" && value != "0" && value != "1" {
			typeInfo := ""
			if schema.BaseType != "" {
				typeInfo = fmt.Sprintf(" (derived from %s)", schema.Type)
			}
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("Value '%s' is not a valid boolean%s", value, typeInfo),
				Type:    "type_mismatch",
			})
		}

	case "enumeration", "enum":
		if len(schema.EnumValues) > 0 {
			found := false
			for _, enumVal := range schema.EnumValues {
				if enumVal == value {
					found = true
					break
				}
			}
			if !found {
				typeInfo := ""
				if schema.BaseType != "" {
					typeInfo = fmt.Sprintf(" (derived from %s)", schema.Type)
				}
				*errors = append(*errors, ValidationError{
					Path:    path,
					Message: fmt.Sprintf("Value '%s' is not in allowed enum values: %v%s", value, schema.EnumValues, typeInfo),
					Type:    "invalid_enum",
				})
			}
		}
	}
}

func validateRange(value string, path string, schema *SchemaNode, errors *[]ValidationError) {
	if schema.MinValue != nil || schema.MaxValue != nil {
		num, err := strconv.ParseFloat(value, 64)
		if err == nil {
			if schema.MinValue != nil && num < *schema.MinValue {
				*errors = append(*errors, ValidationError{
					Path:    path,
					Message: fmt.Sprintf("Value %v is below minimum %v", num, *schema.MinValue),
					Type:    "range_violation",
				})
			}
			if schema.MaxValue != nil && num > *schema.MaxValue {
				*errors = append(*errors, ValidationError{
					Path:    path,
					Message: fmt.Sprintf("Value %v exceeds maximum %v", num, *schema.MaxValue),
					Type:    "range_violation",
				})
			}
		}
	}
}

func validateStringLength(value string, path string, schema *SchemaNode, errors *[]ValidationError) {
	if schema.LengthMin != nil || schema.LengthMax != nil {
		length := len(value)
		if schema.LengthMin != nil && length < *schema.LengthMin {
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("String length %d is below minimum length %d", length, *schema.LengthMin),
				Type:    "length_violation",
			})
		}
		if schema.LengthMax != nil && length > *schema.LengthMax {
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: fmt.Sprintf("String length %d exceeds maximum length %d", length, *schema.LengthMax),
				Type:    "length_violation",
			})
		}
	}
}

func (ve ValidationError) String() string {
	return fmt.Sprintf("[%s] %s: %s", ve.Type, ve.Path, ve.Message)
}

func (ve ValidationError) Error() string {
	return ve.String()
}

func ValidationErrorsToJSON(errors []ValidationError) (string, error) {
	data, err := json.MarshalIndent(errors, "", "  ")
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func ValidateAgainstYANG(yangContent string, dataContent string, dataFormat string) ([]ValidationError, error) {
	schema, err := ParseYANG(yangContent)
	if err != nil {
		return nil, fmt.Errorf("failed to parse YANG schema: %w", err)
	}

	var data *DataNode
	if strings.ToLower(dataFormat) == "xml" {
		data, err = ParseXMLData(dataContent)
	} else if strings.ToLower(dataFormat) == "json" {
		data, err = ParseJSONData(dataContent)
	} else {
		return nil, errors.New("unsupported data format, use 'xml' or 'json'")
	}

	if err != nil {
		return nil, fmt.Errorf("failed to parse data: %w", err)
	}

	return Validate(schema, data), nil
}

func GetSchemaStructure(schema *SchemaNode, indent int) string {
	var result string
	prefix := strings.Repeat("  ", indent)

	if len(schema.Typedefs) > 0 {
		result += fmt.Sprintf("%sTypedefs:\n", prefix)
		for name, typedef := range schema.Typedefs {
			typeInfo := typedef.Type
			if typedef.BaseType != "" {
				typeInfo = fmt.Sprintf("%s (base: %s)", typedef.Type, typedef.BaseType)
			}
			result += fmt.Sprintf("%s  %s: %s\n", prefix, name, typeInfo)
			if typedef.MinValue != nil || typedef.MaxValue != nil {
				result += fmt.Sprintf("%s    range: ", prefix)
				if typedef.MinValue != nil {
					result += fmt.Sprintf("%v", *typedef.MinValue)
				}
				result += ".."
				if typedef.MaxValue != nil {
					result += fmt.Sprintf("%v", *typedef.MaxValue)
				}
				result += "\n"
			}
			if len(typedef.EnumValues) > 0 {
				result += fmt.Sprintf("%s    enum: %v\n", prefix, typedef.EnumValues)
			}
		}
	}

	if schema.Name != "root" {
		result += fmt.Sprintf("%s%s (%s)", prefix, schema.Name, schema.Type)
		if schema.BaseType != "" {
			result += fmt.Sprintf(" [base: %s]", schema.BaseType)
		}
		if schema.IsLeafList {
			result += " [leaf-list]"
		}
		if schema.Mandatory {
			result += " [mandatory]"
		}
		if schema.Default != "" {
			result += fmt.Sprintf(" [default: %s]", schema.Default)
		}
		if schema.MinValue != nil || schema.MaxValue != nil {
			result += " [range: "
			if schema.MinValue != nil {
				result += fmt.Sprintf("%v", *schema.MinValue)
			} else {
				result += "unbounded"
			}
			result += ".."
			if schema.MaxValue != nil {
				result += fmt.Sprintf("%v", *schema.MaxValue)
			} else {
				result += "unbounded"
			}
			result += "]"
		}
		if len(schema.EnumValues) > 0 {
			result += fmt.Sprintf(" [enum: %v]", schema.EnumValues)
		}
		result += "\n"
	}

	for _, child := range schema.Children {
		result += GetSchemaStructure(child, indent+1)
	}

	return result
}

func (sn *SchemaNode) ToJSON() (string, error) {
	type schemaNodeJSON struct {
		Name        string                            `json:"name"`
		Type        string                            `json:"type"`
		BaseType    string                            `json:"baseType,omitempty"`
		Mandatory   bool                              `json:"mandatory,omitempty"`
		Default     string                            `json:"default,omitempty"`
		MinValue    *float64                          `json:"minValue,omitempty"`
		MaxValue    *float64                          `json:"maxValue,omitempty"`
		LengthMin   *int                              `json:"lengthMin,omitempty"`
		LengthMax   *int                              `json:"lengthMax,omitempty"`
		EnumValues  []string                          `json:"enumValues,omitempty"`
		IsList      bool                              `json:"isList,omitempty"`
		IsLeafList  bool                              `json:"isLeafList,omitempty"`
		Key         string                            `json:"key,omitempty"`
		Description string                            `json:"description,omitempty"`
		Units       string                            `json:"units,omitempty"`
		Children    map[string]schemaNodeJSON         `json:"children,omitempty"`
		Typedefs    map[string]schemaNodeJSON         `json:"typedefs,omitempty"`
	}

	var convert func(*SchemaNode) schemaNodeJSON
	convert = func(n *SchemaNode) schemaNodeJSON {
		children := make(map[string]schemaNodeJSON)
		for name, child := range n.Children {
			children[name] = convert(child)
		}
		typedefs := make(map[string]schemaNodeJSON)
		for name, td := range n.Typedefs {
			typedefs[name] = convert(td)
		}
		return schemaNodeJSON{
			Name:        n.Name,
			Type:        n.Type,
			BaseType:    n.BaseType,
			Mandatory:   n.Mandatory,
			Default:     n.Default,
			MinValue:    n.MinValue,
			MaxValue:    n.MaxValue,
			LengthMin:   n.LengthMin,
			LengthMax:   n.LengthMax,
			EnumValues:  n.EnumValues,
			IsList:      n.IsList,
			IsLeafList:  n.IsLeafList,
			Key:         n.Key,
			Description: n.Description,
			Units:       n.Units,
			Children:    children,
			Typedefs:    typedefs,
		}
	}

	result := convert(sn)
	data, err := json.MarshalIndent(result, "", "  ")
	return string(data), err
}

type XPathContext struct {
	CurrentNode *DataNode
	RootNode    *DataNode
	PathStack   []string
}

type XPathResult struct {
	Value   interface{}
	Boolean bool
	Type    string
}

func evaluateXPath(xpath string, context *XPathContext) XPathResult {
	xpath = strings.TrimSpace(xpath)
	if xpath == "" {
		return XPathResult{Boolean: false, Type: "boolean"}
	}

	if strings.Contains(xpath, " and ") {
		parts := strings.SplitN(xpath, " and ", 2)
		left := evaluateXPath(parts[0], context)
		if !left.Boolean {
			return XPathResult{Boolean: false, Type: "boolean"}
		}
		right := evaluateXPath(parts[1], context)
		return XPathResult{Boolean: left.Boolean && right.Boolean, Type: "boolean"}
	}

	if strings.Contains(xpath, " or ") {
		parts := strings.SplitN(xpath, " or ", 2)
		left := evaluateXPath(parts[0], context)
		right := evaluateXPath(parts[1], context)
		return XPathResult{Boolean: left.Boolean || right.Boolean, Type: "boolean"}
	}

	if strings.HasPrefix(xpath, "not(") && strings.HasSuffix(xpath, ")") {
		inner := xpath[4 : len(xpath)-1]
		result := evaluateXPath(inner, context)
		return XPathResult{Boolean: !result.Boolean, Type: "boolean"}
	}

	if strings.Contains(xpath, "=") {
		parts := strings.SplitN(xpath, "=", 2)
		leftPath := strings.TrimSpace(parts[0])
		rightValue := strings.Trim(strings.TrimSpace(parts[1]), "'\"")
		
		leftResult := evaluateXPathPath(leftPath, context)
		if leftResult.Value == nil {
			return XPathResult{Boolean: false, Type: "boolean"}
		}
		return XPathResult{Boolean: fmt.Sprint(leftResult.Value) == rightValue, Type: "boolean"}
	}

	if strings.Contains(xpath, "!=") {
		parts := strings.SplitN(xpath, "!=", 2)
		leftPath := strings.TrimSpace(parts[0])
		rightValue := strings.Trim(strings.TrimSpace(parts[1]), "'\"")
		
		leftResult := evaluateXPathPath(leftPath, context)
		if leftResult.Value == nil {
			return XPathResult{Boolean: true, Type: "boolean"}
		}
		return XPathResult{Boolean: fmt.Sprint(leftResult.Value) != rightValue, Type: "boolean"}
	}

	if strings.Contains(xpath, ">") && !strings.Contains(xpath, ">=") {
		parts := strings.SplitN(xpath, ">", 2)
		return compareXPath(parts[0], parts[1], context, func(a, b float64) bool { return a > b })
	}

	if strings.Contains(xpath, "<") && !strings.Contains(xpath, "<=") {
		parts := strings.SplitN(xpath, "<", 2)
		return compareXPath(parts[0], parts[1], context, func(a, b float64) bool { return a < b })
	}

	if strings.Contains(xpath, ">=") {
		parts := strings.SplitN(xpath, ">=", 2)
		return compareXPath(parts[0], parts[1], context, func(a, b float64) bool { return a >= b })
	}

	if strings.Contains(xpath, "<=") {
		parts := strings.SplitN(xpath, "<=", 2)
		return compareXPath(parts[0], parts[1], context, func(a, b float64) bool { return a <= b })
	}

	return evaluateXPathPath(xpath, context)
}

func compareXPath(leftStr, rightStr string, context *XPathContext, cmp func(float64, float64) bool) XPathResult {
	leftPath := strings.TrimSpace(leftStr)
	rightStr = strings.TrimSpace(rightStr)
	
	var rightValue float64
	if f, err := strconv.ParseFloat(strings.Trim(rightStr, "'\""), 64); err == nil {
		rightValue = f
	} else {
		rightResult := evaluateXPathPath(rightStr, context)
		if rightResult.Value == nil {
			return XPathResult{Boolean: false, Type: "boolean"}
		}
		if f, err := strconv.ParseFloat(fmt.Sprint(rightResult.Value), 64); err == nil {
			rightValue = f
		} else {
			return XPathResult{Boolean: false, Type: "boolean"}
		}
	}

	leftResult := evaluateXPathPath(leftPath, context)
	if leftResult.Value == nil {
		return XPathResult{Boolean: false, Type: "boolean"}
	}

	leftValue, err := strconv.ParseFloat(fmt.Sprint(leftResult.Value), 64)
	if err != nil {
		return XPathResult{Boolean: false, Type: "boolean"}
	}

	return XPathResult{Boolean: cmp(leftValue, rightValue), Type: "boolean"}
}

func evaluateXPathPath(path string, context *XPathContext) XPathResult {
	path = strings.TrimSpace(path)
	
	if path == "." {
		return XPathResult{Value: context.CurrentNode.Value, Type: "value"}
	}

	if strings.HasPrefix(path, "../") {
		return XPathResult{Boolean: true, Type: "boolean"}
	}

	node := findNodeByPath(context.CurrentNode, path)
	if node != nil {
		if node.Value != "" {
			return XPathResult{Value: node.Value, Boolean: true, Type: "value"}
		}
		if len(node.Children) > 0 {
			return XPathResult{Boolean: true, Type: "node-set"}
		}
	}

	return XPathResult{Boolean: node != nil, Type: "boolean"}
}

func findNodeByPath(start *DataNode, path string) *DataNode {
	parts := strings.Split(path, "/")
	current := start

	for _, part := range parts {
		if part == "" {
			continue
		}
		if current == nil {
			return nil
		}
		
		found := false
		for _, child := range current.Children {
			if child.Name == part {
				current = child
				found = true
				break
			}
		}
		if !found {
			return nil
		}
	}

	return current
}

func checkMustConditions(schema *SchemaNode, data *DataNode, root *DataNode, path string, errors *[]ValidationError) {
	if len(schema.MustConditions) == 0 {
		return
	}

	context := &XPathContext{
		CurrentNode: data,
		RootNode:    root,
		PathStack:   []string{path},
	}

	for _, must := range schema.MustConditions {
		result := evaluateXPath(must.XPath, context)
		if !result.Boolean {
			msg := fmt.Sprintf("Must condition violated: '%s'", must.XPath)
			if must.Description != "" {
				msg = fmt.Sprintf("%s - %s", msg, must.Description)
			}
			*errors = append(*errors, ValidationError{
				Path:    path,
				Message: msg,
				Type:    "must_violation",
			})
		}
	}
}

type DiffType string

const (
	DiffAdded    DiffType = "added"
	DiffRemoved  DiffType = "removed"
	DiffModified DiffType = "modified"
)

type DiffResult struct {
	Path     string      `json:"path"`
	Type     DiffType    `json:"type"`
	OldValue interface{} `json:"oldValue,omitempty"`
	NewValue interface{} `json:"newValue,omitempty"`
}

func CompareDataNodes(base, current *DataNode) []DiffResult {
	var diffs []DiffResult
	compareDataNodesRecursive(base, current, "", &diffs)
	return diffs
}

func compareDataNodesRecursive(base, current *DataNode, path string, diffs *[]DiffResult) {
	currentPath := path
	if current != nil && current.Name != "" && current.Name != "root" {
		if currentPath == "" {
			currentPath = current.Name
		} else {
			currentPath = currentPath + "/" + current.Name
		}
	} else if base != nil && base.Name != "" && base.Name != "root" {
		if currentPath == "" {
			currentPath = base.Name
		} else {
			currentPath = currentPath + "/" + base.Name
		}
	}

	if base == nil && current != nil {
		if current.Value != "" {
			*diffs = append(*diffs, DiffResult{
				Path:     currentPath,
				Type:     DiffAdded,
				NewValue: current.Value,
			})
		}
		for _, child := range current.Children {
			compareDataNodesRecursive(nil, child, currentPath, diffs)
		}
		return
	}

	if base != nil && current == nil {
		if base.Value != "" {
			*diffs = append(*diffs, DiffResult{
				Path:    currentPath,
				Type:    DiffRemoved,
				OldValue: base.Value,
			})
		}
		for _, child := range base.Children {
			compareDataNodesRecursive(child, nil, currentPath, diffs)
		}
		return
	}

	if base.Value != current.Value {
		*diffs = append(*diffs, DiffResult{
			Path:     currentPath,
			Type:     DiffModified,
			OldValue: base.Value,
			NewValue: current.Value,
		})
	}

	baseChildren := make(map[string][]*DataNode)
	currentChildren := make(map[string][]*DataNode)

	for _, child := range base.Children {
		baseChildren[child.Name] = append(baseChildren[child.Name], child)
	}

	for _, child := range current.Children {
		currentChildren[child.Name] = append(currentChildren[child.Name], child)
	}

	for name := range baseChildren {
		if _, exists := currentChildren[name]; !exists {
			for _, child := range baseChildren[name] {
				compareDataNodesRecursive(child, nil, currentPath, diffs)
			}
		}
	}

	for name := range currentChildren {
		if _, exists := baseChildren[name]; !exists {
			for _, child := range currentChildren[name] {
				compareDataNodesRecursive(nil, child, currentPath, diffs)
			}
		}
	}

	for name := range baseChildren {
		if _, exists := currentChildren[name]; exists {
			baseList := baseChildren[name]
			currentList := currentChildren[name]
			
			maxLen := len(baseList)
			if len(currentList) > maxLen {
				maxLen = len(currentList)
			}
			
			for i := 0; i < maxLen; i++ {
				var baseChild, currentChild *DataNode
				if i < len(baseList) {
					baseChild = baseList[i]
				}
				if i < len(currentList) {
					currentChild = currentList[i]
				}
				compareDataNodesRecursive(baseChild, currentChild, currentPath, diffs)
			}
		}
	}
}
