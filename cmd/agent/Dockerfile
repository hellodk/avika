FROM golang:1.25

WORKDIR /app

# Copy the entire repository to access internal modules
COPY . .

# Build the agent
WORKDIR /app/cmd/agent
RUN go mod download
RUN go build -o agent .

CMD ["./agent"]
