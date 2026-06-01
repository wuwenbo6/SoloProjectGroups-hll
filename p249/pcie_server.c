#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <inttypes.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <sys/mman.h>
#include <fcntl.h>
#include <errno.h>
#include <ctype.h>

#ifdef HAVE_LIBPCI
#include <pci/pci.h>
#else
struct pci_dev {
    uint16_t vendor_id;
    uint16_t device_id;
    uint8_t bus;
    uint8_t dev;
    uint8_t func;
    struct pci_dev *next;
};

struct pci_access {
    struct pci_dev *devices;
};

#define PCI_FILL_IDENT 1
#define PCI_FILL_BASES 2
#define PCI_FILL_SIZES 4

static struct pci_access *pci_alloc(void) __attribute__((unused));
static struct pci_access *pci_alloc(void) { return calloc(1, sizeof(struct pci_access)); }
static void pci_init(struct pci_access *a) __attribute__((unused));
static void pci_init(struct pci_access *a) { (void)a; }
static void pci_scan_bus(struct pci_access *a) __attribute__((unused));
static void pci_scan_bus(struct pci_access *a) { (void)a; }
static void pci_fill_info(struct pci_dev *d, int flags) __attribute__((unused));
static void pci_fill_info(struct pci_dev *d, int flags) { (void)d; (void)flags; }
static uint32_t pci_read_long(struct pci_dev *d, int reg) __attribute__((unused));
static uint32_t pci_read_long(struct pci_dev *d, int reg) { (void)d; (void)reg; return 0; }
static void pci_write_long(struct pci_dev *d, int reg, uint32_t val) __attribute__((unused));
static void pci_write_long(struct pci_dev *d, int reg, uint32_t val) { (void)d; (void)reg; (void)val; }
static void pci_cleanup(struct pci_access *a) __attribute__((unused));
static void pci_cleanup(struct pci_access *a) { free(a); }
#endif

#define PORT 8080
#define BUFFER_SIZE 4096
#define MAX_BARS 6
#define MAX_DEVICES 256
#define MAX_BAR_SIZE (1024 * 1024 * 256)

typedef struct {
    uint64_t base_addr;
    uint64_t size;
    int is_io;
    int is_64bit;
    int is_prefetchable;
    int is_valid;
    void *mmap_ptr;
    uint32_t *sim_mem;
} bar_info_t;

typedef struct {
    uint16_t vendor_id;
    uint16_t device_id;
    uint8_t bus;
    uint8_t dev;
    uint8_t func;
    bar_info_t bars[MAX_BARS];
} pci_device_t;

static pci_device_t devices[MAX_DEVICES];
static int device_count = 0;
static struct pci_access *pacc = NULL;
static int selected_device = -1;
static int selected_bar = -1;
static int use_simulation = 1;

void print_hex(const char *label, const uint8_t *data, int len) {
    printf("%s: ", label);
    for (int i = 0; i < len; i++) {
        printf("%02x ", data[i]);
    }
    printf("\n");
}

void get_bar_info(struct pci_dev *dev, int bar_num, uint64_t *out_addr, uint64_t *out_size, int *out_is_64bit, int *out_is_io, int *out_is_prefetchable) {
    uint32_t lo = pci_read_long(dev, 0x10 + bar_num * 4);
    *out_is_io = (lo & 1) ? 1 : 0;
    *out_is_prefetchable = (lo & 0x8) ? 1 : 0;
    *out_is_64bit = 0;
    
    if (!*out_is_io && (lo & 0x4)) {
        *out_is_64bit = 1;
    }
    
    uint64_t base = 0;
    uint64_t size = 0;
    
    if (*out_is_64bit && bar_num + 1 < MAX_BARS) {
        uint32_t hi = pci_read_long(dev, 0x10 + (bar_num + 1) * 4);
        base = ((uint64_t)hi << 32) | (lo & ~0xfULL);
        
        uint32_t orig_lo = lo;
        uint32_t orig_hi = hi;
        pci_write_long(dev, 0x10 + bar_num * 4, 0xffffffff);
        pci_write_long(dev, 0x10 + (bar_num + 1) * 4, 0xffffffff);
        uint32_t size_lo = pci_read_long(dev, 0x10 + bar_num * 4);
        uint32_t size_hi = pci_read_long(dev, 0x10 + (bar_num + 1) * 4);
        pci_write_long(dev, 0x10 + bar_num * 4, orig_lo);
        pci_write_long(dev, 0x10 + (bar_num + 1) * 4, orig_hi);
        
        uint64_t size_reg = ((uint64_t)size_hi << 32) | (size_lo & ~0xfULL);
        if (size_reg != 0) {
            size = ~size_reg + 1;
        }
    } else {
        base = lo & ~0xfULL;
        
        pci_write_long(dev, 0x10 + bar_num * 4, 0xffffffff);
        uint32_t size_reg = pci_read_long(dev, 0x10 + bar_num * 4);
        pci_write_long(dev, 0x10 + bar_num * 4, lo);
        
        if (size_reg != 0 && size_reg != 0xffffffff) {
            uint32_t mask = *out_is_io ? ~0x3u : ~0xfu;
            size = ~((uint64_t)(size_reg & mask)) + 1;
        }
    }
    
    *out_addr = base;
    *out_size = size;
}

