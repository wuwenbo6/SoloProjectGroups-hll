FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main ./cmd/server/main.go

FROM alpine:latest

RUN apk add --no-cache gcc musl-dev ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/main .
COPY --from=builder /app/web ./web
COPY --from=builder /app/static ./static

RUN mkdir -p /app/tmp

EXPOSE 8080

CMD ["./main"]
