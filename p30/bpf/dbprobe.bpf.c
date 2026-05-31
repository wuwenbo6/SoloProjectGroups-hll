#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_core_read.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_ringbuf.h>

#define MAX_DATA_SIZE 4096
#define TASK_COMM_LEN 16
#define MAX_CONN_MAP 65536

#define MYSQL_PORT 3306
#define POSTGRES_PORT 5432

#define EVENT_TYPE_KERNEL 0
#define EVENT_TYPE_UPROBE_SSL_READ 1
#define EVENT_TYPE_UPROBE_SSL_WRITE 2
#define EVENT_TYPE_UPROBE_MYSQL_QUERY 3
#define EVENT_TYPE_UPROBE_PG_QUERY 4

struct event {
    __u32 pid;
    __u32 tid;
    __u64 duration_ns;
    __u16 sport;
    __u16 dport;
    __u32 saddr;
    __u32 daddr;
    __u32 data_len;
    __u8 event_type;
    __u8 direction;
    char comm[TASK_COMM_LEN];
    __u8 data[MAX_DATA_SIZE];
};

struct conn_key {
    __u32 pid;
    __u64 fd;
};

struct conn_info {
    __u64 start_ns;
    __u16 sport;
    __u16 dport;
    __u32 saddr;
    __u32 daddr;
    __u8 is_ssl;
};

struct ssl_read_args {
    void *ssl;
    void *buf;
    int num;
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, MAX_CONN_MAP);
    __type(key, struct conn_key);
    __type(value, struct conn_info);
} conn_map SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 64 * 1024 * 1024);
} events SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, __u64);
} lost_events SEC(".maps");

static __always_inline bool is_db_port(__u16 port) {
    return port == MYSQL_PORT || port == POSTGRES_PORT;
}

static __always_inline void extract_ip_port(struct sock *sk, __u32 *saddr, __u32 *daddr, __u16 *sport, __u16 *dport) {
    struct inet_sock *inet = (struct inet_sock *)sk;
    
    BPF_CORE_READ_INTO(saddr, inet, inet_saddr);
    BPF_CORE_READ_INTO(daddr, inet, inet_daddr);
    BPF_CORE_READ_INTO(sport, inet, inet_sport);
    BPF_CORE_READ_INTO(dport, inet, inet_dport);
    
    *sport = bpf_ntohs(*sport);
    *dport = bpf_ntohs(*dport);
}

static __always_inline void increment_lost() {
    __u32 key = 0;
    __u64 *count = bpf_map_lookup_elem(&lost_events, &key);
    if (count) {
        __sync_fetch_and_add(count, 1);
    }
}

SEC("kprobe/sys_recvfrom")
int BPF_KPROBE(kprobe_sys_recvfrom, int fd, void *buf, size_t len, int flags) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    struct file **fdt = BPF_CORE_READ(task, files, fdt);
    struct file *file = NULL;
    
    bpf_probe_read_kernel(&file, sizeof(file), &fdt[fd]);
    if (!file) return 0;
    
    struct socket *socket = BPF_CORE_READ(file, private_data);
    if (!socket) return 0;
    
    struct sock *sk = BPF_CORE_READ(socket, sk);
    if (!sk) return 0;
    
    __u16 sport = 0, dport = 0;
    __u32 saddr = 0, daddr = 0;
    extract_ip_port(sk, &saddr, &daddr, &sport, &dport);
    
    if (!is_db_port(sport) && !is_db_port(dport)) {
        return 0;
    }
    
    struct conn_key key = {
        .pid = pid,
        .fd = fd
    };
    
    struct conn_info info = {0};
    info.start_ns = bpf_ktime_get_ns();
    info.sport = sport;
    info.dport = dport;
    info.saddr = saddr;
    info.daddr = daddr;
    info.is_ssl = 0;
    
    bpf_map_update_elem(&conn_map, &key, &info, BPF_ANY);
    
    return 0;
}

SEC("kretprobe/sys_recvfrom")
int BPF_KRETPROBE(kretprobe_sys_recvfrom, long ret) {
    if (ret <= 0) return 0;
    
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    __u64 fd = PT_REGS_PARM1(ctx);
    
    struct conn_key key = {
        .pid = pid,
        .fd = fd
    };
    
    struct conn_info *info = bpf_map_lookup_elem(&conn_map, &key);
    if (!info) return 0;
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        goto cleanup;
    }
    
    __u64 end_ns = bpf_ktime_get_ns();
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = end_ns - info->start_ns;
    e->sport = info->sport;
    e->dport = info->dport;
    e->saddr = info->saddr;
    e->daddr = info->daddr;
    e->event_type = EVENT_TYPE_KERNEL;
    e->direction = 0;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    void *buf = (void *)PT_REGS_PARM2(ctx);
    __u32 data_len = ret > MAX_DATA_SIZE ? MAX_DATA_SIZE : ret;
    e->data_len = data_len;
    bpf_probe_read_user(&e->data, data_len, buf);
    
    bpf_ringbuf_submit(e, 0);
    
cleanup:
    bpf_map_delete_elem(&conn_map, &key);
    return 0;
}

