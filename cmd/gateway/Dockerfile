FROM golang:1.25

WORKDIR /app

# Copy the entire repository to access internal modules and go.work
COPY . .

# Build the gateway
WORKDIR /app/cmd/gateway
RUN go mod download
RUN go build -o gateway .

EXPOSE 50051

CMD ["./gateway"]
