CC = gcc
CFLAGS = -Wall -Wextra -O2 -g -pthread
LDFLAGS = -lpcap -lsqlite3 -pthread -lm

TARGET = sqlids
SRCS = main.c capture.c http.c sqli.c utils.c rst.c stream.c ml.c database.c export.c webserver.c
OBJS = $(SRCS:.c=.o)
HEADERS = sqlids.h

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c $(HEADERS)
	$(CC) $(CFLAGS) -c $<

clean:
	rm -f $(OBJS) $(TARGET)

install: $(TARGET)
	install -m 755 $(TARGET) /usr/local/bin/

uninstall:
	rm -f /usr/local/bin/$(TARGET)

.PHONY: all clean install uninstall
