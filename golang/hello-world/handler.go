package main

// Import necessary packages
import (
	"encoding/json"
	"net/http"
)

// Define the handler function
func handler(w http.ResponseWriter, r *http.Request) {
	// Initialize a map to hold the response body
	response := map[string]string{
		"message": "Hello, World!", // Set the message to "Hello, World!"
	}

	// Set the Content-Type header to application/json
	w.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response
	json.NewEncoder(w).Encode(response)
}
