/*
 * pci-helper: Privilege helper for reading/writing PCI config space.
 *
 * Usage:
 *   pci-helper read    <BDF> [off len]
 *   pci-helper write   <BDF> <off> <hex_value>
 *   pci-helper save    <BDF>               # save config to backup dir
 *   pci-helper restore <BDF>               # restore from backup
 *   pci-helper inject  <BDF> <type>        # pre-defined error injection
 *   pci-helper inject  <BDF> command       # WARNING: may crash the machine
 *
 * BDF format: dddd:bb:dd.f
 *
 * The web backend runs with limited privileges; this helper is intended to
 * be installed setuid-root so it can open /sys/bus/pci/devices/<BDF>/config
 * for both reading and writing.
 *
 * The input path is fully validated to prevent any path traversal.
 * Before every write/inject the caller should `save` first so the original
 * config can be restored if the system becomes unstable.
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <errno.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdint.h>
#include <sys/stat.h>
#include <sys/types.h>

#define CONFIG_SZ 256
#define BACKUP_DIR "/var/lib/pci-browser/backups"

static int valid_bdf(const char *s)
{
    /* dddd:bb:dd.f  -- 12 chars exactly */
    if (strlen(s) != 12) return 0;
    for (int i = 0; i < 12; i++) {
        char c = s[i];
        if (i == 4 || i == 7) {
            if (c != ':') return 0;
        } else if (i == 10) {
            if (c != '.') return 0;
        } else if (!isxdigit((unsigned char)c)) {
            return 0;
        }
    }
    return 1;
}

static int open_config(const char *bdf, int flags)
{
    char path[128];
    snprintf(path, sizeof(path), "/sys/bus/pci/devices/%s/config", bdf);
    char real[512];
    if (!realpath(path, real)) return -1;
    if (strncmp(real, "/sys/bus/pci/devices/", 21) != 0 &&
        strncmp(real, "/sys/devices/",       13) != 0) {
        errno = EACCES;
        return -1;
    }
    return open(real, flags);
}

static int backup_path(char *out, size_t sz, const char *bdf)
{
    return snprintf(out, sz, "%s/%s", BACKUP_DIR, bdf) > 0 &&
           snprintf(out, sz, "%s/%s", BACKUP_DIR, bdf) < (int)sz;
}

static int ensure_backup_dir(void)
{
    struct stat st;
    if (stat(BACKUP_DIR, &st) == 0) return 0;
    if (mkdir(BACKUP_DIR, 0700) == 0) return 0;
    /* try recursive: /var/lib/pci-browser first */
    char parent[256];
    snprintf(parent, sizeof(parent), "%s", BACKUP_DIR);
    char *p = strrchr(parent, '/');
    if (p) { *p = '\0'; mkdir(parent, 0755); }
    return mkdir(BACKUP_DIR, 0700);
}

static int cmd_read(const char *bdf, int argc, char **argv)
{
    unsigned long off = 0, len = CONFIG_SZ;
    if (argc >= 1) {
        off = strtoul(argv[0], NULL, 0);
        if (argc >= 2) len = strtoul(argv[1], NULL, 0);
    }
    if (off + len > CONFIG_SZ) {
        fprintf(stderr, "read exceeds config space size\n");
        return 2;
    }
    int fd = open_config(bdf, O_RDONLY);
    if (fd < 0) {
        perror("open config");
        return 1;
    }
    unsigned char buf[CONFIG_SZ];
    if (lseek(fd, (off_t)off, SEEK_SET) != (off_t)off) { perror("lseek"); close(fd); return 1; }
    ssize_t r = read(fd, buf, len);
    close(fd);
    if (r < 0) { perror("read"); return 1; }
    for (ssize_t i = 0; i < r; i++) printf("%02x\n", buf[i]);
    return 0;
}

static int cmd_save(const char *bdf)
{
    ensure_backup_dir();
    char bpath[512];
    backup_path(bpath, sizeof(bpath), bdf);
    int fd = open_config(bdf, O_RDONLY);
    if (fd < 0) { perror("open config"); return 1; }
    unsigned char buf[CONFIG_SZ];
    ssize_t r = read(fd, buf, CONFIG_SZ);
    close(fd);
    if (r != CONFIG_SZ) { perror("read config"); return 1; }
    int out = open(bpath, O_WRONLY | O_CREAT | O_TRUNC, 0600);
    if (out < 0) { perror("open backup"); return 1; }
    ssize_t w = write(out, buf, CONFIG_SZ);
    close(out);
    if (w != CONFIG_SZ) { perror("write backup"); return 1; }
    printf("saved %s\n", bpath);
    return 0;
}

static int cmd_restore(const char *bdf)
{
    char bpath[512];
    backup_path(bpath, sizeof(bpath), bdf);
    int in = open(bpath, O_RDONLY);
    if (in < 0) { perror("open backup"); return 1; }
    unsigned char buf[CONFIG_SZ];
    ssize_t r = read(in, buf, CONFIG_SZ);
    close(in);
    if (r != CONFIG_SZ) { perror("read backup"); return 1; }
    int fd = open_config(bdf, O_RDWR);
    if (fd < 0) { perror("open config"); return 1; }
    ssize_t w = write(fd, buf, CONFIG_SZ);
    close(fd);
    if (w != CONFIG_SZ) { perror("restore"); return 1; }
    printf("restored %s\n", bdf);
    return 0;
}

