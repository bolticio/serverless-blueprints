package main

import (
	"fmt"
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	// Get the request headers
	headers := r.Header

	// Modify the headers
	headers.Set("User-Agent", "Boltic Serverless")

	// Print the modified headers (optional)
	fmt.Println("Modified Headers:", headers)

	// Write a response with modified headers
	w.WriteHeader(http.StatusOK)
}
