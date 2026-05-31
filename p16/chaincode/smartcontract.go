package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-chaincode-go/pkg/statebased"
)

const (
	PrivatePriceCollection = "priceCollection"
	TempAlertEvent         = "temperatureAlert"
	MaxAllowedTemperature  = 8.0
)

type SmartContract struct {
	contractapi.Contract
}

type Produce struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	BatchNumber  string    `json:"batchNumber"`
	Quantity     float64   `json:"quantity"`
	Unit         string    `json:"unit"`
	CurrentOwner string    `json:"currentOwner"`
	OwnerRole    string    `json:"ownerRole"`
	Status       string    `json:"status"`
	Timestamp    time.Time `json:"timestamp"`
	ImageURL     string    `json:"imageURL"`
}

type TransferRecord struct {
	From         string    `json:"from"`
	FromRole     string    `json:"fromRole"`
	To           string    `json:"to"`
	ToRole       string    `json:"toRole"`
	Location     string    `json:"location"`
	Timestamp    time.Time `json:"timestamp"`
	Remark       string    `json:"remark"`
}

type InspectionReport struct {
	ID             string    `json:"id"`
	ProduceID      string    `json:"produceID"`
	Inspector      string    `json:"inspector"`
	InspectionDate time.Time `json:"inspectionDate"`
	Items          []string  `json:"items"`
	Results        []string  `json:"results"`
	Conclusion     string    `json:"conclusion"`
	ReportURL      string    `json:"reportURL"`
}

type ProduceHistory struct {
	Produce   Produce          `json:"produce"`
	Transfers []TransferRecord `json:"transfers"`
	Reports   []InspectionReport `json:"reports"`
	History   []HistoryRecord  `json:"history"`
}

type HistoryRecord struct {
	TxID      string    `json:"txId"`
	Value     Produce   `json:"value"`
	Timestamp time.Time `json:"timestamp"`
	IsDelete  bool      `json:"isDelete"`
}

type PrivatePriceData struct {
	ProduceID   string  `json:"produceID"`
	Price       float64 `json:"price"`
	Currency    string  `json:"currency"`
	OwnerOrg    string  `json:"ownerOrg"`
	LastUpdated time.Time `json:"lastUpdated"`
}

type TemperatureReading struct {
	ProduceID   string    `json:"produceID"`
	Temperature float64   `json:"temperature"`
	Location    string    `json:"location"`
	Reader      string    `json:"reader"`
	Timestamp   time.Time `json:"timestamp"`
}

type TempAlertEventPayload struct {
	ProduceID        string    `json:"produceID"`
	CurrentTemp      float64   `json:"currentTemp"`
	MaxAllowedTemp   float64   `json:"maxAllowedTemp"`
	Location         string    `json:"location"`
	Timestamp        time.Time `json:"timestamp"`
	AlertDescription string    `json:"alertDescription"`
}

type CertificateData struct {
	CertificateID   string    `json:"certificateID"`
	ProduceID       string    `json:"produceID"`
	Issuer          string    `json:"issuer"`
	IssueDate       time.Time `json:"issueDate"`
	ValidUntil      time.Time `json:"validUntil"`
	Status          string    `json:"status"`
	QRCodeHash      string    `json:"qrCodeHash"`
}

func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	produces := []Produce{
		{
			ID:           "PROD001",
			Name:         "有机西红柿",
			BatchNumber:  "BATCH-2024-001",
			Quantity:     500,
			Unit:         "kg",
			CurrentOwner: "阳光农场",
			OwnerRole:    "farm",
			Status:       "CREATED",
			Timestamp:    time.Now(),
			ImageURL:     "",
		},
	}

	for _, produce := range produces {
		produceJSON, err := json.Marshal(produce)
		if err != nil {
			return err
		}

		err = ctx.GetStub().PutState(produce.ID, produceJSON)
		if err != nil {
			return fmt.Errorf("failed to put to world state. %v", err)
		}
	}

	return nil
}

