.PHONY: build run deps test clean install-code-server

BINARY_NAME=code-server-manager
BUILD_DIR=bin

build:
	@mkdir -p $(BUILD_DIR)
	@echo "Building $(BINARY_NAME)..."
	@go build -o $(BUILD_DIR)/$(BINARY_NAME) ./cmd/server
	@echo "Build complete: $(BUILD_DIR)/$(BINARY_NAME)"

deps:
	@echo "Downloading dependencies..."
	@go mod download
	@go mod tidy

run: build
	@echo "Starting $(BINARY_NAME)..."
	@./$(BUILD_DIR)/$(BINARY_NAME) config.yaml

dev:
	@echo "Starting development server..."
	@go run ./cmd/server config.yaml

test:
	@echo "Running tests..."
	@go test -v ./...

clean:
	@echo "Cleaning..."
	@rm -rf $(BUILD_DIR)
	@rm -rf workspaces/*
	@rm -f data/users.json

install-code-server:
	@echo "Installing code-server..."
	@curl -fsSL https://code-server.dev/install.sh | sh
	@echo "code-server installed successfully"

check-code-server:
	@command -v code-server >/dev/null 2>&1 || { \
		echo "code-server not found. Installing..."; \
		curl -fsSL https://code-server.dev/install.sh | sh; \
	}
	@echo "code-server is installed at: $$(command -v code-server)"
