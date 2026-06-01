#include "virtual_fs.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <chrono>
#include <cstring>
#include <unistd.h>
#include <algorithm>
#include <random>

BlockCache::BlockCache(size_t maxBlocks) : m_maxBlocks(maxBlocks) {
}

BlockCache::~BlockCache() {
    clear();
}

ByteArray* BlockCache::get(const std::string& fileId, uint64_t blockIndex) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto fileIt = m_cacheMap.find(fileId);
    if (fileIt == m_cacheMap.end()) {
        return nullptr;
    }

    auto blockIt = fileIt->second.find(blockIndex);
    if (blockIt == fileIt->second.end()) {
        return nullptr;
    }

    m_cacheList.splice(m_cacheList.begin(), m_cacheList, blockIt->second);
    return &(blockIt->second->data);
}

void BlockCache::put(const std::string& fileId, uint64_t blockIndex, const ByteArray& data) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto fileIt = m_cacheMap.find(fileId);
    if (fileIt != m_cacheMap.end()) {
        auto blockIt = fileIt->second.find(blockIndex);
        if (blockIt != fileIt->second.end()) {
            blockIt->second->data = data;
            m_cacheList.splice(m_cacheList.begin(), m_cacheList, blockIt->second);
            return;
        }
    }

    evictIfNeeded();

    CacheEntry entry;
    entry.fileId = fileId;
    entry.blockIndex = blockIndex;
    entry.data = data;
    entry.dirty = false;

    m_cacheList.push_front(entry);
    m_cacheMap[fileId][blockIndex] = m_cacheList.begin();
}

void BlockCache::markDirty(const std::string& fileId, uint64_t blockIndex) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto fileIt = m_cacheMap.find(fileId);
    if (fileIt == m_cacheMap.end()) return;

    auto blockIt = fileIt->second.find(blockIndex);
    if (blockIt == fileIt->second.end()) return;

    blockIt->second->dirty = true;
}

void BlockCache::removeFile(const std::string& fileId) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto fileIt = m_cacheMap.find(fileId);
    if (fileIt == m_cacheMap.end()) return;

    for (auto& blockPair : fileIt->second) {
        m_cacheList.erase(blockPair.second);
    }
    m_cacheMap.erase(fileIt);
}

void BlockCache::clear() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_cacheList.clear();
    m_cacheMap.clear();
}

std::list<std::tuple<std::string, uint64_t, ByteArray>> BlockCache::getDirtyBlocks() {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::list<std::tuple<std::string, uint64_t, ByteArray>> result;

    for (const auto& entry : m_cacheList) {
        if (entry.dirty) {
            result.emplace_back(entry.fileId, entry.blockIndex, entry.data);
        }
    }
    return result;
}

void BlockCache::clearDirtyFlag(const std::string& fileId, uint64_t blockIndex) {
    std::lock_guard<std::mutex> lock(m_mutex);

    auto fileIt = m_cacheMap.find(fileId);
    if (fileIt == m_cacheMap.end()) return;

    auto blockIt = fileIt->second.find(blockIndex);
    if (blockIt == fileIt->second.end()) return;

    blockIt->second->dirty = false;
}

void BlockCache::evictIfNeeded() {
    while (m_cacheList.size() >= m_maxBlocks) {
        auto last = --m_cacheList.end();
        if (last->dirty) {
            break;
        }
        m_cacheMap[last->fileId].erase(last->blockIndex);
        if (m_cacheMap[last->fileId].empty()) {
            m_cacheMap.erase(last->fileId);
        }
        m_cacheList.pop_back();
    }
}

VirtualFS::VirtualFS(const std::string& storagePath, GMCrypto& crypto, KMSManager* kms)
    : m_storagePath(storagePath), m_crypto(crypto), m_kms(kms), m_blockCache(MAX_CACHED_BLOCKS), m_nextFileId(1) {
    m_blocksPath = m_storagePath + "/blocks";
    m_parallelCryptoEnabled = false;
    m_kmsEnabled = (kms != nullptr);
    m_loggingEnabled = false;
    m_parallelThreadCount = ParallelCrypto::instance().getOptimalThreadCount();
}

VirtualFS::~VirtualFS() {
    saveToStorage();
    m_blockCache.clear();
}

std::string VirtualFS::generateFileId() {
    std::stringstream ss;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<uint64_t> dis;
    ss << "f_" << std::hex << dis(gen) << "_" << m_nextFileId++;
    return ss.str();
}

std::string VirtualFS::getBlockPath(const std::string& fileId, uint64_t blockIndex) {
    return m_blocksPath + "/" + fileId + "_b" + std::to_string(blockIndex);
}

std::string VirtualFS::getMetaPath(const std::string& fileId) {
    return m_storagePath + "/" + fileId + ".meta";
}

