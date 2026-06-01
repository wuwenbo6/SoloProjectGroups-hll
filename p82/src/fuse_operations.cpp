#include "fuse_operations.h"
#include <iostream>
#include <cstring>
#include <errno.h>
#include <sys/statvfs.h>

static FuseContext* g_context = nullptr;

FuseContext* getFuseContext() {
    return g_context;
}

void setFuseContext(FuseContext* ctx) {
    g_context = ctx;
}

int gm_getattr(const char* path, struct stat* stbuf, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->getattr(path, stbuf);
    return result < 0 ? -result : result;
}

int gm_readdir(const char* path, void* buf, fuse_fill_dir_t filler, off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags) {
    (void)offset;
    (void)fi;
    (void)flags;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }

    std::vector<std::string> entries;
    int result = ctx->vfs->readdir(path, entries);
    if (result < 0) {
        return -result;
    }

    for (const auto& entry : entries) {
        struct stat st;
        memset(&st, 0, sizeof(st));
        if (filler(buf, entry.c_str(), &st, 0, FUSE_FILL_DIR_PLUS)) {
            break;
        }
    }

    return 0;
}

int gm_create(const char* path, mode_t mode, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->create(path, mode);
    return result < 0 ? -result : result;
}

int gm_mkdir(const char* path, mode_t mode) {
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->mkdir(path, mode);
    return result < 0 ? -result : result;
}

int gm_unlink(const char* path) {
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->unlink(path);
    return result < 0 ? -result : result;
}

int gm_rmdir(const char* path) {
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->rmdir(path);
    return result < 0 ? -result : result;
}

int gm_open(const char* path, struct fuse_file_info* fi) {
    (void)path;
    (void)fi;
    return 0;
}

int gm_read(const char* path, char* buf, size_t size, off_t offset, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->read(path, buf, size, offset);
    return result < 0 ? -result : result;
}

int gm_write(const char* path, const char* buf, size_t size, off_t offset, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->write(path, buf, size, offset);
    return result < 0 ? -result : result;
}

int gm_truncate(const char* path, off_t size, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->truncate(path, size);
    return result < 0 ? -result : result;
}

int gm_utimens(const char* path, const struct timespec tv[2], struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->utimens(path, tv);
    return result < 0 ? -result : result;
}

int gm_chmod(const char* path, mode_t mode, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->chmod(path, mode);
    return result < 0 ? -result : result;
}

int gm_chown(const char* path, uid_t uid, gid_t gid, struct fuse_file_info* fi) {
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->chown(path, uid, gid);
    return result < 0 ? -result : result;
}

int gm_fsync(const char* path, int isdatasync, struct fuse_file_info* fi) {
    (void)isdatasync;
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->fsync(path);
    return result < 0 ? -result : result;
}

int gm_fsyncdir(const char* path, int isdatasync, struct fuse_file_info* fi) {
    (void)isdatasync;
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (!ctx || !ctx->vfs) {
        return -EIO;
    }
    int result = ctx->vfs->fsync(path);
    return result < 0 ? -result : result;
}

int gm_release(const char* path, struct fuse_file_info* fi) {
    (void)path;
    (void)fi;
    FuseContext* ctx = getFuseContext();
    if (ctx && ctx->vfs) {
        ctx->vfs->saveToStorage();
    }
    return 0;
}

int gm_statfs(const char* path, struct statvfs* stbuf) {
    (void)path;
    memset(stbuf, 0, sizeof(struct statvfs));
    stbuf->f_bsize = 4096;
    stbuf->f_frsize = 4096;
    stbuf->f_blocks = 1024 * 1024 * 100;
    stbuf->f_bfree = stbuf->f_blocks;
    stbuf->f_bavail = stbuf->f_blocks;
    stbuf->f_files = 100000;
    stbuf->f_ffree = 100000;
    stbuf->f_favail = 100000;
    stbuf->f_namemax = 255;
    return 0;
}

void* gm_init(struct fuse_conn_info* conn, struct fuse_config* cfg) {
    (void)conn;
    cfg->kernel_cache = 1;
    cfg->entry_timeout = 1.0;
    cfg->attr_timeout = 1.0;
    cfg->negative_timeout = 0.5;
    return getFuseContext();
}

void gm_destroy(void* private_data) {
    (void)private_data;
    FuseContext* ctx = getFuseContext();
    if (ctx && ctx->vfs) {
        ctx->vfs->saveToStorage();
    }
}
