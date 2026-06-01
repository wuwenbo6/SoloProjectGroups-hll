CC ?= gcc
CFLAGS ?= -O2 -Wall -Wextra

all: pci-helper

pci-helper: pci-helper.c
	$(CC) $(CFLAGS) -o $@ $<

install-root: pci-helper
	chown root:root pci-helper
	chmod 4755 pci-helper

clean:
	rm -f pci-helper

.PHONY: all clean install-root
