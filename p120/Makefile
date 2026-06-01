.PHONY: all build gateway device-simulator tidy clean run test

all: build

build: gateway device-simulator

gateway:
	@echo "Building gateway..."
	@mkdir -p bin
	go build -o bin/gateway ./cmd/gateway

device-simulator:
	@echo "Building device-simulator..."
	@mkdir -p bin
	go build -o bin/device-simulator ./cmd/device-simulator

tidy:
	go mod tidy

clean:
	@echo "Cleaning..."
	@rm -rf bin
	@rm -f coap_gateway.db

run: build
	@echo "Starting gateway..."
	./bin/gateway -config ./config.yaml

run-device: build
	@echo "Starting device simulator..."
	./bin/device-simulator -device-id dev-001

deps:
	@echo "Downloading dependencies..."
	go mod download

test:
	go test ./...

fmt:
	go fmt ./...

vet:
	go vet ./...
