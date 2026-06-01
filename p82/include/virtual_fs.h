#ifndef VIRTUAL_FS_H
#define VIRTUAL_FS_H

#include "common.h"
#include "gm_crypto.h"
#include "kms_manager.h"
#include "parallel_crypto.h"
#include "crypto_logger.h"
#include <map>
#include <string>
#include <mutex>
#include <memory>
#include <list>
#include <unordered_map>
#include <sys/stat.h>

constexpr size_t BLOCK_SIZE = 64 * 1024;
constexpr size_t MAX_CACHED_BLOCKS = 1024;

struct BlockInfo {
    uint64_t blockIndex;
    ByteArray iv;
    bool dirty;
    bool loaded;
};

struct VirtualFile {
    std::string name;
    std::string fileId;
    std::string keyId;
    uint64_t fileSize;
    FileMetadata metadata;
    bool isDirectory;
    std::vector<std::string> children;

    WrappedKey wrappedKey;
    std::map<uint64_t, BlockInfo> blocks;
    bool metadataDirty;
    bool signatureValid;
    bool keyLoaded;
};

class BlockCache {
public:
    BlockCache(size_t maxBlocks = MAX_CACHED_BLOCKS);
    ~BlockCache();

    ByteArray* get(const std::string& fileId, uint64_t blockIndex);
    void put(const std::string& fileId, uint64_t blockIndex, const ByteArray& data);
    void markDirty(const std::string& fileId, uint64_t blockIndex);
    void removeFile(const std::string& fileId);
    void clear();

    std::list<std::tuple<std::string, uint64_t, ByteArray>> getDirtyBlocks();
    void clearDirtyFlag(const std::string& fileId, uint64_t blockIndex);

private:
    void evictIfNeeded();

    struct CacheEntry {
        std::string fileId;
        uint64_t blockIndex;
        ByteArray data;
        bool dirty;
    };

    size_t m_maxBlocks;
    std::list<CacheEntry> m_cacheList;
    std::unordered_map<std::string, std::unordered_map<uint64_t, decltype(m_cacheList.begin())>> m_cacheMap;
    std::mutex m_mutex;
};

class VirtualFS {
public:
    VirtualFS(const std::string& storagePath, GMCrypto& crypto, KMSManager* kms = nullptr);
    ~VirtualFS();

    bool init();
    bool loadFromStorage();
    bool saveToStorage();

    int getattr(const std::string& path, struct stat* stbuf);
    int readdir(const std::string& path, std::vector<std::string>& entries);
    int create(const std::string& path, mode_t mode);
    int mkdir(const std::string& path, mode_t mode);
    int unlink(const std::string& path);
    int rmdir(const std::string& path);
    int read(const std::string& path, char* buf, size_t size, off_t offset);
    int write(const std::string& path, const char* buf, size_t size, off_t offset);
    int truncate(const std::string& path, off_t size);
    int utimens(const std::string& path, const struct timespec tv[2]);
    int chmod(const std::string& path, mode_t mode);
    int chown(const std::string& path, uid_t uid, gid_t gid);
    int fsync(const std::string& path);

    void enableParallelCrypto(bool enable) { m_parallelCryptoEnabled = enable; }
    bool isParallelCryptoEnabled() const { return m_parallelCryptoEnabled; }

    void enableKMS(bool enable) { m_kmsEnabled = enable; }
    bool isKMSEnabled() const { return m_kmsEnabled; }

    void enableLogging(bool enable) { m_loggingEnabled = enable; }
    bool isLoggingEnabled() const { return m_loggingEnabled; }

    size_t getParallelThreadCount() const { return m_parallelThreadCount; }
    void setParallelThreadCount(size_t count) { m_parallelThreadCount = count; }

private:
    std::string generateFileId();
    std::string getBlockPath(const std::string& fileId, uint64_t blockIndex);
    std::string getMetaPath(const std::string& fileId);

    bool loadBlock(VirtualFile& file, uint64_t blockIndex);
    bool saveBlock(VirtualFile& file, uint64_t blockIndex);
    bool saveAllBlocks(VirtualFile& file);
    bool saveAllBlocksParallel(VirtualFile& file);

    bool encryptBlock(const ByteArray& plaintext, ByteArray& ciphertext, const ByteArray& key, ByteArray& iv);
    bool decryptBlock(const ByteArray& ciphertext, ByteArray& plaintext, const ByteArray& key, const ByteArray& iv);

    ByteArray getFileKey(VirtualFile& file);
    bool wrapAndStoreKey(VirtualFile& file, const ByteArray& plainKey);

    void updateMetadataHash(VirtualFile& file);
    bool verifyMetadataHash(const VirtualFile& file);

    ByteArray computeFileHash(VirtualFile& file);

    VirtualFile* findFile(const std::string& path);
    std::string getParentPath(const std::string& path);
    std::string getFileName(const std::string& path);

    bool saveFileMetadata(const VirtualFile& file);
    bool loadFileMetadata(VirtualFile& file);

    std::string m_storagePath;
    std::string m_blocksPath;
    GMCrypto& m_crypto;
    KMSManager* m_kms;
    std::map<std::string, std::unique_ptr<VirtualFile>> m_files;
    BlockCache m_blockCache;
    std::mutex m_mutex;

    uint64_t m_nextFileId;

    bool m_parallelCryptoEnabled;
    bool m_kmsEnabled;
    bool m_loggingEnabled;
    size_t m_parallelThreadCount;
};

#endif
