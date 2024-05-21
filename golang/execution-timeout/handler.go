package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func handler(w http.ResponseWriter, r *http.Request) {
	// Set a timeout delay in milliseconds
	delay := time.Second * 1 // 1 second

	fmt.Println("Starting execution...")

	// Wait for the delay to pass
	time.Sleep(delay)

	fmt.Println("Execution resumed after delay.")

	// Create the response body
	response := map[string]string{
		"message": "Function executed with intentional delay.",
	}
	fmt.Printf("Response: %s\n", response)
	// Set the Content-Type header to application/json
	w.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response
	json.NewEncoder(w).Encode(response)
}