void scan_pci_devices(void) {
    struct pci_dev *dev;
    device_count = 0;
    
#ifdef HAVE_LIBPCI
    pacc = pci_alloc();
    pci_init(pacc);
    pacc->method = PCI_ACCESS_AUTO;
    pci_scan_bus(pacc);
    
    printf("Scanning all PCI buses (including all functions)...\n\n");
    
    for (dev = pacc->devices; dev && device_count < MAX_DEVICES; dev = dev->next) {
        pci_fill_info(dev, PCI_FILL_IDENT | PCI_FILL_BASES | PCI_FILL_SIZES);
        
        pci_device_t *pci_dev = &devices[device_count];
        pci_dev->vendor_id = dev->vendor_id;
        pci_dev->device_id = dev->device_id;
        pci_dev->bus = dev->bus;
        pci_dev->dev = dev->dev;
        pci_dev->func = dev->func;
        memset(pci_dev->bars, 0, sizeof(pci_dev->bars));
        
        printf("Found PCI device: %04x:%04x (Bus %02x, Dev %02x, Func %02x)\n",
               dev->vendor_id, dev->device_id, dev->bus, dev->dev, dev->func);
        
        for (int i = 0; i < MAX_BARS; i++) {
            if (i > 0 && pci_dev->bars[i - 1].is_64bit) {
                continue;
            }
            
            uint64_t addr, sz;
            int is_64bit, is_io, is_pf;
            get_bar_info(dev, i, &addr, &sz, &is_64bit, &is_io, &is_pf);
            
            bar_info_t *bar = &pci_dev->bars[i];
            bar->base_addr = addr;
            bar->size = sz;
            bar->is_io = is_io;
            bar->is_64bit = is_64bit;
            bar->is_prefetchable = is_pf;
            bar->is_valid = (sz > 0 && addr != 0) ? 1 : 0;
            bar->mmap_ptr = NULL;
            bar->sim_mem = NULL;
            
            if (bar->is_valid) {
                printf("  BAR%d: addr=0x%016llx, size=0x%016llx (%llu bytes), %s, %s%s\n",
                       i, (unsigned long long)bar->base_addr, (unsigned long long)bar->size, (unsigned long long)bar->size,
                       bar->is_io ? "IO" : "MMIO",
                       bar->is_64bit ? "64-bit, " : "32-bit, ",
                       bar->is_prefetchable ? "prefetchable" : "non-prefetchable");
                
                if (use_simulation && !bar->is_io && bar->size > 0) {
                    uint64_t alloc_size = bar->size;
                    if (alloc_size > MAX_BAR_SIZE) {
                        alloc_size = MAX_BAR_SIZE;
                    }
                    bar->sim_mem = malloc((size_t)alloc_size);
                    if (bar->sim_mem) {
                        for (uint32_t j = 0; j < alloc_size / 4; j++) {
                            bar->sim_mem[j] = (uint32_t)(j * 0x11223344 + i * 0x100);
                        }
                        printf("    Simulated memory allocated, filled with test pattern\n");
                    }
                }
            }
        }
        device_count++;
    }
#else
    printf("Note: Compiled without libpci. Using simulated PCI devices.\n\n");
    
    #define SIM_DEV_COUNT 5
    static struct pci_dev sim_devices[SIM_DEV_COUNT];
    static struct pci_access sim_acc;
    
    sim_devices[0].vendor_id = 0x8086;
    sim_devices[0].device_id = 0x1234;
    sim_devices[0].bus = 0x00;
    sim_devices[0].dev = 0x02;
    sim_devices[0].func = 0x00;
    sim_devices[0].next = &sim_devices[1];
    
    sim_devices[1].vendor_id = 0x10de;
    sim_devices[1].device_id = 0x5678;
    sim_devices[1].bus = 0x01;
    sim_devices[1].dev = 0x00;
    sim_devices[1].func = 0x00;
    sim_devices[1].next = &sim_devices[2];
    
    sim_devices[2].vendor_id = 0x10de;
    sim_devices[2].device_id = 0x5679;
    sim_devices[2].bus = 0x01;
    sim_devices[2].dev = 0x00;
    sim_devices[2].func = 0x01;
    sim_devices[2].next = &sim_devices[3];
    
    sim_devices[3].vendor_id = 0x1af4;
    sim_devices[3].device_id = 0x1000;
    sim_devices[3].bus = 0x02;
    sim_devices[3].dev = 0x01;
    sim_devices[3].func = 0x00;
    sim_devices[3].next = &sim_devices[4];
    
    sim_devices[4].vendor_id = 0x1af4;
    sim_devices[4].device_id = 0x1001;
    sim_devices[4].bus = 0x02;
    sim_devices[4].dev = 0x01;
    sim_devices[4].func = 0x01;
    sim_devices[4].next = NULL;
    
    sim_acc.devices = &sim_devices[0];
    pacc = &sim_acc;
    
    uint64_t sim_bars[SIM_DEV_COUNT][MAX_BARS][2] = {
        {{0xe0000000ULL, 256 * 1024 * 1024}, {0x1d0000000ULL, 512 * 1024 * 1024}, {0, 0}, {0, 0}, {0, 0}, {0, 0}},
        {{0xf0000000ULL, 64 * 1024 * 1024}, {0x2f4000000ULL, 256 * 1024 * 1024}, {0xf8000000ULL, 16 * 1024 * 1024}, {0, 0}, {0, 0}, {0, 0}},
        {{0xfb000000ULL, 8 * 1024 * 1024}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}},
        {{0xfa000000ULL, 4 * 1024 * 1024}, {0xfa400000ULL, 1 * 1024 * 1024}, {0, 0}, {0, 0}, {0, 0}, {0, 0}},
        {{0xfc000000ULL, 2 * 1024 * 1024}, {0, 0}, {0, 0}, {0, 0}, {0, 0}, {0, 0}}
    };
    int sim_64bit[SIM_DEV_COUNT][MAX_BARS] = {
        {0, 1, 0, 0, 0, 0},
        {0, 1, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0}
    };
    int sim_io[SIM_DEV_COUNT][MAX_BARS] = {
        {0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0},
        {0, 0, 0, 0, 0, 0},
        {1, 0, 0, 0, 0, 0}
    };
    
    for (int d = 0; d < SIM_DEV_COUNT && device_count < MAX_DEVICES; d++) {
        dev = &sim_devices[d];
        
        pci_device_t *pci_dev = &devices[device_count];
        pci_dev->vendor_id = dev->vendor_id;
        pci_dev->device_id = dev->device_id;
        pci_dev->bus = dev->bus;
        pci_dev->dev = dev->dev;
        pci_dev->func = dev->func;
        
        printf("Found PCI device: %04x:%04x (Bus %02x, Dev %02x, Func %02x)\n",
               dev->vendor_id, dev->device_id, dev->bus, dev->dev, dev->func);
        
        for (int i = 0; i < MAX_BARS; i++) {
            uint64_t bar_val = sim_bars[d][i][0];
            uint64_t size = sim_bars[d][i][1];
            
            bar_info_t *bar = &pci_dev->bars[i];
            bar->base_addr = bar_val;
            bar->size = size;
            bar->is_io = sim_io[d][i];
            bar->is_64bit = sim_64bit[d][i];
            bar->is_prefetchable = (!sim_io[d][i] && i < 2) ? 1 : 0;
            bar->is_valid = (size > 0) ? 1 : 0;
            bar->mmap_ptr = NULL;
            bar->sim_mem = NULL;
            
            if (bar->is_valid) {
                printf("  BAR%d: addr=0x%016llx, size=0x%016llx (%llu bytes), %s, %s%s\n",
                       i, (unsigned long long)bar->base_addr, (unsigned long long)bar->size, (unsigned long long)bar->size,
                       bar->is_io ? "IO" : "MMIO",
                       bar->is_64bit ? "64-bit, " : "32-bit, ",
                       bar->is_prefetchable ? "prefetchable" : "non-prefetchable");
                
                if (use_simulation && !bar->is_io && bar->size > 0) {
                    uint64_t alloc_size = bar->size;
                    if (alloc_size > MAX_BAR_SIZE) {
                        alloc_size = MAX_BAR_SIZE;
                    }
                    bar->sim_mem = malloc((size_t)alloc_size);
                    if (bar->sim_mem) {
                        for (uint32_t j = 0; j < alloc_size / 4; j++) {
                            bar->sim_mem[j] = (uint32_t)(j * 0x11223344 + i * 0x100 + d * 0x1000);
                        }
                        printf("    Simulated memory allocated, filled with test pattern\n");
                    }
                }
            }
        }
        device_count++;
    }
    
    use_simulation = 1;