func (s *SmartContract) CreateProduce(
	ctx contractapi.TransactionContextInterface,
	id string,
	name string,
	batchNumber string,
	quantity float64,
	unit string,
	owner string,
	ownerRole string,
	imageURL string,
) (*Produce, error) {
	exists, err := s.ProduceExists(ctx, id)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, fmt.Errorf("the produce %s already exists", id)
	}

	produce := Produce{
		ID:           id,
		Name:         name,
		BatchNumber:  batchNumber,
		Quantity:     quantity,
		Unit:         unit,
		CurrentOwner: owner,
		OwnerRole:    ownerRole,
		Status:       "CREATED",
		Timestamp:    time.Now(),
		ImageURL:     imageURL,
	}

	produceJSON, err := json.Marshal(produce)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(id, produceJSON)
	if err != nil {
		return nil, err
	}

	return &produce, nil
}

func (s *SmartContract) TransferProduce(
	ctx contractapi.TransactionContextInterface,
	id string,
	newOwner string,
	newOwnerRole string,
	location string,
	remark string,
) (*Produce, error) {
	produce, err := s.ReadProduce(ctx, id)
	if err != nil {
		return nil, err
	}

	transferRecord := TransferRecord{
		From:      produce.CurrentOwner,
		FromRole:  produce.OwnerRole,
		To:        newOwner,
		ToRole:    newOwnerRole,
		Location:  location,
		Timestamp: time.Now(),
		Remark:    remark,
	}

	transferKey, err := ctx.GetStub().CreateCompositeKey("TRANSFER", []string{id, fmt.Sprintf("%d", time.Now().UnixNano())})
	if err != nil {
		return nil, err
	}

	transferJSON, err := json.Marshal(transferRecord)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(transferKey, transferJSON)
	if err != nil {
		return nil, err
	}

	produce.CurrentOwner = newOwner
	produce.OwnerRole = newOwnerRole
	produce.Status = "TRANSFERRED"
	produce.Timestamp = time.Now()

	produceJSON, err := json.Marshal(produce)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(id, produceJSON)
	if err != nil {
		return nil, err
	}

	return produce, nil
}

func (s *SmartContract) AddInspectionReport(
	ctx contractapi.TransactionContextInterface,
	reportID string,
	produceID string,
	inspector string,
	items string,
	results string,
	conclusion string,
	reportURL string,
) (*InspectionReport, error) {
	_, err := s.ReadProduce(ctx, produceID)
	if err != nil {
		return nil, err
	}

	var itemsArray []string
	var resultsArray []string
	if err := json.Unmarshal([]byte(items), &itemsArray); err != nil {
		return nil, err
	}
	if err := json.Unmarshal([]byte(results), &resultsArray); err != nil {
		return nil, err
	}

	report := InspectionReport{
		ID:             reportID,
		ProduceID:      produceID,
		Inspector:      inspector,
		InspectionDate: time.Now(),
		Items:          itemsArray,
		Results:        resultsArray,
		Conclusion:     conclusion,
		ReportURL:      reportURL,
	}

	reportKey, err := ctx.GetStub().CreateCompositeKey("REPORT", []string{produceID, reportID})
	if err != nil {
		return nil, err
	}

	reportJSON, err := json.Marshal(report)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(reportKey, reportJSON)
	if err != nil {
		return nil, err
	}

	return &report, nil
}

func (s *SmartContract) ReadProduce(ctx contractapi.TransactionContextInterface, id string) (*Produce, error) {
	produceJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read from world state: %v", err)
	}
	if produceJSON == nil {
		return nil, fmt.Errorf("the produce %s does not exist", id)
	}

	var produce Produce
	err = json.Unmarshal(produceJSON, &produce)
	if err != nil {
		return nil, err
	}

	return &produce, nil
}

func (s *SmartContract) GetProduceHistory(ctx contractapi.TransactionContextInterface, id string) (*ProduceHistory, error) {
	produce, err := s.ReadProduce(ctx, id)
	if err != nil {
		return nil, err
	}

	transferIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("TRANSFER", []string{id})
	if err != nil {
		return nil, err
	}
	defer transferIterator.Close()

	var transfers []TransferRecord
	for transferIterator.HasNext() {
		kv, err := transferIterator.Next()
		if err != nil {
			return nil, err
		}

		var transfer TransferRecord
		err = json.Unmarshal(kv.Value, &transfer)
		if err != nil {
			return nil, err
		}
		transfers = append(transfers, transfer)
	}

	reportIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("REPORT", []string{id})
	if err != nil {
		return nil, err
	}
	defer reportIterator.Close()

	var reports []InspectionReport
	for reportIterator.HasNext() {
		kv, err := reportIterator.Next()
		if err != nil {
			return nil, err
		}

		var report InspectionReport
		err = json.Unmarshal(kv.Value, &report)
		if err != nil {
			return nil, err
		}
		reports = append(reports, report)
	}

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

	history := ProduceHistory{
		Produce:   *produce,
		Transfers: transfers,
		Reports:   reports,
		History:   historyRecords,
	}

	return &history, nil
}

