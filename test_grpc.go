package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	pb "github.com/avika-ai/avika/internal/common/proto/agent"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	fmt.Println("Attempting to connect to 10.101.68.5:5020...")
	conn, err := grpc.NewClient("10.101.68.5:5020", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := pb.NewAgentServiceClient(conn)

	fmt.Println("Calling ListAgents...")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*5)
	defer cancel()

	r, err := c.ListAgents(ctx, &pb.ListAgentsRequest{})
	if err != nil {
		log.Fatalf("could not list agents: %v", err)
	}

	fmt.Println("Response received. Marshaling...")
	b, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		log.Fatalf("failed to marshal: %v", err)
	}
	fmt.Println(string(b))
}