#endif
    
    printf("\nTotal PCI devices found: %d\n", device_count);
}

int map_bar_memory(pci_device_t *pci_dev, int bar_idx) {
    if (use_simulation) {
        return 0;
    }
    
    bar_info_t *bar = &pci_dev->bars[bar_idx];
    if (!bar->is_valid || bar->is_io) {
        return -1;
    }
    
    int fd = open("/dev/mem", O_RDWR | O_SYNC);
    if (fd < 0) {
        perror("open /dev/mem failed");
        return -1;
    }
    
    bar->mmap_ptr = mmap(NULL, (size_t)bar->size, PROT_READ | PROT_WRITE, MAP_SHARED, fd, (off_t)bar->base_addr);
    close(fd);
    
    if (bar->mmap_ptr == MAP_FAILED) {
        perror("mmap failed");
        bar->mmap_ptr = NULL;
        return -1;
    }
    
    printf("Successfully mapped BAR%d at 0x%016llx, size 0x%016llx\n", bar_idx, (unsigned long long)bar->base_addr, (unsigned long long)bar->size);
    return 0;
}

void unmap_bar_memory(pci_device_t *pci_dev, int bar_idx) {
    bar_info_t *bar = &pci_dev->bars[bar_idx];
    if (bar->mmap_ptr && !use_simulation) {
        munmap(bar->mmap_ptr, (size_t)bar->size);
        bar->mmap_ptr = NULL;
    }
}

