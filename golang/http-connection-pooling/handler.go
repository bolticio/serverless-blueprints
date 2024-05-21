package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// client is used to make HTTP requests with a 10 second timeout.
// http.Clients should be reused instead of created as needed.
var client = &http.Client{
	Timeout: 10 * time.Second,
}

// requestPayload represents the expected structure of the JSON request body.
type requestPayload struct {
	URL string `json:"url"`
}

// handler is an example of making an HTTP request. MakeRequest uses a
// single http.Client for all requests to take advantage of connection
// pooling and caching. See https://godoc.org/net/http#Client.
func handler(w http.ResponseWriter, r *http.Request) {
	// Parse the JSON request body.
	var payload requestPayload
	err := json.NewDecoder(r.Body).Decode(&payload)
	if err != nil {
		http.Error(w, "Invalid request payload", http.StatusBadRequest)
		return
	}

	// Validate the URL.
	if payload.URL == "" {
		http.Error(w, "URL is required", http.StatusBadRequest)
		return
	}

	// Make an HTTP GET request using the provided URL.
	resp, err := client.Get(payload.URL)
	if err != nil {
		http.Error(w, "Error making request", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Check if the status code is not OK (200).
	if resp.StatusCode != http.StatusOK {
		msg := fmt.Sprintf("Bad StatusCode: %d", resp.StatusCode)
		http.Error(w, msg, http.StatusInternalServerError)
		return
	}

	// Initialize a map to hold the response body.
	response := map[string]string{
		"message": "ok!", // Set the message to "ok!"
	}

	// Set the Content-Type header to application/json.
	w.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response.
	json.NewEncoder(w).Encode(response)
}
