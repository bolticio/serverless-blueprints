package main

import (
	"net/http"
	"os"
)

// Handler function to handle requests
func handler(w http.ResponseWriter, r *http.Request) {
	foo := os.Getenv("FOO")
	if foo == "" {
		foo = "Specified environment variable is not set."
	}
	w.Write([]byte(foo))
}