bool VirtualFS::init() {
    struct stat st;
    if (stat(m_storagePath.c_str(), &st) != 0) {
        if (mkdir(m_storagePath.c_str(), 0755) != 0) {
            return false;
        }
    }
    if (stat(m_blocksPath.c_str(), &st) != 0) {
        if (mkdir(m_blocksPath.c_str(), 0755) != 0) {
            return false;
        }
    }

    auto root = std::make_unique<VirtualFile>();
    root->name = "/";
    root->fileId = "root";
    root->isDirectory = true;
    root->fileSize = 4096;
    root->metadata.file_size = 4096;
    root->metadata.mode = S_IFDIR | 0755;
    root->metadata.uid = getuid();
    root->metadata.gid = getgid();
    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    root->metadata.create_time = now;
    root->metadata.modify_time = now;
    root->metadata.access_time = now;
    root->metadataDirty = false;
    root->signatureValid = true;

    m_files["/"] = std::move(root);
    return true;
}

std::string VirtualFS::getParentPath(const std::string& path) {
    if (path == "/") {
        return "/";
    }
    size_t pos = path.find_last_of('/');
    if (pos == 0) {
        return "/";
    }
    return path.substr(0, pos);
}

std::string VirtualFS::getFileName(const std::string& path) {
    if (path == "/") {
        return "";
    }
    size_t pos = path.find_last_of('/');
    return path.substr(pos + 1);
}

VirtualFile* VirtualFS::findFile(const std::string& path) {
    auto it = m_files.find(path);
    if (it != m_files.end()) {
        return it->second.get();
    }
    return nullptr;
}

bool VirtualFS::encryptBlock(const ByteArray& plaintext, ByteArray& ciphertext, const ByteArray& key, ByteArray& iv) {
    iv = m_crypto.generateRandomIV();
    if (iv.empty()) return false;

    ciphertext = m_crypto.sm4Encrypt(plaintext, key, iv);
    return !ciphertext.empty();
}

bool VirtualFS::decryptBlock(const ByteArray& ciphertext, ByteArray& plaintext, const ByteArray& key, const ByteArray& iv) {
    plaintext = m_crypto.sm4Decrypt(ciphertext, key, iv);
    return !plaintext.empty();
}

ByteArray VirtualFS::getFileKey(VirtualFile& file) {
    if (!m_kmsEnabled || !m_kms) {
        return m_crypto.generateSM4Key();
    }
    if (file.keyLoaded && !file.wrappedKey.encryptedKey.empty()) {
        return m_kms->unwrapKey(file.wrappedKey);
    }
    return ByteArray();
}

bool VirtualFS::wrapAndStoreKey(VirtualFile& file, const ByteArray& plainKey) {
    if (!m_kmsEnabled || !m_kms) {
        return false;
    }
    WrappedKey wrapped = m_kms->wrapKey(plainKey, KeyType::SM4_FILE_KEY);
    if (wrapped.encryptedKey.empty()) {
        return false;
    }
    file.wrappedKey = wrapped;
    file.keyId = m_kms->registerFileKey(file.fileId, wrapped);
    file.keyLoaded = true;
    return true;
}

bool VirtualFS::loadBlock(VirtualFile& file, uint64_t blockIndex) {
    ByteArray* cached = m_blockCache.get(file.fileId, blockIndex);
    if (cached) {
        return true;
    }

    auto blockIt = file.blocks.find(blockIndex);
    if (blockIt == file.blocks.end()) {
        return false;
    }

    std::string blockPath = getBlockPath(file.fileId, blockIndex);
    std::ifstream ifs(blockPath, std::ios::binary);
    if (!ifs) {
        return false;
    }

    ifs.seekg(0, std::ios::end);
    size_t fileSize = ifs.tellg();
    ifs.seekg(0, std::ios::beg);

    ByteArray encrypted(fileSize);
    ifs.read(reinterpret_cast<char*>(encrypted.data()), fileSize);
    ifs.close();

    ByteArray fileKey;
    if (m_kmsEnabled && m_kms) {
        WrappedKey wk = m_kms->getFileKey(file.fileId);
        fileKey = m_kms->unwrapKey(wk);
    } else {
        fileKey = file.sm4Key;
    }

    ByteArray plaintext;
    if (!decryptBlock(encrypted, plaintext, fileKey, blockIt->second.iv)) {
        return false;
    }

    m_blockCache.put(file.fileId, blockIndex, plaintext);
    blockIt->second.loaded = true;

    if (m_loggingEnabled) {
        CryptoLogger::instance().logDecrypt(file.fileId, "", fileSize, "", 0, true, "");
    }

    return true;
}

