module github.com/user/nginx-manager/cmd/gateway

go 1.25.4

replace github.com/user/nginx-manager/internal/common => ../../internal/common

replace github.com/user/nginx-manager => ../../

require (
	github.com/lib/pq v1.11.1
	github.com/segmentio/kafka-go v0.4.50
	github.com/user/nginx-manager v0.0.0-00010101000000-000000000000
	google.golang.org/grpc v1.78.0
)

require (
	github.com/klauspost/compress v1.15.9 // indirect
	github.com/pierrec/lz4/v4 v4.1.15 // indirect
	golang.org/x/net v0.47.0 // indirect
	golang.org/x/sys v0.38.0 // indirect
	golang.org/x/text v0.31.0 // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20251029180050-ab9386a59fda // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
