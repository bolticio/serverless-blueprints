package main

// Import necessary packages
import (
	"encoding/json"
	"net/http"
)

// Define the handler function
func handler(context http.ResponseWriter, event *http.Request) {
	// Initialize a map to hold the response body
	response := map[string]string{
		"message": "Hello, World!", // Set the message to "Hello, World!"
	}

	// Set the Content-Type header to application/json
	context.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response
	json.NewEncoder(context).Encode(response)
}
