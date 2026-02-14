FROM golang:1.24-alpine AS builder

ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG GIT_COMMIT=unknown

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy the entire repository
COPY . .

# Build the gateway with version info
WORKDIR /app/cmd/gateway
RUN go mod download
RUN CGO_ENABLED=0 go build -ldflags="-s -w \
    -X main.Version=${VERSION} \
    -X main.BuildDate=${BUILD_DATE} \
    -X main.GitCommit=${GIT_COMMIT}" \
    -o gateway .

# Production stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates curl

WORKDIR /app
COPY --from=builder /app/cmd/gateway/gateway .

# Expose ports (5020-5050 range)
EXPOSE 5020 5021 5022

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:5021/health || exit 1

CMD ["./gateway"]