SEC("kprobe/sys_sendto")
int BPF_KPROBE(kprobe_sys_sendto, int fd, void *buf, size_t len, int flags) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct task_struct *task = (struct task_struct *)bpf_get_current_task();
    struct file **fdt = BPF_CORE_READ(task, files, fdt);
    struct file *file = NULL;
    
    bpf_probe_read_kernel(&file, sizeof(file), &fdt[fd]);
    if (!file) return 0;
    
    struct socket *socket = BPF_CORE_READ(file, private_data);
    if (!socket) return 0;
    
    struct sock *sk = BPF_CORE_READ(socket, sk);
    if (!sk) return 0;
    
    __u16 sport = 0, dport = 0;
    __u32 saddr = 0, daddr = 0;
    extract_ip_port(sk, &saddr, &daddr, &sport, &dport);
    
    if (!is_db_port(sport) && !is_db_port(dport)) {
        return 0;
    }
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        return 0;
    }
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = 0;
    e->sport = sport;
    e->dport = dport;
    e->saddr = saddr;
    e->daddr = daddr;
    e->event_type = EVENT_TYPE_KERNEL;
    e->direction = 1;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    __u32 data_len = len > MAX_DATA_SIZE ? MAX_DATA_SIZE : len;
    e->data_len = data_len;
    bpf_probe_read_user(&e->data, data_len, buf);
    
    bpf_ringbuf_submit(e, 0);
    
    return 0;
}

SEC("uprobe/SSL_read")
int BPF_UPROBE(uprobe_ssl_read, void *ssl, void *buf, int num) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct ssl_read_args *args = bpf_ringbuf_reserve(&events, sizeof(*args), 0);
    if (!args) {
        increment_lost();
        return 0;
    }
    args->ssl = ssl;
    args->buf = buf;
    args->num = num;
    bpf_ringbuf_submit(args, BPF_RB_NO_WAKEUP);
    
    return 0;
}

SEC("uretprobe/SSL_read")
int BPF_URETPROBE(uretprobe_ssl_read, int ret) {
    if (ret <= 0) return 0;
    
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        return 0;
    }
    
    void *buf = (void *)PT_REGS_PARM2(ctx);
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = 0;
    e->sport = 0;
    e->dport = 0;
    e->saddr = 0;
    e->daddr = 0;
    e->event_type = EVENT_TYPE_UPROBE_SSL_READ;
    e->direction = 0;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    __u32 data_len = ret > MAX_DATA_SIZE ? MAX_DATA_SIZE : ret;
    e->data_len = data_len;
    bpf_probe_read_user(&e->data, data_len, buf);
    
    bpf_ringbuf_submit(e, 0);
    
    return 0;
}

SEC("uprobe/SSL_write")
int BPF_UPROBE(uprobe_ssl_write, void *ssl, const void *buf, int num) {
    if (num <= 0) return 0;
    
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        return 0;
    }
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = 0;
    e->sport = 0;
    e->dport = 0;
    e->saddr = 0;
    e->daddr = 0;
    e->event_type = EVENT_TYPE_UPROBE_SSL_WRITE;
    e->direction = 1;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    __u32 data_len = num > MAX_DATA_SIZE ? MAX_DATA_SIZE : num;
    e->data_len = data_len;
    bpf_probe_read_user(&e->data, data_len, (void *)buf);
    
    bpf_ringbuf_submit(e, 0);
    
    return 0;
}

SEC("uprobe/dispatch_command")
int BPF_UPROBE(uprobe_mysql_dispatch, void *thd, int command, void *packet,
               unsigned int length, unsigned long long *packet_arg) {
    if (command != 3) return 0;
    
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        return 0;
    }
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = 0;
    e->sport = MYSQL_PORT;
    e->dport = 0;
    e->saddr = 0;
    e->daddr = 0;
    e->event_type = EVENT_TYPE_UPROBE_MYSQL_QUERY;
    e->direction = 1;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    __u32 data_len = length > MAX_DATA_SIZE ? MAX_DATA_SIZE : length;
    e->data_len = data_len;
    bpf_probe_read_user(&e->data, data_len, packet);
    
    bpf_ringbuf_submit(e, 0);
    
    return 0;
}

SEC("uprobe/exec_simple_query")
int BPF_UPROBE(uprobe_pg_simple_query, const char *query_string) {
    __u32 pid = bpf_get_current_pid_tgid() >> 32;
    
    struct event *e = bpf_ringbuf_reserve(&events, sizeof(*e), 0);
    if (!e) {
        increment_lost();
        return 0;
    }
    
    e->pid = pid;
    e->tid = bpf_get_current_pid_tgid();
    e->duration_ns = 0;
    e->sport = POSTGRES_PORT;
    e->dport = 0;
    e->saddr = 0;
    e->daddr = 0;
    e->event_type = EVENT_TYPE_UPROBE_PG_QUERY;
    e->direction = 1;
    bpf_get_current_comm(&e->comm, sizeof(e->comm));
    
    int i = 0;
    for (; i < MAX_DATA_SIZE - 1; i++) {
        char c;
        bpf_probe_read_user(&c, 1, query_string + i);
        e->data[i] = c;
        if (c == 0) break;
    }
    e->data_len = i;
    
    bpf_ringbuf_submit(e, 0);
    
    return 0;
}

SEC("uprobe/exec_parse_message")
int BPF_UPROBE(uprobe_pg_parse, const char *query_string) {
    return 0;
}

char LICENSE[] SEC("license") = "Dual BSD/GPL";
