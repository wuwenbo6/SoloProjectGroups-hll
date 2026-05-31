FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o pv-monitor ./cmd/main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/pv-monitor .
COPY --from=builder /app/web ./web

EXPOSE 8080

CMD ["./pv-monitor"]
