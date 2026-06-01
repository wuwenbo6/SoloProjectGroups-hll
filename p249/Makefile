CC = gcc
CFLAGS = -Wall -Wextra -O2
LDFLAGS =

TARGET = pcie_server
SRC = pcie_server.c

HAS_PCI = $(shell echo '\#include <pci/pci.h> int main(){return 0;}' | $(CC) -x c - -o /dev/null 2>/dev/null && echo yes || echo no)

ifeq ($(HAS_PCI),yes)
    CFLAGS += -DHAVE_LIBPCI
    LDFLAGS += -lpci
    $(info Found libpci, compiling with real PCI support)
else
    $(info libpci not found, compiling with simulated PCI devices only)
endif

.PHONY: all clean run real

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f $(TARGET)

run: $(TARGET)
	./$(TARGET)

real: $(TARGET)
	sudo ./$(TARGET) -r
