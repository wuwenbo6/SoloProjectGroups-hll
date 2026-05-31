.PHONY: all build run clean docker-build docker-run k8s-deploy k8s-remove test

all: build

build:
	go build -o bin/server ./cmd/server/main.go

run:
	go run ./cmd/server/main.go

clean:
	rm -rf bin/ tmp/ tasks.db

docker-build:
	docker build -t fpga-compiler-service:latest .

docker-run:
	docker run -p 8080:8080 --name fpga-compiler fpga-compiler-service:latest

k8s-deploy:
	kubectl apply -f k8s/deployment.yaml

k8s-remove:
	kubectl delete -f k8s/deployment.yaml

k8s-logs:
	kubectl logs -l app=fpga-compiler -f

test:
	go test -v ./...

tidy:
	go mod tidy

dev:
	go run ./cmd/server/main.go