bool VirtualFS::saveBlock(VirtualFile& file, uint64_t blockIndex) {
    ByteArray* blockData = m_blockCache.get(file.fileId, blockIndex);
    if (!blockData) {
        return false;
    }

    auto blockIt = file.blocks.find(blockIndex);
    if (blockIt == file.blocks.end()) {
        return false;
    }

    ByteArray fileKey;
    if (m_kmsEnabled && m_kms) {
        WrappedKey wk = m_kms->getFileKey(file.fileId);
        fileKey = m_kms->unwrapKey(wk);
    } else {
        fileKey = file.sm4Key;
    }

    ByteArray ciphertext;
    if (!encryptBlock(*blockData, ciphertext, fileKey, blockIt->second.iv)) {
        return false;
    }

    std::string blockPath = getBlockPath(file.fileId, blockIndex);
    std::ofstream ofs(blockPath, std::ios::binary);
    if (!ofs) {
        return false;
    }

    ofs.write(reinterpret_cast<const char*>(ciphertext.data()), ciphertext.size());
    ofs.close();

    m_blockCache.clearDirtyFlag(file.fileId, blockIndex);
    blockIt->second.dirty = false;

    if (m_loggingEnabled) {
        CryptoLogger::instance().logEncrypt(file.fileId, "", ciphertext.size(), "", 0, true, "");
    }

    return true;
}

bool VirtualFS::saveAllBlocks(VirtualFile& file) {
    for (auto& blockPair : file.blocks) {
        if (blockPair.second.dirty) {
            if (!saveBlock(file, blockPair.first)) {
                return false;
            }
        }
    }
    return true;
}

bool VirtualFS::saveAllBlocksParallel(VirtualFile& file) {
    if (!m_parallelCryptoEnabled) {
        return saveAllBlocks(file);
    }

    std::vector<std::pair<uint64_t, ByteArray*>> dirtyBlocks;
    for (auto& blockPair : file.blocks) {
        if (blockPair.second.dirty) {
            ByteArray* blockData = m_blockCache.get(file.fileId, blockPair.first);
            if (blockData) {
                dirtyBlocks.emplace_back(blockPair.first, blockData);
            }
        }
    }

    if (dirtyBlocks.empty()) {
        return true;
    }

    ByteArray fileKey;
    if (m_kmsEnabled && m_kms) {
        WrappedKey wk = m_kms->getFileKey(file.fileId);
        fileKey = m_kms->unwrapKey(wk);
    } else {
        fileKey = file.sm4Key;
    }

    std::vector<CryptoTaskPtr> tasks;
    for (auto& dirty : dirtyBlocks) {
        uint64_t blockIdx = dirty.first;
        ByteArray* data = dirty.second;
        auto blockIt = file.blocks.find(blockIdx);
        if (blockIt != file.blocks.end()) {
            auto task = ParallelCrypto::instance().submitEncrypt(blockIdx, *data, fileKey, blockIt->second.iv);
            tasks.push_back(task);
        }
    }

    ParallelCrypto::instance().waitForAll(tasks);

    bool allSuccess = true;
    for (auto& task : tasks) {
        if (task->success) {
            auto blockIt = file.blocks.find(task->blockIndex);
            if (blockIt != file.blocks.end()) {
                std::string blockPath = getBlockPath(file.fileId, task->blockIndex);
                std::ofstream ofs(blockPath, std::ios::binary);
                if (ofs) {
                    ofs.write(reinterpret_cast<const char*>(task->encryptedData.data()), task->encryptedData.size());
                    ofs.close();
                }
                m_blockCache.clearDirtyFlag(file.fileId, task->blockIndex);
                blockIt->second.dirty = false;
            }
        } else {
            allSuccess = false;
        }
    }

    if (m_loggingEnabled) {
        for (auto& task : tasks) {
            if (task->success) {
                CryptoLogger::instance().logEncrypt(file.fileId, "", task->encryptedData.size(),
                                                     "", task->endTimeUs - task->startTimeUs, true, "");
            }
        }
    }

    return allSuccess;
}

ByteArray VirtualFS::computeFileHash(VirtualFile& file) {
    if (file.isDirectory) {
        ByteArray metaData;
        metaData.insert(metaData.end(), file.name.begin(), file.name.end());
        metaData.insert(metaData.end(), reinterpret_cast<uint8_t*>(&file.fileSize), reinterpret_cast<uint8_t*>(&file.fileSize) + sizeof(file.fileSize));
        return m_crypto.sm3Hash(metaData);
    }

    std::vector<uint8_t> accumulated;
    uint64_t totalBlocks = (file.fileSize + BLOCK_SIZE - 1) / BLOCK_SIZE;

    for (uint64_t i = 0; i < totalBlocks; ++i) {
        loadBlock(file, i);
        ByteArray* blockData = m_blockCache.get(file.fileId, i);
        if (blockData) {
            accumulated.insert(accumulated.end(), blockData->begin(), blockData->end());
        }
    }

    return m_crypto.sm3Hash(accumulated);
}