func (s *SmartContract) ProduceExists(ctx contractapi.TransactionContextInterface, id string) (bool, error) {
	produceJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return false, fmt.Errorf("failed to read from world state: %v", err)
	}

	return produceJSON != nil, nil
}

func (s *SmartContract) GetAllProduces(ctx contractapi.TransactionContextInterface) ([]*Produce, error) {
	resultsIterator, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var produces []*Produce
	for resultsIterator.HasNext() {
		queryResponse, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var produce Produce
		err = json.Unmarshal(queryResponse.Value, &produce)
		if err != nil {
			return nil, err
		}
		produces = append(produces, &produce)
	}

	return produces, nil
}

func (s *SmartContract) UpdateProduceStatus(
	ctx contractapi.TransactionContextInterface,
	id string,
	status string,
) (*Produce, error) {
	produce, err := s.ReadProduce(ctx, id)
	if err != nil {
		return nil, err
	}

	produce.Status = status
	produce.Timestamp = time.Now()

	produceJSON, err := json.Marshal(produce)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(id, produceJSON)
	if err != nil {
		return nil, err
	}

	return produce, nil
}

func (s *SmartContract) SetPrivatePrice(
	ctx contractapi.TransactionContextInterface,
	produceID string,
	price float64,
	currency string,
	ownerOrg string,
) (*PrivatePriceData, error) {
	_, err := s.ReadProduce(ctx, produceID)
	if err != nil {
		return nil, err
	}

	priceData := PrivatePriceData{
		ProduceID:   produceID,
		Price:       price,
		Currency:    currency,
		OwnerOrg:    ownerOrg,
		LastUpdated: time.Now(),
	}

	priceJSON, err := json.Marshal(priceData)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutPrivateData(PrivatePriceCollection, produceID, priceJSON)
	if err != nil {
		return nil, fmt.Errorf("failed to put private price data: %v", err)
	}

	return &priceData, nil
}

func (s *SmartContract) GetPrivatePrice(
	ctx contractapi.TransactionContextInterface,
	produceID string,
) (*PrivatePriceData, error) {
	priceJSON, err := ctx.GetStub().GetPrivateData(PrivatePriceCollection, produceID)
	if err != nil {
		return nil, fmt.Errorf("failed to get private price data: %v", err)
	}
	if priceJSON == nil {
		return nil, fmt.Errorf("price data for produce %s does not exist in private collection", produceID)
	}

	var priceData PrivatePriceData
	err = json.Unmarshal(priceJSON, &priceData)
	if err != nil {
		return nil, err
	}

	return &priceData, nil
}

func (s *SmartContract) SetStateBasedEndorsementPolicy(
	ctx contractapi.TransactionContextInterface,
	produceID string,
) error {
	ep, err := statebased.NewStateEP(nil)
	if err != nil {
		return err
	}

	err = ep.AddOrgs(statebased.RoleTypePeer, "Org1MSP", "Org2MSP")
	if err != nil {
		return err
	}

	epBytes, err := ep.Policy()
	if err != nil {
		return err
	}

	err = ctx.GetStub().SetStateValidationParameter(produceID, epBytes)
	if err != nil {
		return err
	}

	return nil
}

