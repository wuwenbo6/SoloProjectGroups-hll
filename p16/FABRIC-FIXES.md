# Fabric 问题修复说明

## 问题1: 背书策略配置错误

### 问题描述
交易失败，因为需要2个组织背书但只配置了1个组织。

### 修复方案

#### 1. 背书策略配置文件
**文件**: [config/endorsement-policy.yaml](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/config/endorsement-policy.yaml)

```yaml
identities:
  - role:
      name: member
      mspId: Org1MSP
  - role:
      name: member
      mspId: Org2MSP

policy:
  2-of:
    - signed-by: 0
    - signed-by: 1
```

#### 2. 部署时指定背书策略
```bash
# 批准链码时指定
peer lifecycle chaincode approveformyorg \
  --channelID mychannel \
  --name produce-traceability \
  --version 1.0 \
  --package-id <package-id> \
  --sequence 1 \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')"

# 提交链码时指定
peer lifecycle chaincode commit \
  --channelID mychannel \
  --name produce-traceability \
  --version 1.0 \
  --sequence 1 \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')" \
  --peerAddresses peer0.org1.example.com:7051 \
  --peerAddresses peer0.org2.example.com:9051
```

#### 3. 调用时指定背书节点
```javascript
// Node.js SDK 调用示例
const result = await contract.submitTransaction(
  'CreateProduce',
  ...args
);
```

**注意**: 提交交易时SDK会自动选择背书节点，但必须确保两个组织的peer都可用。

---

## 问题2: 链码查询历史返回空

### 问题描述
`GetProduceHistory` 返回空结果，因为未启用历史数据库。

### 修复方案

#### 1. Peer节点配置
**文件**: [config/core.yaml](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/config/core.yaml)

```yaml
peer:
  ledger:
    history:
      enableHistoryDatabase: true  # 关键配置
```

#### 2. Docker Compose 配置
**文件**: [config/docker-compose-couchdb.yaml](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/config/docker-compose-couchdb.yaml)

```yaml
peer0.org1.example.com:
  environment:
    - CORE_LEDGER_HISTORY_ENABLEHISTORYDATABASE=true
    - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
    - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb0:5984
```

#### 3. 链码代码修复
**文件**: [chaincode/smartcontract.go](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/chaincode/smartcontract.go#L266-L352)

新增 `GetHistoryForKey` 调用：

```go
historyIterator, err := ctx.GetStub().GetHistoryForKey(id)
if err != nil {
    return nil, fmt.Errorf("failed to get history for key %s: %v", id, err)
}
defer historyIterator.Close()

var historyRecords []HistoryRecord
for historyIterator.HasNext() {
    modification, err := historyIterator.Next()
    if err != nil {
        return nil, fmt.Errorf("failed to iterate history: %v", err)
    }

    var produceRecord Produce
    if len(modification.Value) > 0 {
        err = json.Unmarshal(modification.Value, &produceRecord)
        if err != nil {
            return nil, fmt.Errorf("failed to unmarshal history value: %v", err)
        }
    }

    record := HistoryRecord{
        TxID:      modification.TxId,
        Value:     produceRecord,
        Timestamp: modification.Timestamp.AsTime(),
        IsDelete:  modification.IsDelete,
    }
    historyRecords = append(historyRecords, record)
}
```

#### 4. 新增数据结构

```go
type HistoryRecord struct {
    TxID      string    `json:"txId"`
    Value     Produce   `json:"value"`
    Timestamp time.Time `json:"timestamp"`
    IsDelete  bool      `json:"isDelete"`
}

type ProduceHistory struct {
    Produce   Produce          `json:"produce"`
    Transfers []TransferRecord `json:"transfers"`
    Reports   []InspectionReport `json:"reports"`
    History   []HistoryRecord  `json:"history"`  // 新增区块链历史记录
}
```

---

## CouchDB 索引配置

**目录**: [chaincode/META-INF/statedb/couchdb/indexes/](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/chaincode/META-INF/statedb/couchdb/indexes/)

### indexOwner.json
```json
{
    "index": {
        "fields": ["currentOwner", "ownerRole"]
    },
    "ddoc": "indexOwnerDoc",
    "name": "indexOwner",
    "type": "json"
}
```

### indexStatus.json
```json
{
    "index": {
        "fields": ["status", "batchNumber"]
    },
    "ddoc": "indexStatusDoc",
    "name": "indexStatus",
    "type": "json"
}
```

---

## 一键部署脚本

**文件**: [scripts/deploy-chaincode.sh](file:///Users/wuwenbo/Documents/trae_projects/SoloProjects-hll/p16/scripts/deploy-chaincode.sh)

```bash
chmod +x scripts/deploy-chaincode.sh
./scripts/deploy-chaincode.sh
```

脚本自动完成：
1. 打包链码
2. Org1 和 Org2 分别安装链码
3. 两个组织分别批准链码（指定背书策略）
4. 提交链码定义（连接两个peer）
5. 初始化链码数据

---

## 验证修复

### 验证历史数据库
```bash
# 调用查询历史接口
peer chaincode query -C mychannel -n produce-traceability \
  -c '{"function":"GetProduceHistory","Args":["PROD001"]}'

# 应返回包含 history 字段的完整历史记录
```

### 验证背书策略
```bash
# 尝试只从一个peer提交（应该失败）
peer chaincode invoke -C mychannel -n produce-traceability \
  --peerAddresses peer0.org1.example.com:7051 \
  -c '{"function":"CreateProduce","Args":["TEST001","测试产品","BATCH-TEST","100","kg","TestOwner","farm",""]}'

# 正确方式：连接两个peer
peer chaincode invoke -C mychannel -n produce-traceability \
  --peerAddresses peer0.org1.example.com:7051 \
  --peerAddresses peer0.org2.example.com:9051 \
  -c '{"function":"CreateProduce","Args":["TEST001","测试产品","BATCH-TEST","100","kg","TestOwner","farm",""]}'
```

---

## 完整配置清单

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 历史数据库 | `enableHistoryDatabase: true` | 必须启用 |
| 状态数据库 | `CouchDB` | 推荐使用 |
| 背书策略 | `AND('Org1MSP.peer','Org2MSP.peer')` | 需要2组织签名 |
| 链码语言 | Go 1.21 | |
| Fabric 版本 | 2.x | |
