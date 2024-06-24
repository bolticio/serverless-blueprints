// package main provides a set of HTTP Cloud Functions samples.
package main

import (
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

	// Print to stdout. Function logs are displayed in the console.
	fmt.Printf("Count: %v\n", count)
}
