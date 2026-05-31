# 新增功能说明

## 1. 私有数据集合 (Private Data Collection) - 价格存储

### 功能说明
使用 Hyperledger Fabric 的私有数据集合功能存储敏感的价格信息，仅授权组织可见。

### 配置文件
**[chaincode/collections_config.json](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/chaincode/collections_config.json)**

```json
{
  "name": "priceCollection",
  "policy": "OR('Org1MSP.member', 'Org2MSP.member')",
  "requiredPeerCount": 1,
  "maxPeerCount": 2,
  "blockToLive": 1000000,
  "memberOnlyRead": true,
  "memberOnlyWrite": true
}
```

### 链码函数
- `SetPrivatePrice(produceID, price, currency, ownerOrg)` - 设置私有价格
- `GetPrivatePrice(produceID)` - 获取私有价格

### 数据结构
```go
type PrivatePriceData struct {
    ProduceID   string    `json:"produceID"`
    Price       float64   `json:"price"`
    Currency    string    `json:"currency"`
    OwnerOrg    string    `json:"ownerOrg"`
    LastUpdated time.Time `json:"lastUpdated"`
}
```

### API 接口
- `POST /api/price/set` - 设置价格
- `GET /api/price/:produceId` - 获取价格（权限控制）

---

## 2. 智能合约自动触发 - 温度超标报警

### 功能说明
当记录的温度超过阈值（8°C）时，链码自动触发事件报警，并更新产品状态。

### 链码实现
**[chaincode/smartcontract.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/chaincode/smartcontract.go#L537-L599)**

```go
const (
    TempAlertEvent        = "temperatureAlert"
    MaxAllowedTemperature = 8.0
)

func (s *SmartContract) RecordTemperature(...) {
    // ... 记录温度
    
    if temperature > MaxAllowedTemperature {
        // 触发链码事件
        alertPayload := TempAlertEventPayload{...}
        alertJSON, _ := json.Marshal(alertPayload)
        ctx.GetStub().SetEvent(TempAlertEvent, alertJSON)
        
        // 自动更新状态
        produce.Status = "TEMP_ALERT"
    }
}
```

### 事件监听
客户端可以通过 Fabric SDK 监听事件：

```javascript
const listener = await contract.addContractListener('temp-alert-listener', 'temperatureAlert', (event) => {
    console.log('温度告警事件:', JSON.parse(event.payload.toString()));
});
```

### 告警数据结构
```go
type TempAlertEventPayload struct {
    ProduceID        string    `json:"produceID"`
    CurrentTemp      float64   `json:"currentTemp"`
    MaxAllowedTemp   float64   `json:"maxAllowedTemp"`
    Location         string    `json:"location"`
    Timestamp        time.Time `json:"timestamp"`
    AlertDescription string    `json:"alertDescription"`
}
```

### API 接口
- `POST /api/temperature/record` - 记录温度（自动检查阈值）
- `GET /api/temperature/:produceId` - 获取温度历史
- `GET /api/temperature/alerts/current` - 获取当前告警列表

### 前端功能
- 温度记录表单（带超标警告提示）
- 实时告警面板
- 温度历史表格
- 状态自动更新为"TEMP_ALERT"

---

## 3. PDF溯源证书导出

### 功能说明
生成包含完整溯源信息的PDF证书，包括：
- 产品基本信息
- 流转记录
- 质检报告
- 温度记录
- 验证二维码

### 实现方式
使用 `pdfkit` 库生成PDF文档。

### PDF 内容结构
1. **页眉** - 证书标题、编号、签发日期
2. **产品信息** - ID、名称、批次、数量、持有方、状态
3. **流转记录** - 时间、转出方、转入方、地点
4. **质检报告** - 报告编号、质检员、日期、结论
5. **温度记录** - 时间、温度、状态（超标高亮显示）
6. **验证二维码** - 包含证书哈希
7. **页脚** - 区块链验证说明、版权信息

### 温度记录高亮
- 温度 > 8°C: 红色背景 + 红色文字
- 温度 ≤ 8°C: 正常显示

### API 接口
- `GET /api/certificate/:produceId` - 下载PDF证书
- `GET /api/certificate/preview/:produceId` - 在线预览PDF
- `GET /api/certificate/list/:produceId` - 获取证书历史

### 前端功能
- 证书预览弹窗
- 一键下载PDF
- 证书生成历史记录
- 产品详情页快捷下载按钮

---

## 新增文件清单

### 链码
- `chaincode/collections_config.json` - 私有数据集合配置
- `chaincode/META-INF/statedb/couchdb/indexes/` - CouchDB索引

### 后端
- `backend/src/services/pdf-generator.js` - PDF证书生成器
- `backend/src/routes/certificate.js` - 证书相关API
- `backend/src/routes/temperature.js` - 温度监测API
- `backend/src/routes/price.js` - 私有价格API

### 前端
- `frontend/src/views/TemperatureMonitor.vue` - 温度监测页面
- `frontend/src/views/Certificate.vue` - 证书管理页面

---

## 部署说明

### 1. 部署链码（包含私有数据集合）
```bash
peer lifecycle chaincode package produce.tar.gz \
  --path ./chaincode \
  --lang golang \
  --label produce_1 \
  --collections-config ./chaincode/collections_config.json

# 安装时指定私有数据集合配置
peer lifecycle chaincode install produce.tar.gz
```

### 2. 启用历史数据库（core.yaml）
```yaml
peer:
  ledger:
    history:
      enableHistoryDatabase: true
```

### 3. 安装后端依赖
```bash
cd backend
npm install pdfkit moment
```

### 4. 前端路由更新
新增两个页面：
- `/temperature` - 温度监测
- `/certificate` - 证书管理

---

## 权限控制

| 功能 | 农场 | 加工厂 | 物流 | 质检员 |
|------|------|--------|------|--------|
| 设置价格 | ✅ | ✅ | ❌ | ❌ |
| 查看价格 | ✅ | ✅ | ✅ | ❌ |
| 记录温度 | ✅ | ✅ | ✅ | ✅ |
| 查看告警 | ✅ | ✅ | ✅ | ✅ |
| 生成证书 | ✅ | ✅ | ✅ | ✅ |

---

## 事件监听示例

```javascript
// Node.js SDK 监听温度告警事件
const contract = network.getContract('produce-traceability');

const listener = await contract.addContractListener(
  'temperature-alert-listener',
  'temperatureAlert',
  async (event) => {
    const alert = JSON.parse(event.payload.toString());
    console.log(`[ALERT] 产品 ${alert.produceID} 温度超标!`);
    console.log(`当前温度: ${alert.currentTemp}°C`);
    console.log(`位置: ${alert.location}`);
    console.log(`描述: ${alert.alertDescription}`);
    
    // 可以在这里触发其他操作：发送邮件、短信通知等
  }
);
```
