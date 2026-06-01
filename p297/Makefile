CXX = clang++
CXXFLAGS = -std=c++17 -Wall -Wextra -O2 -Isrc
LDFLAGS = -lpthread

TARGET = user_tcpip_stack
SRCDIR = src
BUILDDIR = build

SRCS = $(shell find $(SRCDIR) -name "*.cpp")
OBJS = $(patsubst $(SRCDIR)/%.cpp,$(BUILDDIR)/%.o,$(SRCS))

$(shell mkdir -p $(BUILDDIR))

$(TARGET): $(OBJS)
	$(CXX) $(OBJS) -o $@ $(LDFLAGS)

$(BUILDDIR)/%.o: $(SRCDIR)/%.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -rf $(BUILDDIR) $(TARGET)

run: $(TARGET)
	./$(TARGET)

.PHONY: clean run
