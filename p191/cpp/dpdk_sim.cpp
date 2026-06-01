#include <iostream>
#include <vector>
#include <queue>
#include <random>
#include <thread>
#include <cmath>
#include <string>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <numeric>
#include <cstring>
#include <atomic>
#include <array>
#include <chrono>

#if defined(__x86_64__) || defined(_M_X64)
#include <x86intrin.h>
#endif

#ifdef __APPLE__
#include <sys/sysctl.h>
#include <mach/mach_time.h>
#elif defined(__linux__)
#include <sched.h>
#include <unistd.h>
#endif

struct Packet {
    uint64_t id;
    uint32_t size;
    uint64_t tx_tsc;
    uint64_t rx_tsc;
};

struct VirtualPort {
    std::string name;
    uint64_t received_count;
    uint64_t sent_count;
};

struct SimConfig {
    uint64_t packet_count = 1000;
    uint32_t packet_size = 64;
    std::string forward_mode = "store_forward";
    uint64_t base_latency_ns = 5000;
    uint64_t jitter_ns = 2000;
};

struct HistogramBucket {
    double start;
    double end;
    uint64_t count;
};

struct PercentileResult {
    double p50;
    double p90;
    double p99;
    double p999;
};

static inline uint64_t rdtsc() {
#if defined(__x86_64__) || defined(_M_X64)
    unsigned int aux;
    return __rdtscp(&aux);
#else
    auto t = std::chrono::high_resolution_clock::now();
    return static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(t.time_since_epoch()).count()
    );
#endif
}

static void cpu_relax() {
#if defined(__x86_64__) || defined(_M_X64)
    _mm_pause();
#endif
}

static uint64_t tsc_freq_hz = 0;

static void calibrate_tsc() {
#if defined(__APPLE__) && defined(__x86_64__)
    uint64_t freq = 0;
    size_t size = sizeof(freq);
    sysctlbyname("hw.cpufrequency", &freq, &size, NULL, 0);
    if (freq > 0) {
        tsc_freq_hz = freq;
        return;
    }
#elif defined(__linux__) && defined(__x86_64__)
    FILE* f = fopen("/proc/cpuinfo", "r");
    if (f) {
        char line[256];
        while (fgets(line, sizeof(line), f)) {
            if (strncmp(line, "cpu MHz", 7) == 0) {
                double mhz;
                sscanf(line, "cpu MHz\t: %lf", &mhz);
                tsc_freq_hz = static_cast<uint64_t>(mhz * 1e6);
                fclose(f);
                return;
            }
        }
        fclose(f);
    }
#endif

    uint64_t t0 = rdtsc();
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    uint64_t t1 = rdtsc();
    tsc_freq_hz = (t1 - t0) * 10;
}

static inline double tsc_to_ns(uint64_t tsc) {
    return (static_cast<double>(tsc) * 1e9) / static_cast<double>(tsc_freq_hz);
}

static inline uint64_t ns_to_tsc(uint64_t ns) {
    return static_cast<uint64_t>(static_cast<double>(ns) * static_cast<double>(tsc_freq_hz) / 1e9);
}

static void bind_to_cpu(int cpu_id) {
#if defined(__linux__)
    cpu_set_t cpuset;
    CPU_ZERO(&cpuset);
    CPU_SET(cpu_id, &cpuset);
    sched_setaffinity(0, sizeof(cpu_set_t), &cpuset);
#elif defined(__APPLE__)
#endif
}

template <typename T, size_t Capacity>
class LockFreeSPSCQueue {
public:
    LockFreeSPSCQueue() : write_idx_(0), read_idx_(0) {
        static_assert((Capacity & (Capacity - 1)) == 0,
            "Capacity must be power of two");
    }

    bool push(const T& val) {
        const size_t write_idx = write_idx_.load(std::memory_order_relaxed);
        const size_t next_write_idx = (write_idx + 1) & (Capacity - 1);

        if (next_write_idx == read_idx_.load(std::memory_order_acquire)) {
            return false;
        }

        buffer_[write_idx] = val;
        write_idx_.store(next_write_idx, std::memory_order_release);
        return true;
    }

    bool pop(T& out) {
        const size_t read_idx = read_idx_.load(std::memory_order_relaxed);

        if (read_idx == write_idx_.load(std::memory_order_acquire)) {
            return false;
        }

        out = buffer_[read_idx];
        read_idx_.store((read_idx + 1) & (Capacity - 1), std::memory_order_release);
        return true;
    }

    size_t size_approx() const {
        size_t w = write_idx_.load(std::memory_order_relaxed);
        size_t r = read_idx_.load(std::memory_order_relaxed);
        return (w - r) & (Capacity - 1);
    }

private:
    std::array<T, Capacity> buffer_;
    alignas(64) std::atomic<size_t> write_idx_;
    alignas(64) std::atomic<size_t> read_idx_;
};

