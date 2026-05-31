#!/bin/bash

set -e

CHANNEL_NAME="mychannel"
CC_NAME="produce-traceability"
CC_VERSION="1.0"
CC_SEQUENCE="1"
CC_PATH="./chaincode"
CC_ENDORSEMENT_POLICY="AND('Org1MSP.peer','Org2MSP.peer')"

echo "========================================="
echo "链码部署脚本 - 需要2组织背书"
echo "========================================="

echo ""
echo "1. 打包链码..."
peer lifecycle chaincode package ${CC_NAME}.tar.gz \
  --path ${CC_PATH} \
  --lang golang \
  --label ${CC_NAME}_${CC_VERSION}

echo ""
echo "2. Org1 安装链码..."
peer lifecycle chaincode install ${CC_NAME}.tar.gz

echo ""
echo "3. Org2 安装链码..."
export CORE_PEER_ADDRESS=peer0.org2.example.com:9051
export CORE_PEER_LOCALMSPID=Org2MSP
export CORE_PEER_MSPCONFIGPATH=/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
peer lifecycle chaincode install ${CC_NAME}.tar.gz

echo ""
echo "4. 查询链码包ID..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "Package ID" | awk '{print $3}' | head -1)
echo "Package ID: ${PACKAGE_ID}"

echo ""
echo "5. Org1 批准链码..."
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
peer lifecycle chaincode approveformyorg \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --channelID ${CHANNEL_NAME} \
  --name ${CC_NAME} \
  --version ${CC_VERSION} \
  --package-id ${PACKAGE_ID} \
  --sequence ${CC_SEQUENCE} \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')"

echo ""
echo "6. Org2 批准链码..."
export CORE_PEER_ADDRESS=peer0.org2.example.com:9051
export CORE_PEER_LOCALMSPID=Org2MSP
export CORE_PEER_MSPCONFIGPATH=/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_TLS_ROOTCERT_FILE=/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
peer lifecycle chaincode approveformyorg \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --channelID ${CHANNEL_NAME} \
  --name ${CC_NAME} \
  --version ${CC_VERSION} \
  --package-id ${PACKAGE_ID} \
  --sequence ${CC_SEQUENCE} \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')"

echo ""
echo "7. 检查链码是否已准备好提交..."
peer lifecycle chaincode checkcommitreadiness \
  --channelID ${CHANNEL_NAME} \
  --name ${CC_NAME} \
  --version ${CC_VERSION} \
  --sequence ${CC_SEQUENCE} \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')" \
  --output json

echo ""
echo "8. 提交链码定义（需要同时连接两个组织的peer）"
peer lifecycle chaincode commit \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --channelID ${CHANNEL_NAME} \
  --name ${CC_NAME} \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:9051 \
  --tlsRootCertFiles /organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  --version ${CC_VERSION} \
  --sequence ${CC_SEQUENCE} \
  --signature-policy "AND('Org1MSP.peer','Org2MSP.peer')"

echo ""
echo "9. 查询已提交的链码定义..."
peer lifecycle chaincode querycommitted --channelID ${CHANNEL_NAME} --name ${CC_NAME}

echo ""
echo "10. 初始化链码..."
peer chaincode invoke \
  -o orderer.example.com:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile /organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  -C ${CHANNEL_NAME} \
  -n ${CC_NAME} \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:9051 \
  --tlsRootCertFiles /organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  -c '{"function":"InitLedger","Args":[]}'

echo ""
echo "========================================="
echo "链码部署完成！"
echo "背书策略: AND('Org1MSP.peer','Org2MSP.peer')"
echo "需要两个组织同时签名"
echo "========================================="
