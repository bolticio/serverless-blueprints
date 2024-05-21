// Package http provides a set of HTTP Cloud Functions samples.
package http

import (
	"encoding/json"
	"net/http"
)

// handler is an example of setting CORS headers.
// For more information about CORS and CORS preflight requests, see
// https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request.
func handler(w http.ResponseWriter, r *http.Request) {
	// Set CORS headers for the preflight request
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Max-Age", "3600")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Set CORS headers for the main request.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	// Initialize a map to hold the response body
	response := map[string]string{
		"message": "Hello, World!", // Set the message to "Hello, World!"
	}

	// Set the Content-Type header to application/json
	w.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response
	json.NewEncoder(w).Encode(response)
}