uint32_t read_bar_dword(pci_device_t *pci_dev, int bar_idx, uint64_t offset) {
    bar_info_t *bar = &pci_dev->bars[bar_idx];
    if (!bar->is_valid) {
        return 0xffffffff;
    }
    
    if (offset >= bar->size) {
        printf("Offset 0x%016llx out of range (size 0x%016llx)\n", (unsigned long long)offset, (unsigned long long)bar->size);
        return 0xffffffff;
    }
    
    if (offset % 4 != 0) {
        printf("Offset 0x%016llx not aligned to 4 bytes\n", (unsigned long long)offset);
        return 0xffffffff;
    }
    
    if (use_simulation) {
        if (bar->sim_mem) {
            uint32_t val = bar->sim_mem[offset / 4];
            printf("Read SIM BAR%d[0x%016llx] = 0x%08x\n", bar_idx, (unsigned long long)offset, val);
            return val;
        }
        return 0xffffffff;
    } else {
        if (bar->mmap_ptr) {
            volatile uint32_t *ptr = (volatile uint32_t *)((char *)bar->mmap_ptr + offset);
            uint32_t val = *ptr;
            printf("Read MMIO BAR%d[0x%016llx] = 0x%08x\n", bar_idx, (unsigned long long)offset, val);
            return val;
        }
        return 0xffffffff;
    }
}