static const size_t QUEUE_CAPACITY = 4096;
using PacketQueue = LockFreeSPSCQueue<Packet, QUEUE_CAPACITY>;

static double compute_mean(const std::vector<double>& v) {
    double sum = std::accumulate(v.begin(), v.end(), 0.0);
    return sum / static_cast<double>(v.size());
}

static double compute_stddev(const std::vector<double>& v, double mean) {
    double sq_sum = std::inner_product(v.begin(), v.end(), v.begin(), 0.0);
    return std::sqrt(sq_sum / static_cast<double>(v.size()) - mean * mean);
}

static double compute_percentile(std::vector<double> sorted, double p) {
    if (sorted.empty()) return 0.0;
    double idx = p / 100.0 * (static_cast<double>(sorted.size()) - 1.0);
    size_t lo = static_cast<size_t>(std::floor(idx));
    size_t hi = static_cast<size_t>(std::ceil(idx));
    if (hi >= sorted.size()) hi = sorted.size() - 1;
    double frac = idx - static_cast<double>(lo);
    return sorted[lo] * (1.0 - frac) + sorted[hi] * frac;
}

static std::vector<HistogramBucket> build_histogram(const std::vector<double>& data, int num_buckets = 30) {
    if (data.empty()) return {};
    double min_val = *std::min_element(data.begin(), data.end());
    double max_val = *std::max_element(data.begin(), data.end());
    if (min_val == max_val) {
        max_val = min_val + 1.0;
    }
    double bucket_width = (max_val - min_val) / static_cast<double>(num_buckets);
    std::vector<HistogramBucket> buckets(num_buckets);
    for (int i = 0; i < num_buckets; ++i) {
        buckets[i].start = min_val + static_cast<double>(i) * bucket_width;
        buckets[i].end = min_val + static_cast<double>(i + 1) * bucket_width;
        buckets[i].count = 0;
    }
    for (double val : data) {
        int idx = static_cast<int>((val - min_val) / bucket_width);
        if (idx >= num_buckets) idx = num_buckets - 1;
        if (idx < 0) idx = 0;
        buckets[idx].count++;
    }
    return buckets;
}

static std::string escape_json_str(const std::string& s) {
    std::string out;
    for (char c : s) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c;
        }
    }
    return out;
}

static void busy_wait_ns(uint64_t ns) {
    if (ns == 0) return;
    uint64_t start = rdtsc();
    uint64_t end = start + ns_to_tsc(ns);
    uint64_t spin_count = 0;
    while (rdtsc() < end) {
        if ((++spin_count & 0x3FF) == 0) {
            cpu_relax();
        }
    }
}

