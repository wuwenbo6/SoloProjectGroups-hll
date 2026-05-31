# NTP Server (Rust + Tokio)

A high-performance NTPv4 server implementation with hardware timestamping support.

## Features

- **NTPv4 Protocol**: Full support for NTP version 4
- **Hardware Timestamping**: Linux SO_TIMESTAMPING support for nanosecond-precision timestamps
- **Multiple Modes**:
  - Symmetric mode (client/server)
  - Broadcast mode
- **Monitoring**: Real-time offset and delay monitoring
- **Statistics**: Detailed per-client and global statistics
- **CLI Client**: Feature-rich command-line client for testing
- **Async Runtime**: Built on Tokio for high performance

## Building

```bash
cargo build --release
```

## Server Usage

### Basic Server

```bash
# Start server on default port 123 (requires root)
sudo ./target/release/ntpd
```

### With Hardware Timestamping (Linux only)

```bash
sudo ./target/release/ntpd --hardware-timestamping
```

### Broadcast Mode

```bash
# Broadcast to 255.255.255.255 every 64 seconds
sudo ./target/release/ntpd --mode broadcast --broadcast 255.255.255.255:123
```

### Both Modes with Monitoring

```bash
sudo ./target/release/ntpd --mode both --broadcast 192.168.1.255:123 --monitor
```

### Full Options

```bash
ntpd --help

NTPv4 Server with hardware timestamping

Usage: ntpd [OPTIONS]

Options:
      --listen <LISTEN>                  [default: 0.0.0.0:123]
      --broadcast <BROADCAST>            
      --broadcast-interval <BROADCAST_INTERVAL>  [default: 64]
      --hardware-timestamping            
      --mode <MODE>                      [default: symmetric] [possible values: symmetric, broadcast, both]
      --log-level <LOG_LEVEL>            [default: info]
      --monitor                            
      --monitor-interval <MONITOR_INTERVAL>  [default: 60]
  -h, --help                             Print help
  -V, --version                          Print version
```

## CLI Client Usage

### Basic Query

```bash
# Query pool.ntp.org
./target/release/ntp-cli query --server pool.ntp.org

# Query local server with 5 samples
./target/release/ntp-cli query --server localhost --count 5
```

### Monitor Mode

```bash
# Monitor for 10 samples
./target/release/ntp-cli monitor --server localhost --samples 10
```

### Benchmark

```bash
# Benchmark with 1000 requests, 10 concurrent
./target/release/ntp-cli benchmark --server localhost --requests 1000 --concurrency 10
```

### JSON Output

```bash
./target/release/ntp-cli query --server localhost --json
```

## Project Structure

```
src/
├── main.rs          # Server entry point
├── cli.rs           # CLI client entry point
├── lib.rs           # Library exports
├── protocol.rs      # NTPv4 protocol definitions
├── timestamping.rs  # Hardware timestamping (Linux SO_TIMESTAMPING)
├── server.rs        # Server core logic
├── stats.rs         # Statistics management
└── monitor.rs       # Monitoring system
```

## Protocol Implementation

### NTP Packet Format

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|LI | VN  |Mode |    Stratum    |     Poll      |   Precision   |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Root Delay                            |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                      Root Dispersion                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Reference Identifier                      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                     Reference Timestamp                       |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                      Originate Timestamp                      |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                       Receive Timestamp                       |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                                                               |
|                      Transmit Timestamp                       |
|                                                               |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

### Time Calculations

- **Offset**: `((T2 - T1) + (T3 - T4)) / 2`
- **Delay**: `(T4 - T1) - (T3 - T2)`

Where:
- T1: Client transmit timestamp
- T2: Server receive timestamp
- T3: Server transmit timestamp
- T4: Client receive timestamp

## Hardware Timestamping

Requires Linux kernel with `SO_TIMESTAMPING` support. Enable with:

```bash
sudo ethtool -K eth0 tx-hw-timestamp on rx-hw-timestamp on
```

## Requirements

- Linux (for hardware timestamping)
- Rust 1.70+
- Root privileges (for port 123)

## License

MIT