int write_bar_dword(pci_device_t *pci_dev, int bar_idx, uint64_t offset, uint32_t value) {
    bar_info_t *bar = &pci_dev->bars[bar_idx];
    if (!bar->is_valid) {
        return -1;
    }
    
    if (offset % 4 != 0) {
        printf("Write rejected: offset 0x%016llx not DWORD-aligned (must be multiple of 4)\n", (unsigned long long)offset);
        return -1;
    }
    
    if (offset >= bar->size) {
        printf("Offset 0x%016llx out of range (size 0x%016llx)\n", (unsigned long long)offset, (unsigned long long)bar->size);
        return -1;
    }
    
    if (use_simulation) {
        if (bar->sim_mem) {
            bar->sim_mem[offset / 4] = value;
            printf("Write SIM BAR%d[0x%016llx] = 0x%08x\n", bar_idx, (unsigned long long)offset, value);
            return 0;
        }
        return -1;
    } else {
        if (bar->mmap_ptr) {
            volatile uint32_t *ptr = (volatile uint32_t *)((char *)bar->mmap_ptr + offset);
            *ptr = value;
            printf("Write MMIO BAR%d[0x%016llx] = 0x%08x\n", bar_idx, (unsigned long long)offset, value);
            return 0;
        }
        return -1;
    }
}

void send_response(int client_fd, const char *content_type, const char *body) {
    char header[BUFFER_SIZE];
    snprintf(header, sizeof(header),
             "HTTP/1.1 200 OK\r\n"
             "Content-Type: %s\r\n"
             "Content-Length: %zu\r\n"
             "Access-Control-Allow-Origin: *\r\n"
             "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n"
             "Access-Control-Allow-Headers: Content-Type\r\n"
             "Connection: close\r\n"
             "\r\n",
             content_type, strlen(body));
    
    send(client_fd, header, strlen(header), 0);
    send(client_fd, body, strlen(body), 0);
}

void send_json_response(int client_fd, const char *json) {
    send_response(client_fd, "application/json", json);
}

int get_query_param(const char *query, const char *key, char *buf, int buf_size) {
    char *start = strstr(query, key);
    if (!start || buf == NULL || buf_size <= 0) return -1;
    
    if (start > query && *(start - 1) != '&') {
        char *next_start = strstr(start + 1, key);
        if (next_start) start = next_start;
    }
    
    start += strlen(key);
    if (*start != '=') return -1;
    start++;
    
    char *end = strchr(start, '&');
    if (!end) end = start + strlen(start);
    
    int len = end - start;
    if (len >= buf_size) len = buf_size - 1;
    strncpy(buf, start, len);
    buf[len] = '\0';
    
    for (int i = 0; i < len; i++) {
        if (buf[i] == '+') buf[i] = ' ';
    }
    
    return len;
}

void handle_get_devices(int client_fd) {
    char json[8192];
    int pos = 0;
    
    pos += snprintf(json + pos, sizeof(json) - pos, "[");
    
    for (int i = 0; i < device_count; i++) {
        if (i > 0) pos += snprintf(json + pos, sizeof(json) - pos, ",");
        
        pci_device_t *dev = &devices[i];
        pos += snprintf(json + pos, sizeof(json) - pos,
            "{"
            "\"id\":%d,"
            "\"vendor_id\":\"0x%04x\","
            "\"device_id\":\"0x%04x\","
            "\"bus\":\"0x%02x\","
            "\"dev\":\"0x%02x\","
            "\"func\":\"0x%02x\","
            "\"bars\":[",
            i, dev->vendor_id, dev->device_id, dev->bus, dev->dev, dev->func);
        
        for (int j = 0; j < MAX_BARS; j++) {
            if (j > 0) pos += snprintf(json + pos, sizeof(json) - pos, ",");
            
            bar_info_t *bar = &dev->bars[j];
            pos += snprintf(json + pos, sizeof(json) - pos,
                "{"
                "\"index\":%d,"
                "\"valid\":%s,"
                "\"base_addr\":\"0x%016llx\","
                "\"size\":\"0x%016llx\","
                "\"size_bytes\":%llu,"
                "\"type\":\"%s\","
                "\"is_64bit\":%s,"
                "\"prefetchable\":%s"
                "}",
                j,
                bar->is_valid ? "true" : "false",
                (unsigned long long)bar->base_addr,
                (unsigned long long)bar->size,
                (unsigned long long)bar->size,
                bar->is_io ? "IO" : "MMIO",
                bar->is_64bit ? "true" : "false",
                bar->is_prefetchable ? "true" : "false");
        }
        
        pos += snprintf(json + pos, sizeof(json) - pos, "]}");
    }
    
    pos += snprintf(json + pos, sizeof(json) - pos, "]");
    
    send_json_response(client_fd, json);
}

