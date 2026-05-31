.PHONY: all build generate clean test

BIN := dbprobe
BPF_SRC := bpf/dbprobe.bpf.c
BPF_GO := pkg/ebpf/bpf_bpfel.go pkg/ebpf/bpf_bpfeb.go

CLANG ?= clang-14
CFLAGS := -O2 -g -Wall -Werror

all: build

generate: $(BPF_GO)

$(BPF_GO): $(BPF_SRC)
	cd pkg/ebpf && go generate ./...

build: generate
	go build -o $(BIN) ./cmd/dbprobe

build-race: generate
	go build -race -o $(BIN) ./cmd/dbprobe

test:
	go test -v ./...

clean:
	rm -f $(BIN)
	rm -f pkg/ebpf/bpf_*.go
	rm -f pkg/ebpf/*.o

deps:
	go mod download
	go mod tidy

run: build
	sudo ./$(BIN)

run-mysql-uprobe: build
	sudo ./$(BIN) --uprobe-mysql --mysql-binary /usr/sbin/mysqld

run-pg-uprobe: build
	sudo ./$(BIN) --uprobe-postgres --postgres-binary /usr/bin/postgres

run-ssl: build
	sudo ./$(BIN) --uprobe-ssl --ssl-binary /usr/lib/x86_64-linux-gnu/libssl.so.3

fmt:
	go fmt ./...

vet:
	go vet ./...

lint:
	golangci-lint run
