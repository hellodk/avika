package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

func main() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		log.Fatal("DB_DSN environment variable is required. Example: postgres://user:pass@localhost:5432/avika?sslmode=disable")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("failed to open db: %v", err)
	}
	defer db.Close()

	rows, err := db.Query("SELECT agent_id, hostname, version, agent_version, is_pod, pod_ip FROM agents")
	if err != nil {
		log.Fatalf("query failed: %v", err)
	}
	defer rows.Close()

	fmt.Println("Agent ID | Hostname | NGINX Ver | Agent Ver | Is Pod | Pod IP")
	fmt.Println("------------------------------------------------------------------")
	for rows.Next() {
		var id, hostname, version, agentVersion, podIP string
		var isPod bool
		if err := rows.Scan(&id, &hostname, &version, &agentVersion, &isPod, &podIP); err != nil {
			log.Printf("warning: failed to scan row: %v", err)
			continue
		}
		fmt.Printf("%s | %s | %s | %s | %v | %s\n", id, hostname, version, agentVersion, isPod, podIP)
	}
}
