FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git gcc musl-dev

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o sflow-analyzer ./cmd/main.go

FROM alpine:latest

RUN apk add --no-cache ca-certificates sqlite

WORKDIR /app

COPY --from=builder /app/sflow-analyzer .
COPY --from=builder /app/../frontend/dist ./frontend/dist

EXPOSE 8080 6343/udp

CMD ["./sflow-analyzer", "-sflow-addr", ":6343", "-http-addr", ":8080"]
