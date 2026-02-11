.PHONY: all build build-all clean

BINARY_NAME=agent
BUILD_DIR=bin

VERSION=$(shell cat VERSION 2>/dev/null || git describe --tags --always --dirty 2>/dev/null || echo "v0.1.0-dev")
BUILD_DATE=$(shell date -u +'%Y-%m-%dT%H:%M:%SZ')
GIT_COMMIT=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(shell git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")

LDFLAGS=-ldflags "-X 'main.Version=$(VERSION)' -X 'main.BuildDate=$(BUILD_DATE)' -X 'main.GitCommit=$(GIT_COMMIT)' -X 'main.GitBranch=$(GIT_BRANCH)'"

all: proto build

proto:
	@echo "Regenerating gRPC code..."
	protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative -I api/proto api/proto/agent.proto
	@mkdir -p internal/common/proto/agent
	@mv agent.pb.go internal/common/proto/agent/
	@mv agent_grpc.pb.go internal/common/proto/agent/

build:
	@echo "Building Agent $(VERSION)..."
	go build $(LDFLAGS) -o $(BINARY_NAME) ./cmd/agent
	@echo "Building Gateway..."
	go build -o gateway ./cmd/gateway

build-all: clean
	@echo "Building Agent for linux/amd64 ($(VERSION))..."
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 ./cmd/agent
	@echo "Building Agent for linux/arm64 (Raspberry Pi, $(VERSION))..."
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 ./cmd/agent
	@echo "Building Gateway for linux/amd64..."
	GOOS=linux GOARCH=amd64 go build -o $(BUILD_DIR)/gateway-linux-amd64 ./cmd/gateway
	@echo "Building Gateway for linux/arm64 (Raspberry Pi)..."
	GOOS=linux GOARCH=arm64 go build -o $(BUILD_DIR)/gateway-linux-arm64 ./cmd/gateway
	@echo "Builds complete. Binaries in $(BUILD_DIR)/"

clean:
	@echo "Cleaning..."
	rm -f $(BINARY_NAME) gateway
	rm -rf $(BUILD_DIR)
