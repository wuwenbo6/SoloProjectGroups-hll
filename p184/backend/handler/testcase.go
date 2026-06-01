package handler

import (
	"encoding/json"
	"net/http"

	"grpc-invoker/backend/grpcutil"
)

func HandleTestCaseList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	store := grpcutil.GetTestCaseStore()
	if store == nil {
		writeJSON(w, http.StatusOK, []*grpcutil.TestCase{})
		return
	}

	cases := store.List()
	writeJSON(w, http.StatusOK, cases)
}

func HandleTestCaseSave(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var tc grpcutil.TestCase
	if err := json.NewDecoder(r.Body).Decode(&tc); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	store := grpcutil.GetTestCaseStore()
	if store == nil {
		writeError(w, http.StatusInternalServerError, "test case store not initialized")
		return
	}

	if err := store.Save(&tc); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, tc)
}

func HandleTestCaseDelete(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	var req struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	store := grpcutil.GetTestCaseStore()
	if store == nil {
		writeError(w, http.StatusInternalServerError, "test case store not initialized")
		return
	}

	if err := store.Delete(req.ID); err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