int main(int argc, char* argv[]) {
    SimConfig config;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--packet-count" && i + 1 < argc) {
            config.packet_count = std::stoull(argv[++i]);
        } else if (arg == "--packet-size" && i + 1 < argc) {
            config.packet_size = std::stoul(argv[++i]);
        } else if (arg == "--forward-mode" && i + 1 < argc) {
            config.forward_mode = argv[++i];
        } else if (arg == "--base-latency-ns" && i + 1 < argc) {
            config.base_latency_ns = std::stoull(argv[++i]);
        } else if (arg == "--jitter-ns" && i + 1 < argc) {
            config.jitter_ns = std::stoull(argv[++i]);
        }
    }

    calibrate_tsc();

    VirtualPort vport0{"vport0"};
    VirtualPort vport1{"vport1"};

    std::random_device rd;
    std::mt19937_64 gen(rd());
    std::normal_distribution<double> jitter_dist(0.0, static_cast<double>(config.jitter_ns) / 3.0);

    double bandwidth_bps = 10e9;
    double store_forward_extra_ns = 0.0;
    if (config.forward_mode == "store_forward") {
        store_forward_extra_ns = (static_cast<double>(config.packet_size) * 8.0 / bandwidth_bps) * 1e9;
    }

    PacketQueue tx_to_rx_queue;
    PacketQueue result_queue;

    std::atomic<bool> sender_done{false};

    uint64_t sim_start_tsc = rdtsc();

    std::thread sender_thread([&]() {
        bind_to_cpu(0);

        for (uint64_t i = 0; i < config.packet_count; ++i) {
            Packet pkt;
            pkt.id = i;
            pkt.size = config.packet_size;

            pkt.tx_tsc = rdtsc();

            double jitter_ns = jitter_dist(gen);
            if (jitter_ns < 0) jitter_ns = -jitter_ns;
            uint64_t total_delay_ns = config.base_latency_ns + static_cast<uint64_t>(jitter_ns);
            total_delay_ns += static_cast<uint64_t>(store_forward_extra_ns);

            busy_wait_ns(total_delay_ns);

            while (!tx_to_rx_queue.push(pkt)) {
                cpu_relax();
            }

            vport0.sent_count++;
        }

        sender_done.store(true, std::memory_order_release);
    });

    std::thread receiver_thread([&]() {
        bind_to_cpu(1);

        uint64_t received = 0;

        while (received < config.packet_count) {
            Packet pkt;

            if (tx_to_rx_queue.pop(pkt)) {
                pkt.rx_tsc = rdtsc();

                while (!result_queue.push(pkt)) {
                    cpu_relax();
                }

                vport1.received_count++;
                vport1.sent_count++;
                received++;
            } else {
                if (sender_done.load(std::memory_order_acquire)) {
                    if (tx_to_rx_queue.pop(pkt)) {
                        pkt.rx_tsc = rdtsc();

                        while (!result_queue.push(pkt)) {
                            cpu_relax();
                        }

                        vport1.received_count++;
                        vport1.sent_count++;
                        received++;
                    } else {
                        break;
                    }
                } else {
                    cpu_relax();
                }
            }
        }
    });

    sender_thread.join();
    receiver_thread.join();

    uint64_t sim_end_tsc = rdtsc();
    double total_time_s = tsc_to_ns(sim_end_tsc - sim_start_tsc) / 1e9;

    std::vector<double> latencies_ns;
    latencies_ns.reserve(config.packet_count);

    Packet pkt;
    while (result_queue.pop(pkt)) {
        uint64_t latency_tsc = pkt.rx_tsc - pkt.tx_tsc;
        latencies_ns.push_back(tsc_to_ns(latency_tsc));
    }

    std::sort(latencies_ns.begin(), latencies_ns.end());

    double mean = compute_mean(latencies_ns);
    double stddev = compute_stddev(latencies_ns, mean);
    double min_lat = latencies_ns.front();
    double max_lat = latencies_ns.back();

    PercentileResult pct;
    pct.p50 = compute_percentile(latencies_ns, 50.0);
    pct.p90 = compute_percentile(latencies_ns, 90.0);
    pct.p99 = compute_percentile(latencies_ns, 99.0);
    pct.p999 = compute_percentile(latencies_ns, 99.9);

    std::vector<HistogramBucket> buckets = build_histogram(latencies_ns, 30);

    double throughput_pps = static_cast<double>(config.packet_count) / total_time_s;

    std::cout << std::fixed << std::setprecision(2);
    std::cout << "{";
    std::cout << "\"testId\":\"sim_" << sim_start_tsc << "\",";
    std::cout << "\"tscFreqHz\":" << tsc_freq_hz << ",";
    std::cout << "\"config\":{";
    std::cout << "\"packetCount\":" << config.packet_count << ",";
    std::cout << "\"packetSize\":" << config.packet_size << ",";
    std::cout << "\"forwardMode\":\"" << escape_json_str(config.forward_mode) << "\",";
    std::cout << "\"baseLatencyNs\":" << config.base_latency_ns << ",";
    std::cout << "\"jitterNs\":" << config.jitter_ns;
    std::cout << "},";
    std::cout << "\"stats\":{";
    std::cout << "\"count\":" << config.packet_count << ",";
    std::cout << "\"mean\":" << mean << ",";
    std::cout << "\"min\":" << min_lat << ",";
    std::cout << "\"max\":" << max_lat << ",";
    std::cout << "\"p50\":" << pct.p50 << ",";
    std::cout << "\"p90\":" << pct.p90 << ",";
    std::cout << "\"p99\":" << pct.p99 << ",";
    std::cout << "\"p999\":" << pct.p999 << ",";
    std::cout << "\"stddev\":" << stddev;
    std::cout << "},";
    std::cout << "\"portStats\":{";
    std::cout << "\"vport0\":{";
    std::cout << "\"received\":0,";
    std::cout << "\"sent\":" << vport0.sent_count;
    std::cout << "},";
    std::cout << "\"vport1\":{";
    std::cout << "\"received\":" << vport1.received_count << ",";
    std::cout << "\"sent\":" << vport1.sent_count;
    std::cout << "}";
    std::cout << "},";
    std::cout << "\"throughputPps\":" << throughput_pps << ",";
    std::cout << "\"totalTimeS\":" << total_time_s << ",";
    std::cout << "\"histogram\":{";
    std::cout << "\"buckets\":[";
    for (size_t i = 0; i < buckets.size(); ++i) {
        std::cout << "{";
        std::cout << "\"start\":" << buckets[i].start << ",";
        std::cout << "\"end\":" << buckets[i].end << ",";
        std::cout << "\"count\":" << buckets[i].count;
        std::cout << "}";
        if (i + 1 < buckets.size()) std::cout << ",";
    }
    std::cout << "]";
    std::cout << "},";
    std::cout << "\"latencies\":[";
    size_t sample_step = 1;
    if (latencies_ns.size() > 5000) sample_step = latencies_ns.size() / 5000;
    bool first = true;
    for (size_t i = 0; i < latencies_ns.size(); i += sample_step) {
        if (!first) std::cout << ",";
        std::cout << latencies_ns[i];
        first = false;
    }
    std::cout << "]";
    std::cout << "}" << std::endl;

    return 0;
}