void handle_select_device(int client_fd, const char *query) {
    char dev_id_str[32], bar_str[32];
    
    if (get_query_param(query, "device", dev_id_str, sizeof(dev_id_str)) < 0 ||
        get_query_param(query, "bar", bar_str, sizeof(bar_str)) < 0) {
        send_json_response(client_fd, "{\"error\":\"Missing device or bar parameter\"}");
        return;
    }
    
    int dev_id = atoi(dev_id_str);
    int bar_idx = atoi(bar_str);
    
    if (dev_id < 0 || dev_id >= device_count) {
        send_json_response(client_fd, "{\"error\":\"Invalid device ID\"}");
        return;
    }
    
    if (bar_idx < 0 || bar_idx >= MAX_BARS) {
        send_json_response(client_fd, "{\"error\":\"Invalid BAR index\"}");
        return;
    }
    
    if (!devices[dev_id].bars[bar_idx].is_valid) {
        send_json_response(client_fd, "{\"error\":\"Selected BAR is not valid\"}");
        return;
    }
    
    if (selected_device >= 0 && selected_bar >= 0) {
        unmap_bar_memory(&devices[selected_device], selected_bar);
    }
    
    selected_device = dev_id;
    selected_bar = bar_idx;
    
    if (!use_simulation) {
        if (map_bar_memory(&devices[selected_device], selected_bar) < 0) {
            send_json_response(client_fd, "{\"error\":\"Failed to map BAR memory\"}");
            selected_device = -1;
            selected_bar = -1;
            return;
        }
    }
    
    char json[512];
    snprintf(json, sizeof(json),
        "{"
        "\"success\":true,"
        "\"device\":%d,"
        "\"bar\":%d,"
        "\"base_addr\":\"0x%016llx\","
        "\"size\":\"0x%016llx\","
        "\"size_bytes\":%llu,"
        "\"is_64bit\":%s,"
        "\"simulation\":%s"
        "}",
        selected_device, selected_bar,
        (unsigned long long)devices[selected_device].bars[selected_bar].base_addr,
        (unsigned long long)devices[selected_device].bars[selected_bar].size,
        (unsigned long long)devices[selected_device].bars[selected_bar].size,
        devices[selected_device].bars[selected_bar].is_64bit ? "true" : "false",
        use_simulation ? "true" : "false");
    
    send_json_response(client_fd, json);
}

void handle_read(int client_fd, const char *query) {
    if (selected_device < 0 || selected_bar < 0) {
        send_json_response(client_fd, "{\"error\":\"No device/bar selected\"}");
        return;
    }
    
    char offset_str[32];
    if (get_query_param(query, "offset", offset_str, sizeof(offset_str)) < 0) {
        send_json_response(client_fd, "{\"error\":\"Missing offset parameter\"}");
        return;
    }
    
    uint64_t offset;
    if (strstr(offset_str, "0x") || strstr(offset_str, "0X")) {
        offset = strtoull(offset_str, NULL, 16);
    } else {
        offset = strtoull(offset_str, NULL, 10);
    }
    
    if (offset % 4 != 0) {
        char err[256];
        snprintf(err, sizeof(err), "{\"error\":\"Offset not DWORD-aligned (offset=0x%016llx, must be multiple of 4)\"}", (unsigned long long)offset);
        send_json_response(client_fd, err);
        return;
    }
    
    uint32_t value = read_bar_dword(&devices[selected_device], selected_bar, offset);
    
    char json[256];
    snprintf(json, sizeof(json),
        "{"
        "\"success\":true,"
        "\"offset\":\"0x%016llx\","
        "\"value\":\"0x%08x\","
        "\"value_unsigned\":%u,"
        "\"value_signed\":%d"
        "}",
        (unsigned long long)offset, value, value, (int32_t)value);
    
    send_json_response(client_fd, json);
}