void VirtualFS::updateMetadataHash(VirtualFile& file) {
    if (!file.metadataDirty) {
        return;
    }

    file.metadata.file_size = file.fileSize;

    ByteArray fileHash = computeFileHash(file);
    if (fileHash.size() == SM3_DIGEST_LENGTH) {
        std::memcpy(file.metadata.sm3_hash, fileHash.data(), SM3_DIGEST_LENGTH);
    }

    ByteArray hashToSign(file.metadata.sm3_hash, file.metadata.sm3_hash + SM3_DIGEST_LENGTH);
    ByteArray signature = m_crypto.sm2Sign(hashToSign);
    if (signature.size() >= SM2_SIGNATURE_LENGTH) {
        std::memcpy(file.metadata.signature, signature.data(), SM2_SIGNATURE_LENGTH);
    }

    file.signatureValid = true;
    file.metadataDirty = false;
}

bool VirtualFS::verifyMetadataHash(const VirtualFile& file) {
    ByteArray hashToSign(file.metadata.sm3_hash, file.metadata.sm3_hash + SM3_DIGEST_LENGTH);
    ByteArray signature(file.metadata.signature, file.metadata.signature + SM2_SIGNATURE_LENGTH);
    return m_crypto.sm2Verify(hashToSign, signature);
}

bool VirtualFS::saveFileMetadata(const VirtualFile& file) {
    std::string metaPath = getMetaPath(file.fileId);
    std::ofstream ofs(metaPath, std::ios::binary);
    if (!ofs) {
        return false;
    }

    size_t nameLen = file.name.size();
    ofs.write(reinterpret_cast<const char*>(&nameLen), sizeof(nameLen));
    ofs.write(file.name.c_str(), nameLen);

    size_t fileIdLen = file.fileId.size();
    ofs.write(reinterpret_cast<const char*>(&fileIdLen), sizeof(fileIdLen));
    ofs.write(file.fileId.c_str(), fileIdLen);

    size_t keyIdLen = file.keyId.size();
    ofs.write(reinterpret_cast<const char*>(&keyIdLen), sizeof(keyIdLen));
    ofs.write(file.keyId.c_str(), keyIdLen);

    ofs.write(reinterpret_cast<const char*>(&file.fileSize), sizeof(file.fileSize));
    ofs.write(reinterpret_cast<const char*>(&file.isDirectory), sizeof(file.isDirectory));
    ofs.write(reinterpret_cast<const char*>(&file.metadata), sizeof(file.metadata));

    size_t keyLen = file.sm4Key.size();
    ofs.write(reinterpret_cast<const char*>(&keyLen), sizeof(keyLen));
    ofs.write(reinterpret_cast<const char*>(file.sm4Key.data()), keyLen);

    size_t wrappedKeyLen = file.wrappedKey.encryptedKey.size();
    ofs.write(reinterpret_cast<const char*>(&wrappedKeyLen), sizeof(wrappedKeyLen));
    ofs.write(reinterpret_cast<const char*>(file.wrappedKey.encryptedKey.data()), wrappedKeyLen);

    size_t wrappedIvLen = file.wrappedKey.iv.size();
    ofs.write(reinterpret_cast<const char*>(&wrappedIvLen), sizeof(wrappedIvLen));
    ofs.write(reinterpret_cast<const char*>(file.wrappedKey.iv.data()), wrappedIvLen);

    size_t masterKeyIdLen = file.wrappedKey.masterKeyId.size();
    ofs.write(reinterpret_cast<const char*>(&masterKeyIdLen), sizeof(masterKeyIdLen));
    ofs.write(file.wrappedKey.masterKeyId.c_str(), masterKeyIdLen);

    size_t blockCount = file.blocks.size();
    ofs.write(reinterpret_cast<const char*>(&blockCount), sizeof(blockCount));
    for (const auto& blockPair : file.blocks) {
        ofs.write(reinterpret_cast<const char*>(&blockPair.first), sizeof(blockPair.first));
        size_t ivLen = blockPair.second.iv.size();
        ofs.write(reinterpret_cast<const char*>(&ivLen), sizeof(ivLen));
        ofs.write(reinterpret_cast<const char*>(blockPair.second.iv.data()), ivLen);
    }

    size_t childrenCount = file.children.size();
    ofs.write(reinterpret_cast<const char*>(&childrenCount), sizeof(childrenCount));
    for (const auto& child : file.children) {
        size_t childLen = child.size();
        ofs.write(reinterpret_cast<const char*>(&childLen), sizeof(childLen));
        ofs.write(child.c_str(), childLen);
    }

    return true;
}

