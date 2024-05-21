// Package http provides a set of HTTP Cloud Functions samples.
package http

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// count is a global variable, but only shared within a function instance.
var count = 0

// handler is an HTTP function that counts how many times it
// is executed within a specific instance.
func handler(w http.ResponseWriter, r *http.Request) {
	count++

	// Note: the total function invocation count across
	// all instances may not be equal to this value!
	fmt.Fprintf(w, "Instance execution count: %d", count)

	// Create the response body
	response := map[string]int{
		"count": count,
	}
	fmt.Printf("Response: %v\n", response)
	// Set the Content-Type header to application/json
	w.Header().Set("Content-Type", "application/json")

	// Encode the response map into JSON and write it to the response
	json.NewEncoder(w).Encode(response)
}