func (s *SmartContract) RecordTemperature(
	ctx contractapi.TransactionContextInterface,
	produceID string,
	temperature float64,
	location string,
	reader string,
) (*TemperatureReading, error) {
	_, err := s.ReadProduce(ctx, produceID)
	if err != nil {
		return nil, err
	}

	reading := TemperatureReading{
		ProduceID:   produceID,
		Temperature: temperature,
		Location:    location,
		Reader:      reader,
		Timestamp:   time.Now(),
	}

	readingKey, err := ctx.GetStub().CreateCompositeKey("TEMP", []string{produceID, fmt.Sprintf("%d", time.Now().UnixNano())})
	if err != nil {
		return nil, err
	}

	readingJSON, err := json.Marshal(reading)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(readingKey, readingJSON)
	if err != nil {
		return nil, err
	}

	if temperature > MaxAllowedTemperature {
		alertPayload := TempAlertEventPayload{
			ProduceID:        produceID,
			CurrentTemp:      temperature,
			MaxAllowedTemp:   MaxAllowedTemperature,
			Location:         location,
			Timestamp:        time.Now(),
			AlertDescription: fmt.Sprintf("温度超标！当前温度: %.2f°C, 允许最高温度: %.2f°C", temperature, MaxAllowedTemperature),
		}

		alertJSON, err := json.Marshal(alertPayload)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal alert payload: %v", err)
		}

		err = ctx.GetStub().SetEvent(TempAlertEvent, alertJSON)
		if err != nil {
			return nil, fmt.Errorf("failed to set temperature alert event: %v", err)
		}

		produce, _ := s.ReadProduce(ctx, produceID)
		produce.Status = "TEMP_ALERT"
		produce.Timestamp = time.Now()
		produceJSON, _ := json.Marshal(produce)
		ctx.GetStub().PutState(produceID, produceJSON)
	}

	return &reading, nil
}

func (s *SmartContract) GetTemperatureHistory(
	ctx contractapi.TransactionContextInterface,
	produceID string,
) ([]TemperatureReading, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("TEMP", []string{produceID})
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	var readings []TemperatureReading
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		var reading TemperatureReading
		err = json.Unmarshal(kv.Value, &reading)
		if err != nil {
			return nil, err
		}
		readings = append(readings, reading)
	}

	return readings, nil
}

func (s *SmartContract) IssueCertificate(
	ctx contractapi.TransactionContextInterface,
	certificateID string,
	produceID string,
	issuer string,
	validDays int,
	qrCodeHash string,
) (*CertificateData, error) {
	_, err := s.ReadProduce(ctx, produceID)
	if err != nil {
		return nil, err
	}

	certificate := CertificateData{
		CertificateID: certificateID,
		ProduceID:     produceID,
		Issuer:        issuer,
		IssueDate:     time.Now(),
		ValidUntil:    time.Now().AddDate(0, 0, validDays),
		Status:        "VALID",
		QRCodeHash:    qrCodeHash,
	}

	certKey, err := ctx.GetStub().CreateCompositeKey("CERT", []string{produceID, certificateID})
	if err != nil {
		return nil, err
	}

	certJSON, err := json.Marshal(certificate)
	if err != nil {
		return nil, err
	}

	err = ctx.GetStub().PutState(certKey, certJSON)
	if err != nil {
		return nil, err
	}

	return &certificate, nil
}

func (s *SmartContract) GetCertificates(
	ctx contractapi.TransactionContextInterface,
	produceID string,
) ([]CertificateData, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("CERT", []string{produceID})
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	var certificates []CertificateData
	for iterator.HasNext() {
		kv, err := iterator.Next()
		if err != nil {
			return nil, err
		}

		var cert CertificateData
		err = json.Unmarshal(kv.Value, &cert)
		if err != nil {
			return nil, err
		}

		if cert.Status == "VALID" && time.Now().After(cert.ValidUntil) {
			cert.Status = "EXPIRED"
			certJSON, _ := json.Marshal(cert)
			ctx.GetStub().PutState(kv.Key, certJSON)
		}

		certificates = append(certificates, cert)
	}

	return certificates, nil
}

func (s *SmartContract) RevokeCertificate(
	ctx contractapi.TransactionContextInterface,
	produceID string,
	certificateID string,
	reason string,
) error {
	certKey, err := ctx.GetStub().CreateCompositeKey("CERT", []string{produceID, certificateID})
	if err != nil {
		return err
	}

	certJSON, err := ctx.GetStub().GetState(certKey)
	if err != nil {
		return err
	}
	if certJSON == nil {
		return fmt.Errorf("certificate %s does not exist", certificateID)
	}

	var cert CertificateData
	err = json.Unmarshal(certJSON, &cert)
	if err != nil {
		return err
	}

	cert.Status = "REVOKED"
	updatedJSON, err := json.Marshal(cert)
	if err != nil {
		return err
	}

	err = ctx.GetStub().PutState(certKey, updatedJSON)
	if err != nil {
		return err
	}

	return nil
}