bool VirtualFS::loadFileMetadata(VirtualFile& file) {
    std::string metaPath = getMetaPath(file.fileId);
    std::ifstream ifs(metaPath, std::ios::binary);
    if (!ifs) {
        return false;
    }

    size_t nameLen;
    ifs.read(reinterpret_cast<char*>(&nameLen), sizeof(nameLen));
    file.name.resize(nameLen);
    ifs.read(&file.name[0], nameLen);

    size_t fileIdLen;
    ifs.read(reinterpret_cast<char*>(&fileIdLen), sizeof(fileIdLen));
    file.fileId.resize(fileIdLen);
    ifs.read(&file.fileId[0], fileIdLen);

    size_t keyIdLen;
    ifs.read(reinterpret_cast<char*>(&keyIdLen), sizeof(keyIdLen));
    file.keyId.resize(keyIdLen);
    ifs.read(&file.keyId[0], keyIdLen);

    ifs.read(reinterpret_cast<char*>(&file.fileSize), sizeof(file.fileSize));
    ifs.read(reinterpret_cast<char*>(&file.isDirectory), sizeof(file.isDirectory));
    ifs.read(reinterpret_cast<char*>(&file.metadata), sizeof(file.metadata));

    size_t keyLen;
    ifs.read(reinterpret_cast<char*>(&keyLen), sizeof(keyLen));
    file.sm4Key.resize(keyLen);
    ifs.read(reinterpret_cast<char*>(file.sm4Key.data()), keyLen);

    size_t wrappedKeyLen;
    ifs.read(reinterpret_cast<char*>(&wrappedKeyLen), sizeof(wrappedKeyLen));
    file.wrappedKey.encryptedKey.resize(wrappedKeyLen);
    ifs.read(reinterpret_cast<char*>(file.wrappedKey.encryptedKey.data()), wrappedKeyLen);

    size_t wrappedIvLen;
    ifs.read(reinterpret_cast<char*>(&wrappedIvLen), sizeof(wrappedIvLen));
    file.wrappedKey.iv.resize(wrappedIvLen);
    ifs.read(reinterpret_cast<char*>(file.wrappedKey.iv.data()), wrappedIvLen);

    size_t masterKeyIdLen;
    ifs.read(reinterpret_cast<char*>(&masterKeyIdLen), sizeof(masterKeyIdLen));
    file.wrappedKey.masterKeyId.resize(masterKeyIdLen);
    ifs.read(&file.wrappedKey.masterKeyId[0], masterKeyIdLen);

    size_t blockCount;
    ifs.read(reinterpret_cast<char*>(&blockCount), sizeof(blockCount));
    for (size_t i = 0; i < blockCount; ++i) {
        uint64_t blockIndex;
        ifs.read(reinterpret_cast<char*>(&blockIndex), sizeof(blockIndex));
        size_t ivLen;
        ifs.read(reinterpret_cast<char*>(&ivLen), sizeof(ivLen));
        BlockInfo bi;
        bi.blockIndex = blockIndex;
        bi.iv.resize(ivLen);
        ifs.read(reinterpret_cast<char*>(bi.iv.data()), ivLen);
        bi.dirty = false;
        bi.loaded = false;
        file.blocks[blockIndex] = bi;
    }

    size_t childrenCount;
    ifs.read(reinterpret_cast<char*>(&childrenCount), sizeof(childrenCount));
    file.children.reserve(childrenCount);
    for (size_t i = 0; i < childrenCount; ++i) {
        size_t childLen;
        ifs.read(reinterpret_cast<char*>(&childLen), sizeof(childLen));
        std::string child(childLen, '\0');
        ifs.read(&child[0], childLen);
        file.children.push_back(child);
    }

    file.metadataDirty = false;
    file.signatureValid = true;
    file.keyLoaded = !file.wrappedKey.encryptedKey.empty() || !file.sm4Key.empty();

    return true;
}

int VirtualFS::getattr(const std::string& path, struct stat* stbuf) {
    std::lock_guard<std::mutex> lock(m_mutex);
    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }

    std::memset(stbuf, 0, sizeof(struct stat));
    stbuf->st_mode = file->metadata.mode;
    stbuf->st_uid = file->metadata.uid;
    stbuf->st_gid = file->metadata.gid;
    stbuf->st_size = file->fileSize;
    stbuf->st_atime = file->metadata.access_time;
    stbuf->st_mtime = file->metadata.modify_time;
    stbuf->st_ctime = file->metadata.create_time;
    stbuf->st_nlink = file->isDirectory ? 2 : 1;

    return 0;
}

