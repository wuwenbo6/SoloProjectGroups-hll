package main

import (
	"database/sql"
	"log"
	"time"
)

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite3", "./transactions.db")
	if err != nil {
		log.Fatal(err)
	}

	createTableSQL := `
	CREATE TABLE IF NOT EXISTS transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		mti TEXT,
		card_number TEXT,
		amount TEXT,
		rrn TEXT,
		response_code TEXT,
		status TEXT,
		raw_request TEXT,
		raw_response TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	_, err = db.Exec(createTableSQL)
	if err != nil {
		log.Fatal(err)
	}

	log.Println("Database initialized successfully")
}

func closeDB() {
	if db != nil {
		db.Close()
	}
}

func saveTransaction(mti, cardNumber, amount, rrn, responseCode, status, rawRequest, rawResponse string) error {
	stmt, err := db.Prepare(`
		INSERT INTO transactions (mti, card_number, amount, rrn, response_code, status, raw_request, raw_response)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	_, err = stmt.Exec(mti, cardNumber, amount, rrn, responseCode, status, rawRequest, rawResponse)
	return err
}

func getTransactions(limit int) ([]Transaction, error) {
	rows, err := db.Query(`
		SELECT id, mti, card_number, amount, rrn, response_code, status, raw_request, raw_response, created_at
		FROM transactions
		ORDER BY created_at DESC
		LIMIT ?
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var transactions []Transaction
	for rows.Next() {
		var tx Transaction
		var createdAtStr string
		err := rows.Scan(
			&tx.ID,
			&tx.MTI,
			&tx.CardNumber,
			&tx.Amount,
			&tx.RRN,
			&tx.ResponseCode,
			&tx.Status,
			&tx.RawRequest,
			&tx.RawResponse,
			&createdAtStr,
		)
		if err != nil {
			return nil, err
		}

		tx.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
		transactions = append(transactions, tx)
	}

	return transactions, nil
}
