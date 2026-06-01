#ifndef FUSE_OPERATIONS_H
#define FUSE_OPERATIONS_H

#include "virtual_fs.h"
#include "kms_manager.h"
#include "crypto_logger.h"
#include "parallel_crypto.h"
#include <fuse3/fuse.h>
#include <memory>

struct FuseContext {
    std::unique_ptr<GMCrypto> crypto;
    std::unique_ptr<KMSManager> kms;
    std::unique_ptr<VirtualFS> vfs;
    std::string mountPoint;
    std::string storagePath;
    std::string keyFile;
    std::string certFile;
    std::string masterKeyFile;
    std::string logPath;
    bool foreground;
    bool debug;
    bool enableKMS;
    bool enableParallelCrypto;
    bool enableLogging;
    size_t parallelThreads;
};

FuseContext* getFuseContext();
void setFuseContext(FuseContext* ctx);

int gm_getattr(const char* path, struct stat* stbuf, struct fuse_file_info* fi);
int gm_readdir(const char* path, void* buf, fuse_fill_dir_t filler, off_t offset, struct fuse_file_info* fi, enum fuse_readdir_flags flags);
int gm_create(const char* path, mode_t mode, struct fuse_file_info* fi);
int gm_mkdir(const char* path, mode_t mode);
int gm_unlink(const char* path);
int gm_rmdir(const char* path);
int gm_open(const char* path, struct fuse_file_info* fi);
int gm_read(const char* path, char* buf, size_t size, off_t offset, struct fuse_file_info* fi);
int gm_write(const char* path, const char* buf, size_t size, off_t offset, struct fuse_file_info* fi);
int gm_truncate(const char* path, off_t size, struct fuse_file_info* fi);
int gm_utimens(const char* path, const struct timespec tv[2], struct fuse_file_info* fi);
int gm_chmod(const char* path, mode_t mode, struct fuse_file_info* fi);
int gm_chown(const char* path, uid_t uid, gid_t gid, struct fuse_file_info* fi);
void* gm_init(struct fuse_conn_info* conn, struct fuse_config* cfg);
void gm_destroy(void* private_data);
int gm_fsync(const char* path, int isdatasync, struct fuse_file_info* fi);
int gm_fsyncdir(const char* path, int isdatasync, struct fuse_file_info* fi);
int gm_release(const char* path, struct fuse_file_info* fi);
int gm_statfs(const char* path, struct statvfs* stbuf);

#endif