int VirtualFS::readdir(const std::string& path, std::vector<std::string>& entries) {
    std::lock_guard<std::mutex> lock(m_mutex);
    VirtualFile* dir = findFile(path);
    if (!dir || !dir->isDirectory) {
        return -ENOTDIR;
    }

    entries.push_back(".");
    entries.push_back("..");
    for (const auto& child : dir->children) {
        entries.push_back(child);
    }

    return 0;
}

int VirtualFS::create(const std::string& path, mode_t mode) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (findFile(path)) {
        return -EEXIST;
    }

    std::string parentPath = getParentPath(path);
    std::string fileName = getFileName(path);

    VirtualFile* parent = findFile(parentPath);
    if (!parent || !parent->isDirectory) {
        return -ENOENT;
    }

    auto file = std::make_unique<VirtualFile>();
    file->name = fileName;
    file->fileId = generateFileId();
    file->isDirectory = false;
    file->fileSize = 0;
    file->metadata.file_size = 0;
    file->metadata.mode = S_IFREG | mode;
    file->metadata.uid = getuid();
    file->metadata.gid = getgid();
    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    file->metadata.create_time = now;
    file->metadata.modify_time = now;
    file->metadata.access_time = now;

    ByteArray plainKey = m_crypto.generateSM4Key();
    if (m_kmsEnabled && m_kms) {
        wrapAndStoreKey(*file, plainKey);
    } else {
        file->sm4Key = plainKey;
    }

    file->metadataDirty = true;
    file->signatureValid = false;
    file->keyLoaded = true;

    parent->children.push_back(fileName);
    parent->metadataDirty = true;
    m_files[path] = std::move(file);

    if (m_loggingEnabled) {
        CryptoLogger::instance().logFileCreate(file->fileId, path);
    }

    return 0;
}

int VirtualFS::mkdir(const std::string& path, mode_t mode) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (findFile(path)) {
        return -EEXIST;
    }

    std::string parentPath = getParentPath(path);
    std::string dirName = getFileName(path);

    VirtualFile* parent = findFile(parentPath);
    if (!parent || !parent->isDirectory) {
        return -ENOENT;
    }

    auto dir = std::make_unique<VirtualFile>();
    dir->name = dirName;
    dir->fileId = generateFileId();
    dir->isDirectory = true;
    dir->fileSize = 4096;
    dir->metadata.file_size = 4096;
    dir->metadata.mode = S_IFDIR | mode;
    dir->metadata.uid = getuid();
    dir->metadata.gid = getgid();
    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    dir->metadata.create_time = now;
    dir->metadata.modify_time = now;
    dir->metadata.access_time = now;

    ByteArray plainKey = m_crypto.generateSM4Key();
    if (m_kmsEnabled && m_kms) {
        wrapAndStoreKey(*dir, plainKey);
    } else {
        dir->sm4Key = plainKey;
    }

    dir->metadataDirty = true;
    dir->signatureValid = false;
    dir->keyLoaded = true;

    parent->children.push_back(dirName);
    parent->metadataDirty = true;
    m_files[path] = std::move(dir);

    if (m_loggingEnabled) {
        CryptoLogger::instance().logFileCreate(dir->fileId, path);
    }

    return 0;
}

int VirtualFS::unlink(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }
    if (file->isDirectory) {
        return -EISDIR;
    }

    std::string fileId = file->fileId;

    for (const auto& blockPair : file->blocks) {
        std::string blockPath = getBlockPath(fileId, blockPair.first);
        unlink(blockPath.c_str());
    }

    std::string metaPath = getMetaPath(fileId);
    unlink(metaPath.c_str());

    m_blockCache.removeFile(fileId);

    if (m_kmsEnabled && m_kms) {
        m_kms->deleteFileKey(fileId);
    }

    std::string parentPath = getParentPath(path);
    std::string fileName = getFileName(path);

    VirtualFile* parent = findFile(parentPath);
    if (parent) {
        auto& children = parent->children;
        children.erase(std::remove(children.begin(), children.end(), fileName), children.end());
        parent->metadataDirty = true;
    }

    if (m_loggingEnabled) {
        CryptoLogger::instance().logFileDelete(fileId, path);
    }

    m_files.erase(path);
    return 0;
}

int VirtualFS::rmdir(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);

    if (path == "/") {
        return -EBUSY;
    }

    VirtualFile* dir = findFile(path);
    if (!dir) {
        return -ENOENT;
    }
    if (!dir->isDirectory) {
        return -ENOTDIR;
    }
    if (!dir->children.empty()) {
        return -ENOTEMPTY;
    }

    std::string fileId = dir->fileId;
    std::string metaPath = getMetaPath(fileId);
    unlink(metaPath.c_str());

    std::string parentPath = getParentPath(path);
    std::string dirName = getFileName(path);

    VirtualFile* parent = findFile(parentPath);
    if (parent) {
        auto& children = parent->children;
        children.erase(std::remove(children.begin(), children.end(), dirName), children.end());
        parent->metadataDirty = true;
    }

    m_files.erase(path);
    return 0;
}

