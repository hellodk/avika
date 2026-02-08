.PHONY: all build build-all clean

BINARY_NAME=agent
BUILD_DIR=bin

all: build

build:
	@echo "Building Agent..."
	go build -o $(BINARY_NAME) ./cmd/agent
	@echo "Building Gateway..."
	go build -o gateway ./cmd/gateway

build-all: clean
	@echo "Building Agent for linux/amd64..."
	GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/agent
	@echo "Building Agent for linux/arm64 (Raspberry Pi)..."
	GOOS=linux GOARCH=arm64 go build -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/agent
	@echo "Building Gateway for linux/amd64..."
	GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/gateway-linux-amd64 ./cmd/gateway
	@echo "Building Gateway for linux/arm64 (Raspberry Pi)..."
	GOOS=linux GOARCH=arm64 go build -o $(BUILD_DIR)/gateway-linux-arm64 ./cmd/gateway
	@echo "Builds complete. Binaries in $(BUILD_DIR)/"

clean:
	@echo "Cleaning..."
	rm -f $(BINARY_NAME) gateway
	rm -rf $(BUILD_DIR)
