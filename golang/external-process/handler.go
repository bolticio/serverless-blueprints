package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
)

type RequestBody struct {
	Command string `json:"command"`
}

func handler(w http.ResponseWriter, r *http.Request) {
	var requestBody RequestBody
	err := json.NewDecoder(r.Body).Decode(&requestBody)
	if err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	cmd := requestBody.Command
	if cmd == "" {
		http.Error(w, "Please specify a command to run in the payload", http.StatusBadRequest)
		return
	}

	// Run the command
	result, err := exec.Command("bash", "-c", cmd).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("Error executing command: %s", err), http.StatusInternalServerError)
		return
	}

	// Log stdout and stderr
	fmt.Println(string(result))

	response := map[string]string{
		"stdout": string(result),
		"stderr": "",
	}

	json.NewEncoder(w).Encode(response)
}