int VirtualFS::read(const std::string& path, char* buf, size_t size, off_t offset) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file || file->isDirectory) {
        return -ENOENT;
    }

    if (static_cast<uint64_t>(offset) >= file->fileSize) {
        return 0;
    }

    size_t bytesToRead = std::min(size, static_cast<size_t>(file->fileSize - offset));
    size_t bytesRead = 0;

    while (bytesRead < bytesToRead) {
        uint64_t blockIndex = (offset + bytesRead) / BLOCK_SIZE;
        size_t blockOffset = (offset + bytesRead) % BLOCK_SIZE;
        size_t bytesInBlock = std::min(BLOCK_SIZE - blockOffset, bytesToRead - bytesRead);

        if (!loadBlock(*file, blockIndex)) {
            std::memset(buf + bytesRead, 0, bytesInBlock);
        } else {
            ByteArray* blockData = m_blockCache.get(file->fileId, blockIndex);
            if (blockData) {
                size_t copySize = std::min(bytesInBlock, blockData->size() - blockOffset);
                std::memcpy(buf + bytesRead, blockData->data() + blockOffset, copySize);
                if (copySize < bytesInBlock) {
                    std::memset(buf + bytesRead + copySize, 0, bytesInBlock - copySize);
                }
            } else {
                std::memset(buf + bytesRead, 0, bytesInBlock);
            }
        }

        bytesRead += bytesInBlock;
    }

    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    file->metadata.access_time = now;

    return static_cast<int>(bytesRead);
}

int VirtualFS::write(const std::string& path, const char* buf, size_t size, off_t offset) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file || file->isDirectory) {
        return -ENOENT;
    }

    uint64_t newEnd = offset + size;
    if (newEnd > file->fileSize) {
        file->fileSize = newEnd;
    }

    size_t bytesWritten = 0;

    while (bytesWritten < size) {
        uint64_t blockIndex = (offset + bytesWritten) / BLOCK_SIZE;
        size_t blockOffset = (offset + bytesWritten) % BLOCK_SIZE;
        size_t bytesInBlock = std::min(BLOCK_SIZE - blockOffset, size - bytesWritten);

        auto blockIt = file->blocks.find(blockIndex);
        if (blockIt == file->blocks.end()) {
            BlockInfo bi;
            bi.blockIndex = blockIndex;
            bi.dirty = true;
            bi.loaded = true;
            bi.iv = m_crypto.generateRandomIV();
            file->blocks[blockIndex] = bi;

            ByteArray newBlock(BLOCK_SIZE, 0);
            std::memcpy(newBlock.data() + blockOffset, buf + bytesWritten, bytesInBlock);
            m_blockCache.put(file->fileId, blockIndex, newBlock);
            m_blockCache.markDirty(file->fileId, blockIndex);
        } else {
            loadBlock(*file, blockIndex);
            ByteArray* blockData = m_blockCache.get(file->fileId, blockIndex);
            if (blockData) {
                if (blockData->size() < BLOCK_SIZE) {
                    blockData->resize(BLOCK_SIZE, 0);
                }
                std::memcpy(blockData->data() + blockOffset, buf + bytesWritten, bytesInBlock);
                m_blockCache.markDirty(file->fileId, blockIndex);
                blockIt->second.dirty = true;
            }
        }

        bytesWritten += bytesInBlock;
    }

    file->metadataDirty = true;
    file->signatureValid = false;
    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    file->metadata.modify_time = now;
    file->metadata.access_time = now;

    return static_cast<int>(size);
}

int VirtualFS::truncate(const std::string& path, off_t size) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file || file->isDirectory) {
        return -ENOENT;
    }

    uint64_t oldSize = file->fileSize;
    uint64_t newSize = static_cast<uint64_t>(size);

    if (newSize < oldSize) {
        uint64_t lastBlock = (newSize + BLOCK_SIZE - 1) / BLOCK_SIZE;
        for (auto it = file->blocks.begin(); it != file->blocks.end(); ) {
            if (it->first >= lastBlock) {
                std::string blockPath = getBlockPath(file->fileId, it->first);
                unlink(blockPath.c_str());
                it = file->blocks.erase(it);
            } else {
                ++it;
            }
        }

        if (newSize > 0) {
            uint64_t lastBlockIdx = (newSize - 1) / BLOCK_SIZE;
            size_t blockRemainder = newSize % BLOCK_SIZE;
            if (blockRemainder > 0) {
                loadBlock(*file, lastBlockIdx);
                ByteArray* blockData = m_blockCache.get(file->fileId, lastBlockIdx);
                if (blockData && blockData->size() > blockRemainder) {
                    blockData->resize(blockRemainder);
                    m_blockCache.markDirty(file->fileId, lastBlockIdx);
                    auto blockIt = file->blocks.find(lastBlockIdx);
                    if (blockIt != file->blocks.end()) {
                        blockIt->second.dirty = true;
                    }
                }
            }
        }
    }

    file->fileSize = newSize;
    file->metadataDirty = true;
    file->signatureValid = false;
    auto now = std::chrono::system_clock::to_time_t(std::chrono::system_clock::now());
    file->metadata.modify_time = now;

    return 0;
}

