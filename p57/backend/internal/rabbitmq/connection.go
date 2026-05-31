package rabbitmq

import (
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

const (
	ExchangeName = "market_fanout"
	ExchangeType = "fanout"
)

type Connection struct {
	conn    *amqp.Connection
	channel *amqp.Channel
	url     string
}

func NewConnection(url string) (*Connection, error) {
	rmq := &Connection{url: url}
	if err := rmq.connect(); err != nil {
		return nil, err
	}
	go rmq.reconnectLoop()
	return rmq, nil
}

func (r *Connection) connect() error {
	var err error
	r.conn, err = amqp.Dial(r.url)
	if err != nil {
		return err
	}

	r.channel, err = r.conn.Channel()
	if err != nil {
		return err
	}

	err = r.channel.ExchangeDeclare(
		ExchangeName,
		ExchangeType,
		true,
		false,
		false,
		false,
		nil,
	)
	if err != nil {
		return err
	}

	log.Println("RabbitMQ connected and exchange declared")
	return nil
}

func (r *Connection) reconnectLoop() {
	for {
		reason, ok := <-r.conn.NotifyClose(make(chan *amqp.Error))
		if !ok {
			return
		}
		log.Printf("RabbitMQ connection closed: %v, reconnecting...", reason)

		for {
			if err := r.connect(); err != nil {
				log.Printf("Failed to reconnect: %v, retrying in 5s...", err)
				time.Sleep(5 * time.Second)
				continue
			}
			break
		}
	}
}

func (r *Connection) Channel() *amqp.Channel {
	return r.channel
}

func (r *Connection) Close() {
	if r.channel != nil {
		r.channel.Close()
	}
	if r.conn != nil {
		r.conn.Close()
	}
}