void handle_write(int client_fd, const char *query) {
    if (selected_device < 0 || selected_bar < 0) {
        send_json_response(client_fd, "{\"error\":\"No device/bar selected\"}");
        return;
    }
    
    char offset_str[32], value_str[32];
    
    if (get_query_param(query, "offset", offset_str, sizeof(offset_str)) < 0 ||
        get_query_param(query, "value", value_str, sizeof(value_str)) < 0) {
        send_json_response(client_fd, "{\"error\":\"Missing offset or value parameter\"}");
        return;
    }
    
    uint64_t offset;
    if (strstr(offset_str, "0x") || strstr(offset_str, "0X")) {
        offset = strtoull(offset_str, NULL, 16);
    } else {
        offset = strtoull(offset_str, NULL, 10);
    }
    
    uint32_t value;
    if (strstr(value_str, "0x") || strstr(value_str, "0X")) {
        value = strtoul(value_str, NULL, 16);
    } else {
        value = strtoul(value_str, NULL, 10);
    }
    
    if (offset % 4 != 0) {
        char err[256];
        snprintf(err, sizeof(err), "{\"error\":\"Write rejected: offset not DWORD-aligned (offset=0x%016llx, must be multiple of 4)\"}", (unsigned long long)offset);
        send_json_response(client_fd, err);
        return;
    }
    
    int result = write_bar_dword(&devices[selected_device], selected_bar, offset, value);
    
    if (result < 0) {
        send_json_response(client_fd, "{\"error\":\"Write failed\"}");
        return;
    }
    
    char json[256];
    snprintf(json, sizeof(json),
        "{"
        "\"success\":true,"
        "\"offset\":\"0x%016llx\","
        "\"value\":\"0x%08x\""
        "}",
        (unsigned long long)offset, value);
    
    send_json_response(client_fd, json);
}

void handle_get_info(int client_fd) {
    char json[512];
    if (selected_device >= 0 && selected_bar >= 0) {
        pci_device_t *dev = &devices[selected_device];
        bar_info_t *bar = &dev->bars[selected_bar];
        snprintf(json, sizeof(json),
            "{"
            "\"selected\":true,"
            "\"device\":%d,"
            "\"bar\":%d,"
            "\"vendor_id\":\"0x%04x\","
            "\"device_id\":\"0x%04x\","
            "\"base_addr\":\"0x%016llx\","
            "\"size\":\"0x%016llx\","
            "\"size_bytes\":%llu,"
            "\"is_64bit\":%s,"
            "\"simulation\":%s"
            "}",
            selected_device, selected_bar,
            dev->vendor_id, dev->device_id,
            (unsigned long long)bar->base_addr, (unsigned long long)bar->size, (unsigned long long)bar->size,
            bar->is_64bit ? "true" : "false",
            use_simulation ? "true" : "false");
    } else {
        snprintf(json, sizeof(json), "{\"selected\":false}");
    }
    send_json_response(client_fd, json);
}

void handle_barmap(int client_fd) {
    char *json = malloc(65536);
    if (!json) {
        send_json_response(client_fd, "{\"error\":\"Out of memory\"}");
        return;
    }
    int pos = 0;
    
    pos += snprintf(json + pos, 65536 - pos,
        "{"
        "\"title\":\"PCIe BAR Mapping Table\","
        "\"total_devices\":%d,"
        "\"simulation\":%s,"
        "\"entries\":[",
        device_count,
        use_simulation ? "true" : "false");
    
    int entry_count = 0;
    for (int i = 0; i < device_count; i++) {
        pci_device_t *dev = &devices[i];
        for (int j = 0; j < MAX_BARS; j++) {
            bar_info_t *bar = &dev->bars[j];
            if (!bar->is_valid) continue;
            
            if (entry_count > 0) pos += snprintf(json + pos, 65536 - pos, ",");
            
            pos += snprintf(json + pos, 65536 - pos,
                "{"
                "\"device_id\":%d,"
                "\"bdf\":\"%02x:%02x.%x\","
                "\"vendor_device\":\"0x%04x:0x%04x\","
                "\"bar_index\":%d,"
                "\"base_addr\":\"0x%016llx\","
                "\"size\":\"0x%016llx\","
                "\"size_bytes\":%llu,"
                "\"type\":\"%s\","
                "\"width\":\"%s\","
                "\"prefetchable\":%s,"
                "\"mapped\":%s"
                "}",
                i,
                dev->bus, dev->dev, dev->func,
                dev->vendor_id, dev->device_id,
                j,
                (unsigned long long)bar->base_addr,
                (unsigned long long)bar->size,
                (unsigned long long)bar->size,
                bar->is_io ? "IO" : "MMIO",
                bar->is_64bit ? "64-bit" : "32-bit",
                bar->is_prefetchable ? "true" : "false",
                bar->mmap_ptr ? "true" : "false");
            
            entry_count++;
        }
    }
    
    pos += snprintf(json + pos, 65536 - pos,
        "],"
        "\"total_bars\":%d"
        "}",
        entry_count);
    
    send_json_response(client_fd, json);
    free(json);
}