int VirtualFS::utimens(const std::string& path, const struct timespec tv[2]) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }

    if (tv) {
        file->metadata.access_time = tv[0].tv_sec;
        file->metadata.modify_time = tv[1].tv_sec;
    }

    return 0;
}

int VirtualFS::chmod(const std::string& path, mode_t mode) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }

    file->metadata.mode = (file->metadata.mode & ~07777) | (mode & 07777);
    file->metadataDirty = true;

    return 0;
}

int VirtualFS::chown(const std::string& path, uid_t uid, gid_t gid) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }

    file->metadata.uid = uid;
    file->metadata.gid = gid;
    file->metadataDirty = true;

    return 0;
}

int VirtualFS::fsync(const std::string& path) {
    std::lock_guard<std::mutex> lock(m_mutex);

    VirtualFile* file = findFile(path);
    if (!file) {
        return -ENOENT;
    }

    bool saveResult;
    if (m_parallelCryptoEnabled) {
        saveResult = saveAllBlocksParallel(*file);
    } else {
        saveResult = saveAllBlocks(*file);
    }

    if (!saveResult) {
        return -EIO;
    }

    if (file->metadataDirty) {
        updateMetadataHash(*file);
        if (!saveFileMetadata(*file)) {
            return -EIO;
        }
    }

    return 0;
}

bool VirtualFS::saveToStorage() {
    std::lock_guard<std::mutex> lock(m_mutex);

    for (const auto& entry : m_files) {
        VirtualFile* file = entry.second.get();

        if (!saveAllBlocks(*file)) {
            std::cerr << "Warning: Failed to save blocks for " << file->name << std::endl;
        }

        if (file->metadataDirty || !file->signatureValid) {
            updateMetadataHash(*file);
        }

        if (!saveFileMetadata(*file)) {
            std::cerr << "Warning: Failed to save metadata for " << file->name << std::endl;
        }
    }

    std::ofstream ofs(m_storagePath + "/filesystem_index.dat", std::ios::binary);
    if (!ofs) {
        return false;
    }

    size_t fileCount = m_files.size();
    ofs.write(reinterpret_cast<const char*>(&fileCount), sizeof(fileCount));

    for (const auto& entry : m_files) {
        size_t pathLen = entry.first.size();
        ofs.write(reinterpret_cast<const char*>(&pathLen), sizeof(pathLen));
        ofs.write(entry.first.c_str(), pathLen);

        size_t fileIdLen = entry.second->fileId.size();
        ofs.write(reinterpret_cast<const char*>(&fileIdLen), sizeof(fileIdLen));
        ofs.write(entry.second->fileId.c_str(), fileIdLen);
    }

    return true;
}

bool VirtualFS::loadFromStorage() {
    std::lock_guard<std::mutex> lock(m_mutex);

    std::ifstream ifs(m_storagePath + "/filesystem_index.dat", std::ios::binary);
    if (!ifs) {
        return false;
    }

    m_files.clear();
    m_blockCache.clear();

    size_t fileCount;
    ifs.read(reinterpret_cast<char*>(&fileCount), sizeof(fileCount));

    for (size_t i = 0; i < fileCount; ++i) {
        size_t pathLen;
        ifs.read(reinterpret_cast<char*>(&pathLen), sizeof(pathLen));
        std::string path(pathLen, '\0');
        ifs.read(&path[0], pathLen);

        size_t fileIdLen;
        ifs.read(reinterpret_cast<char*>(&fileIdLen), sizeof(fileIdLen));
        std::string fileId(fileIdLen, '\0');
        ifs.read(&fileId[0], fileIdLen);

        auto file = std::make_unique<VirtualFile>();
        file->fileId = fileId;

        if (!loadFileMetadata(*file)) {
            std::cerr << "Warning: Failed to load metadata for " << path << std::endl;
            continue;
        }

        m_files[path] = std::move(file);
    }

    return !m_files.empty();
}
