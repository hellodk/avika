package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	pb "github.com/user/nginx-manager/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	fmt.Println("Attempting to connect to localhost:50051...")
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := pb.NewAgentServiceClient(conn)

	fmt.Println("Calling GetAnalytics...")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	r, err := c.GetAnalytics(ctx, &pb.AnalyticsRequest{TimeWindow: "24h"})
	if err != nil {
		log.Fatalf("could not get analytics: %v", err)
	}

	fmt.Println("Response received. Marshaling...")
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		log.Fatalf("failed to marshal: %v", err)
	}
	fmt.Println(string(b))
}
