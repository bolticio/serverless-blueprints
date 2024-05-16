package main

import (
	"net/http"
)

func handler(w http.ResponseWriter, r *http.Request) {
	// Redirect permanently
	http.Redirect(w, r, "https://www.boltic.io", http.StatusMovedPermanently)
}
