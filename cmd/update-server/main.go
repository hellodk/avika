package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := "8090"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	distDir := "./dist"
	if _, err := os.Stat(distDir); os.IsNotExist(err) {
		if err := os.MkdirAll(distDir, 0755); err != nil {
			log.Fatalf("Failed to create dist directory: %v", err)
		}
	}

	fs := http.FileServer(http.Dir(distDir))

	// Add logging middleware
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s %s", r.RemoteAddr, r.Method, r.URL.Path)
		// Set CORS for local development
		w.Header().Set("Access-Control-Allow-Origin", "*")
		fs.ServeHTTP(w, r)
	})

	log.Printf("🚀 Update Server running on http://localhost:%s", port)
	log.Printf("📁 Serving files from %s", distDir)

	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("Update Server failed: %v", err)
	}
}