void handle_request(int client_fd) {
    char buffer[BUFFER_SIZE];
    ssize_t bytes_read = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    
    if (bytes_read <= 0) {
        close(client_fd);
        return;
    }
    
    buffer[bytes_read] = '\0';
    printf("\n=== Request ===\n%s\n", buffer);
    
    char method[16], path[256], query[512];
    query[0] = '\0';
    
    sscanf(buffer, "%15s %255s", method, path);
    
    char *qmark = strchr(path, '?');
    if (qmark) {
        *qmark = '\0';
        strncpy(query, qmark + 1, sizeof(query) - 1);
    }
    
    if (strcmp(method, "OPTIONS") == 0) {
        send_response(client_fd, "text/plain", "");
        close(client_fd);
        return;
    }
    
    if (strcmp(path, "/api/devices") == 0) {
        handle_get_devices(client_fd);
    } else if (strcmp(path, "/api/select") == 0) {
        handle_select_device(client_fd, query);
    } else if (strcmp(path, "/api/read") == 0) {
        handle_read(client_fd, query);
    } else if (strcmp(path, "/api/write") == 0) {
        handle_write(client_fd, query);
    } else if (strcmp(path, "/api/info") == 0) {
        handle_get_info(client_fd);
    } else if (strcmp(path, "/api/barmap") == 0) {
        handle_barmap(client_fd);
    } else if (strcmp(path, "/") == 0 || strcmp(path, "/index.html") == 0) {
        FILE *fp = fopen("index.html", "r");
        if (fp) {
            fseek(fp, 0, SEEK_END);
            long fsize = ftell(fp);
            fseek(fp, 0, SEEK_SET);
            
            char *html = malloc(fsize + 1);
            fread(html, 1, fsize, fp);
            html[fsize] = '\0';
            fclose(fp);
            
            send_response(client_fd, "text/html; charset=utf-8", html);
            free(html);
        } else {
            send_json_response(client_fd, "{\"error\":\"index.html not found\"}");
        }
    } else {
        send_json_response(client_fd, "{\"error\":\"Unknown endpoint\"}");
    }
    
    close(client_fd);
}

int main(int argc, char *argv[]) {
    int opt;
    while ((opt = getopt(argc, argv, "rh")) != -1) {
        switch (opt) {
            case 'r':
                use_simulation = 0;
                printf("Real hardware mode enabled (requires root)\n");
                break;
            case 'h':
                printf("Usage: %s [-r] [-h]\n", argv[0]);
                printf("  -r  Use real hardware mode (default: simulation)\n");
                printf("  -h  Show this help\n");
                return 0;
            default:
                break;
        }
    }
    
    printf("=== PCIe Device Memory Mapped I/O Server ===\n\n");
    
    scan_pci_devices();
    
    if (device_count == 0) {
        printf("Warning: No PCI devices found. Continuing with simulation mode...\n");
    }
    
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) {
        perror("socket failed");
        return 1;
    }
    
    int opt_val = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt_val, sizeof(opt_val));
    
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    addr.sin_port = htons(PORT);
    
    if (bind(server_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind failed");
        close(server_fd);
        return 1;
    }
    
    if (listen(server_fd, 5) < 0) {
        perror("listen failed");
        close(server_fd);
        return 1;
    }
    
    printf("\nServer running on http://127.0.0.1:%d\n", PORT);
    printf("Mode: %s\n", use_simulation ? "Simulation" : "Real Hardware");
    printf("Press Ctrl+C to stop...\n\n");
    
    while (1) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &client_len);
        
        if (client_fd < 0) {
            perror("accept failed");
            continue;
        }
        
        handle_request(client_fd);
    }
    
    for (int i = 0; i < device_count; i++) {
        for (int j = 0; j < MAX_BARS; j++) {
            unmap_bar_memory(&devices[i], j);
            if (devices[i].bars[j].sim_mem) {
                free(devices[i].bars[j].sim_mem);
            }
        }
    }
    
#ifdef HAVE_LIBPCI
    if (pacc) {
        pci_cleanup(pacc);
    }
#endif
    
    close(server_fd);
    return 0;
}
