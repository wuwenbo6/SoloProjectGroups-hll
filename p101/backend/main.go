package main

import (
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

type FieldSpec struct {
	Number int
	Name   string
	Format string
	Length int
}

type ParseRequest struct {
	Data   string `json:"data"`
	Format string `json:"format"`
}

type ParsedMessage struct {
	MTI              string            `json:"mti"`
	Bitmap           []bool            `json:"bitmap"`
	BitmapHex        string            `json:"bitmapHex"`
	SecondaryBitmap  []bool            `json:"secondaryBitmap,omitempty"`
	SecondaryBitmapHex string          `json:"secondaryBitmapHex,omitempty"`
	HasSecondaryBitmap bool            `json:"hasSecondaryBitmap"`
	Fields           map[string]string `json:"fields"`
}

type SendRequest struct {
	Message ParsedMessage `json:"message"`
}

type SendResponse struct {
	Success        bool         `json:"success"`
	ResponseCode   string       `json:"responseCode"`
	ResponseMessage string      `json:"responseMessage"`
	RRN            string       `json:"rrn"`
	ParsedResponse *ParsedMessage `json:"parsedResponse,omitempty"`
}

type Transaction struct {
	ID          int64     `json:"id"`
	MTI         string    `json:"mti"`
	CardNumber  string    `json:"card_number"`
	Amount      string    `json:"amount"`
	RRN         string    `json:"rrn"`
	ResponseCode string   `json:"response_code"`
	Status      string    `json:"status"`
	RawRequest  string    `json:"raw_request"`
	RawResponse string    `json:"raw_response"`
	CreatedAt   time.Time `json:"created_at"`
}

var fieldSpecs = map[int]FieldSpec{
	2:  {2, "主账号", "LLVAR", 19},
	3:  {3, "处理码", "FIXED", 6},
	4:  {4, "交易金额", "FIXED", 12},
	7:  {7, "传输日期时间", "FIXED", 10},
	11: {11, "系统跟踪号", "FIXED", 6},
	12: {12, "受卡方所在地时间", "FIXED", 6},
	13: {13, "受卡方所在地日期", "FIXED", 4},
	14: {14, "卡有效期", "FIXED", 4},
	15: {15, "清算日期", "FIXED", 4},
	18: {18, "商户类型", "FIXED", 4},
	22: {22, "服务点输入方式码", "FIXED", 3},
	23: {23, "卡序列号", "FIXED", 3},
	25: {25, "服务点条件码", "FIXED", 2},
	26: {26, "服务点PIN获取码", "FIXED", 2},
	28: {28, "交易费", "FIXED", 8},
	32: {32, "受理方标识码", "LLVAR", 11},
	33: {33, "发送方标识码", "LLVAR", 11},
	35: {35, "磁条2数据", "LLVAR", 37},
	36: {36, "磁条3数据", "LLLVAR", 104},
	37: {37, "检索参考号", "FIXED", 12},
	38: {38, "授权标识应答码", "FIXED", 6},
	39: {39, "应答码", "FIXED", 2},
	41: {41, "受卡机终端标识码", "FIXED", 8},
	42: {42, "受卡方标识码", "FIXED", 15},
	43: {43, "商户名称地址", "FIXED", 40},
	44: {44, "附加响应数据", "LLVAR", 25},
	48: {48, "附加数据", "LLLVAR", 255},
	49: {49, "交易货币代码", "FIXED", 3},
	50: {50, "结算货币代码", "FIXED", 3},
	52: {52, "PIN数据", "FIXED", 16},
	53: {53, "安全控制信息", "FIXED", 16},
	54: {54, "附加金额", "LLLVAR", 120},
	55: {55, "IC卡数据", "LLLVAR", 255},
	59: {59, "自定义域", "LLLVAR", 255},
	60: {60, "自定义域", "LLLVAR", 255},
	61: {61, "自定义域", "LLLVAR", 255},
	62: {62, "自定义域", "LLLVAR", 255},
	63: {63, "自定义域", "LLLVAR", 255},
	64: {64, "MAC", "FIXED", 16},
}

var xmlFieldSpecs = map[string]int{
	"2":  2, "3": 3, "4": 4, "7": 7, "11": 11, "12": 12, "13": 13, "14": 14,
	"15": 15, "18": 18, "22": 22, "23": 23, "25": 25, "26": 26, "28": 28,
	"32": 32, "33": 33, "35": 35, "36": 36, "37": 37, "38": 38, "39": 39,
	"41": 41, "42": 42, "43": 43, "44": 44, "48": 48, "49": 49, "50": 50,
	"52": 52, "53": 53, "54": 54, "55": 55, "59": 59, "60": 60, "61": 61,
	"62": 62, "63": 63, "64": 64,
}

type XMLField struct {
	ID    string `xml:"id,attr"`
	Value string `xml:",chardata"`
}

type XMLMessage struct {
	XMLName xml.Name   `xml:"iso8583"`
	MTI     string     `xml:"mti"`
	Fields  []XMLField `xml:"field"`
}

func hexToBytes(hexStr string) ([]byte, error) {
	hexStr = strings.ReplaceAll(hexStr, " ", "")
	hexStr = strings.ReplaceAll(hexStr, "\n", "")
	hexStr = strings.ReplaceAll(hexStr, "\t", "")
	return hex.DecodeString(hexStr)
}

func bytesToHex(data []byte) string {
	return strings.ToUpper(hex.EncodeToString(data))
}

func parseBitmap(data []byte) ([]bool, error) {
	if len(data) < 8 {
		return nil, fmt.Errorf("invalid bitmap length")
	}
	
	bitmap := make([]bool, 64)
	for i := 0; i < 8; i++ {
		for j := 0; j < 8; j++ {
			bitIndex := i*8 + j
			mask := byte(1 << (7 - j))
			bitmap[bitIndex] = (data[i] & mask) != 0
		}
	}
	return bitmap, nil
}

func parseHexISO8583(hexStr string) (*ParsedMessage, error) {
	data, err := hexToBytes(hexStr)
	if err != nil {
		return nil, fmt.Errorf("invalid hex: %v", err)
	}

	if len(data) < 4 {
		return nil, fmt.Errorf("message too short")
	}

	result := &ParsedMessage{
		Fields: make(map[string]string),
	}

	result.MTI = bytesToHex(data[0:2])

	offset := 2

	primaryBitmap := data[offset : offset+8]
	offset += 8

	bitmap, err := parseBitmap(primaryBitmap)
	if err != nil {
		return nil, err
	}
	result.Bitmap = bitmap
	result.BitmapHex = bytesToHex(primaryBitmap)

	result.HasSecondaryBitmap = bitmap[0]

	if result.HasSecondaryBitmap {
		if len(data) < offset+8 {
			return nil, fmt.Errorf("secondary bitmap data missing")
		}
		secondaryBitmapData := data[offset : offset+8]
		offset += 8

		secondaryBitmap, err := parseBitmap(secondaryBitmapData)
		if err != nil {
			return nil, err
		}
		result.SecondaryBitmap = secondaryBitmap
		result.SecondaryBitmapHex = bytesToHex(secondaryBitmapData)

		for i := 0; i < 64; i++ {
			if secondaryBitmap[i] {
				result.Bitmap = append(result.Bitmap, true)
			} else {
				result.Bitmap = append(result.Bitmap, false)
			}
		}
	}

	allFields := make([]bool, 128)
	copy(allFields[0:64], result.Bitmap)
	if result.HasSecondaryBitmap {
		copy(allFields[64:128], result.SecondaryBitmap)
	}

	for fieldNum := 2; fieldNum <= 128; fieldNum++ {
		if !allFields[fieldNum-1] {
			continue
		}

		spec, ok := fieldSpecs[fieldNum]
		if !ok {
			continue
		}

		var fieldLen int
		var value string

		switch spec.Format {
		case "FIXED":
			fieldLen = spec.Length
			if offset+fieldLen > len(data) {
				return nil, fmt.Errorf("field %d data truncated", fieldNum)
			}
			value = string(data[offset : offset+fieldLen])
			offset += fieldLen

		case "LLVAR":
			if offset+2 > len(data) {
				return nil, fmt.Errorf("field %d length indicator missing", fieldNum)
			}
			lenStr := string(data[offset : offset+2])
			offset += 2
			fieldLen, err = strconv.Atoi(lenStr)
			if err != nil {
				return nil, fmt.Errorf("field %d invalid length: %v", fieldNum, err)
			}
			if offset+fieldLen > len(data) {
				return nil, fmt.Errorf("field %d data truncated", fieldNum)
			}
			value = string(data[offset : offset+fieldLen])
			offset += fieldLen

		case "LLLVAR":
			if offset+3 > len(data) {
				return nil, fmt.Errorf("field %d length indicator missing", fieldNum)
			}
			lenStr := string(data[offset : offset+3])
			offset += 3
			fieldLen, err = strconv.Atoi(lenStr)
			if err != nil {
				return nil, fmt.Errorf("field %d invalid length: %v", fieldNum, err)
			}
			if offset+fieldLen > len(data) {
				return nil, fmt.Errorf("field %d data truncated", fieldNum)
			}
			value = string(data[offset : offset+fieldLen])
			offset += fieldLen
		}

		result.Fields[strconv.Itoa(fieldNum)] = value
	}

	return result, nil
}

func parseXMLISO8583(xmlData string) (*ParsedMessage, error) {
	var msg XMLMessage
	err := xml.Unmarshal([]byte(xmlData), &msg)
	if err != nil {
		return nil, fmt.Errorf("invalid XML: %v", err)
	}

	result := &ParsedMessage{
		MTI:    msg.MTI,
		Fields: make(map[string]string),
		Bitmap: make([]bool, 64),
	}

	fieldSet := make(map[int]string)
	for _, field := range msg.Fields {
		fieldNum, ok := xmlFieldSpecs[field.ID]
		if ok {
			fieldSet[fieldNum] = field.Value
		}
	}

	hasSecondary := false
	for num := range fieldSet {
		if num > 64 {
			hasSecondary = true
			break
		}
	}
	result.HasSecondaryBitmap = hasSecondary
	result.Bitmap[0] = hasSecondary

	for num := range fieldSet {
		if num <= 64 {
			result.Bitmap[num-1] = true
		}
	}

	if hasSecondary {
		result.SecondaryBitmap = make([]bool, 64)
		for num := range fieldSet {
			if num > 64 && num <= 128 {
				result.SecondaryBitmap[num-65] = true
			}
		}
	}

	for num, value := range fieldSet {
		result.Fields[strconv.Itoa(num)] = value
	}

	bitmapBytes := make([]byte, 8)
	for i := 0; i < 64; i++ {
		if result.Bitmap[i] {
			byteIdx := i / 8
			bitIdx := 7 - (i % 8)
			bitmapBytes[byteIdx] |= 1 << bitIdx
		}
	}
	result.BitmapHex = bytesToHex(bitmapBytes)

	if hasSecondary {
		secBitmapBytes := make([]byte, 8)
		for i := 0; i < 64; i++ {
			if result.SecondaryBitmap[i] {
				byteIdx := i / 8
				bitIdx := 7 - (i % 8)
				secBitmapBytes[byteIdx] |= 1 << bitIdx
			}
		}
		result.SecondaryBitmapHex = bytesToHex(secBitmapBytes)
	}

	return result, nil
}

func buildResponseMessage(requestMsg ParsedMessage) ParsedMessage {
	response := ParsedMessage{
		MTI:              "0210",
		Fields:           make(map[string]string),
		Bitmap:           make([]bool, 64),
		HasSecondaryBitmap: false,
	}

	bitmap := make([]bool, 64)
	
	bitmap[2] = true
	response.Fields["3"] = requestMsg.Fields["3"]
	
	bitmap[3] = true
	response.Fields["4"] = requestMsg.Fields["4"]
	
	bitmap[10] = true
	response.Fields["11"] = requestMsg.Fields["11"]
	
	bitmap[11] = true
	if t, ok := requestMsg.Fields["12"]; ok {
		response.Fields["12"] = t
	} else {
		response.Fields["12"] = time.Now().Format("150405")
	}
	
	bitmap[12] = true
	if d, ok := requestMsg.Fields["13"]; ok {
		response.Fields["13"] = d
	} else {
		response.Fields["13"] = time.Now().Format("0102")
	}
	
	bitmap[36] = true
	rrn := requestMsg.Fields["37"]
	if rrn == "" {
		rrn = fmt.Sprintf("%012d", time.Now().UnixNano()%1000000000000)
	}
	response.Fields["37"] = rrn
	
	bitmap[37] = true
	response.Fields["38"] = fmt.Sprintf("%06d", time.Now().Unix()%1000000)
	
	bitmap[38] = true
	response.Fields["39"] = "00"
	
	if auth, ok := requestMsg.Fields["41"]; ok {
		bitmap[40] = true
		response.Fields["41"] = auth
	}
	if term, ok := requestMsg.Fields["42"]; ok {
		bitmap[41] = true
		response.Fields["42"] = term
	}
	
	bitmap[43] = true
	response.Fields["44"] = "A000000"

	bitmapBytes := make([]byte, 8)
	for i := 0; i < 64; i++ {
		if bitmap[i] {
			byteIdx := i / 8
			bitIdx := 7 - (i % 8)
			bitmapBytes[byteIdx] |= 1 << bitIdx
		}
	}
	response.Bitmap = bitmap
	response.BitmapHex = bytesToHex(bitmapBytes)

	return response
}

func handleParse(c *gin.Context) {
	var req ParseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	var result *ParsedMessage
	var err error

	if req.Format == "xml" {
		result, err = parseXMLISO8583(req.Data)
	} else {
		result, err = parseHexISO8583(req.Data)
	}

	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}

func handleSend(c *gin.Context) {
	var req SendRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	responseMsg := buildResponseMessage(req.Message)

	rawRequest, _ := json.Marshal(req.Message)
	rawResponse, _ := json.Marshal(responseMsg)

	cardNumber := req.Message.Fields["2"]
	amount := req.Message.Fields["4"]
	rrn := responseMsg.Fields["37"]

	err := saveTransaction(
		req.Message.MTI,
		cardNumber,
		amount,
		rrn,
		"00",
		"success",
		string(rawRequest),
		string(rawResponse),
	)
	if err != nil {
		log.Printf("Failed to save transaction: %v", err)
	}

	c.JSON(http.StatusOK, SendResponse{
		Success:        true,
		ResponseCode:   "00",
		ResponseMessage: "交易成功",
		RRN:            rrn,
		ParsedResponse: &responseMsg,
	})
}

func handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleGetTransactions(c *gin.Context) {
	txs, err := getTransactions(100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"transactions": txs})
}

func main() {
	initDB()
	defer closeDB()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := r.Group("/api")
	{
		api.POST("/parse", handleParse)
		api.POST("/send", handleSend)
		api.GET("/transactions", handleGetTransactions)
		api.GET("/health", handleHealth)
	}

	fmt.Println("Server starting on :8080...")
	log.Fatal(r.Run(":8080"))
}
