package main

import (
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Panicf("Error creating produce traceability chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		log.Panicf("Error starting produce traceability chaincode: %v", err)
	}

	fmt.Println("Produce Traceability Chaincode started successfully")
}