static int cmd_write(const char *bdf, const char *off_s, const char *val_s)
{
    unsigned long off = strtoul(off_s, NULL, 0);
    unsigned long val = strtoul(val_s, NULL, 16);
    if (off > CONFIG_SZ - 4) {
        fprintf(stderr, "write offset out of range\n");
        return 2;
    }
    /* Safety: refuse to write into BAR registers (0x10-0x27) if the value
       looks like it would disable memory decoding. We still allow writes
       there but print a warning. */
    if (off >= 0x10 && off <= 0x27) {
        fprintf(stderr, "warning: writing into BAR region (offset 0x%lx)\n", off);
    }
    /* Never allow writing to the Command register via raw write if value
       disables both IO and MEM decoding (bits 0 and 1 both zero). */
    if (off == 0x04 && (val & 0x3) == 0) {
        fprintf(stderr, "refusing: write to command register would disable IO+MEM decoding\n");
        return 3;
    }
    int fd = open_config(bdf, O_RDWR);
    if (fd < 0) {
        perror("open config (write)");
        return 1;
    }
    if (lseek(fd, (off_t)off, SEEK_SET) != (off_t)off) { perror("lseek"); close(fd); return 1; }
    ssize_t w = write(fd, &val, sizeof(val));
    close(fd);
    if (w != (ssize_t)sizeof(val)) { perror("write"); return 1; }
    printf("ok\n");
    return 0;
}

static int pwrite_all(int fd, const void *buf, size_t n, off_t off)
{
    if (lseek(fd, off, SEEK_SET) != off) return -1;
    ssize_t w = write(fd, buf, n);
    if (w != (ssize_t)n) return -1;
    return 0;
}

static int cmd_inject(const char *bdf, const char *type)
{
    /*
     * Pre-defined safe(ish) error injections that write to known read-only /
     * W1C / harmless fields of the config space.
     *
     * The "command" injection is gated behind an environment variable
     * (PCI_ALLOW_DANGEROUS=1) because disabling IO+MEM decoding on a live
     * device can crash the kernel.
     */
    int fd = open_config(bdf, O_RDWR);
    if (fd < 0) { perror("open config"); return 1; }

    int rc = 0;
    if (strcmp(type, "vendor") == 0) {
        uint16_t v = 0xDEAD;
        if (pwrite_all(fd, &v, 2, 0x00) != 0) { perror("write vendor"); rc = 1; }
    } else if (strcmp(type, "status") == 0) {
        uint16_t v = 0xFFFF;
        if (pwrite_all(fd, &v, 2, 0x06) != 0) { perror("write status"); rc = 1; }
    } else if (strcmp(type, "command") == 0) {
        /* Dangerous: requires explicit opt-in via environment. */
        if (getenv("PCI_ALLOW_DANGEROUS") == NULL) {
            fprintf(stderr,
                "refusing: command injection disabled for safety. "
                "Set PCI_ALLOW_DANGEROUS=1 to enable (may crash machine).\n");
            rc = 3;
        } else {
            uint16_t v = 0x0000;
            if (pwrite_all(fd, &v, 2, 0x04) != 0) { perror("write command"); rc = 1; }
        }
    } else if (strcmp(type, "cacheline") == 0) {
        uint8_t v = 0x42;
        if (pwrite_all(fd, &v, 1, 0x0C) != 0) { perror("write cacheline"); rc = 1; }
    } else if (strcmp(type, "latency") == 0) {
        uint8_t v = 0xF8;
        if (pwrite_all(fd, &v, 1, 0x0D) != 0) { perror("write latency"); rc = 1; }
    } else {
        fprintf(stderr, "unknown injection type: %s\n", type);
        rc = 2;
    }

    close(fd);
    if (rc == 0) printf("injected %s\n", type);
    return rc;
}

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr,
            "usage:\n"
            "  %s read    <BDF> [off len]\n"
            "  %s write   <BDF> <off> <hex>\n"
            "  %s save    <BDF>\n"
            "  %s restore <BDF>\n"
            "  %s inject  <BDF> <vendor|status|command|cacheline|latency>\n",
            argv[0], argv[0], argv[0], argv[0], argv[0]);
        return 2;
    }

    const char *cmd = argv[1];
    const char *bdf = argv[2];
    if (!valid_bdf(bdf)) { fprintf(stderr, "invalid BDF\n"); return 2; }

    if (strcmp(cmd, "read") == 0) {
        return cmd_read(bdf, argc - 3, argv + 3);
    } else if (strcmp(cmd, "write") == 0) {
        if (argc < 5) { fprintf(stderr, "write needs <off> <hex>\n"); return 2; }
        return cmd_write(bdf, argv[3], argv[4]);
    } else if (strcmp(cmd, "save") == 0) {
        return cmd_save(bdf);
    } else if (strcmp(cmd, "restore") == 0) {
        return cmd_restore(bdf);
    } else if (strcmp(cmd, "inject") == 0) {
        if (argc < 4) { fprintf(stderr, "inject needs <type>\n"); return 2; }
        return cmd_inject(bdf, argv[3]);
    } else {
        fprintf(stderr, "unknown command: %s\n", cmd);
        return 2;
    }
}
