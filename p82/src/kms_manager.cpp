#include "kms_manager.h"
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <random>
#include <ctime>

KMSManager::KMSManager(const std::string& storagePath, GMCrypto& crypto)
    : m_storagePath(storagePath), m_crypto(crypto), m_cacheTimeout(3600), m_initialized(false) {
    m_keyStorePath = m_storagePath + "/keystore.dat";
}

KMSManager::~KMSManager() {
    if (m_initialized) {
        saveKeyStore();
    }
    m_masterKey.clear();
    m_kekDerived.clear();
}

std::string KMSManager::generateKeyId() {
    std::stringstream ss;
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<uint32_t> dis;
    ss << "key_" << std::hex << dis(gen) << "_" << dis(gen);
    return ss.str();
}

std::string KMSManager::getCurrentTimestamp() {
    auto now = std::chrono::system_clock::now();
    std::time_t nowTime = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << std::put_time(std::localtime(&nowTime), "%Y-%m-%d %H:%M:%S");
    return ss.str();
}

bool KMSManager::ensureKekDerived() {
    if (m_masterKey.empty()) {
        return false;
    }
    if (!m_kekDerived.empty()) {
        return true;
    }
    ByteArray keyMaterial = m_masterKey;
    while (keyMaterial.size() < SM4_KEY_LENGTH * 2) {
        ByteArray hash = m_crypto.sm3Hash(keyMaterial);
        keyMaterial.insert(keyMaterial.end(), hash.begin(), hash.end());
    }
    m_kekDerived.assign(keyMaterial.begin(), keyMaterial.begin() + SM4_KEY_LENGTH);
    return true;
}

bool KMSManager::init() {
    struct stat st;
    if (stat(m_storagePath.c_str(), &st) != 0) {
        if (mkdir(m_storagePath.c_str(), 0700) != 0) {
            return false;
        }
    }
    loadKeyStore();
    m_initialized = true;
    return true;
}

bool KMSManager::loadMasterKey(const std::string& masterKeyFile) {
    std::ifstream ifs(masterKeyFile, std::ios::binary);
    if (!ifs) {
        return false;
    }
    ifs.seekg(0, std::ios::end);
    size_t keySize = ifs.tellg();
    ifs.seekg(0, std::ios::beg);
    m_masterKey.resize(keySize);
    ifs.read(reinterpret_cast<char*>(m_masterKey.data()), keySize);
    ifs.close();
    m_kekDerived.clear();
    ensureKekDerived();
    m_lastMasterKeyUse = std::chrono::steady_clock::now();
    std::ifstream idFile(masterKeyFile + ".id");
    if (idFile) {
        std::getline(idFile, m_masterKeyId);
        idFile.close();
    } else {
        m_masterKeyId = generateKeyId();
    }
    return !m_masterKey.empty();
}

bool KMSManager::generateMasterKey(const std::string& masterKeyFile, const std::string& keyId) {
    ByteArray newKey = m_crypto.generateSM4Key();
    if (newKey.empty()) {
        return false;
    }
    std::ofstream ofs(masterKeyFile, std::ios::binary);
    if (!ofs) {
        return false;
    }
    ofs.write(reinterpret_cast<const char*>(newKey.data()), newKey.size());
    ofs.close();
    m_masterKeyId = keyId.empty() ? generateKeyId() : keyId;
    std::ofstream idFile(masterKeyFile + ".id");
    if (idFile) {
        idFile << m_masterKeyId;
        idFile.close();
    }
    m_masterKey = newKey;
    m_kekDerived.clear();
    ensureKekDerived();
    m_lastMasterKeyUse = std::chrono::steady_clock::now();
    return true;
}

WrappedKey KMSManager::wrapKey(const ByteArray& plainKey, KeyType type) {
    WrappedKey result;
    if (!ensureKekDerived()) {
        return result;
    }
    result.iv = m_crypto.generateRandomIV();
    if (result.iv.empty()) {
        return result;
    }
    result.encryptedKey = m_crypto.sm4Encrypt(plainKey, m_kekDerived, result.iv);
    result.masterKeyId = m_masterKeyId;
    m_lastMasterKeyUse = std::chrono::steady_clock::now();
    return result;
}

ByteArray KMSManager::unwrapKey(const WrappedKey& wrapped) {
    if (!ensureKekDerived()) {
        return ByteArray();
    }
    ByteArray result = m_crypto.sm4Decrypt(wrapped.encryptedKey, m_kekDerived, wrapped.iv);
    m_lastMasterKeyUse = std::chrono::steady_clock::now();
    return result;
}

std::string KMSManager::registerFileKey(const std::string& fileId, const WrappedKey& wrappedKey) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::string keyId = generateKeyId();
    KeyInfo info;
    info.keyId = keyId;
    info.type = KeyType::SM4_FILE_KEY;
    info.wrappedKey = wrappedKey.encryptedKey;
    info.createdAt = getCurrentTimestamp();
    info.lastUsed = getCurrentTimestamp();
    info.usageCount = 0;
    info.active = true;
    m_keyStore[keyId] = info;
    m_fileKeys[fileId] = wrappedKey;
    saveKeyStore();
    return keyId;
}

WrappedKey KMSManager::getFileKey(const std::string& fileId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_fileKeys.find(fileId);
    if (it != m_fileKeys.end()) {
        return it->second;
    }
    return WrappedKey();
}

bool KMSManager::deleteFileKey(const std::string& fileId) {
    std::lock_guard<std::mutex> lock(m_mutex);
    auto it = m_fileKeys.find(fileId);
    if (it != m_fileKeys.end()) {
        m_fileKeys.erase(it);
        saveKeyStore();
        return true;
    }
    return false;
}

bool KMSManager::rotateMasterKey(const std::string& newMasterKeyFile) {
    std::lock_guard<std::mutex> lock(m_mutex);
    ByteArray oldMasterKey = m_masterKey;
    ByteArray oldKek = m_kekDerived;
    std::string oldMasterKeyId = m_masterKeyId;
    if (!loadMasterKey(newMasterKeyFile)) {
        m_masterKey = oldMasterKey;
        m_kekDerived = oldKek;
        m_masterKeyId = oldMasterKeyId;
        return false;
    }
    return rewrapAllKeys();
}

bool KMSManager::rewrapAllKeys() {
    std::lock_guard<std::mutex> lock(m_mutex);
    ByteArray oldKek = m_kekDerived;
    ensureKekDerived();
    for (auto& entry : m_fileKeys) {
        if (entry.second.masterKeyId != m_masterKeyId) {
            ByteArray plainKey = m_crypto.sm4Decrypt(entry.second.encryptedKey, oldKek, entry.second.iv);
            if (plainKey.empty()) {
                continue;
            }
            ByteArray newIv = m_crypto.generateRandomIV();
            ByteArray newEncrypted = m_crypto.sm4Encrypt(plainKey, m_kekDerived, newIv);
            if (!newEncrypted.empty()) {
                entry.second.encryptedKey = newEncrypted;
                entry.second.iv = newIv;
                entry.second.masterKeyId = m_masterKeyId;
            }
        }
    }
    saveKeyStore();
    return true;
}

std::vector<KeyInfo> KMSManager::listKeys() {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::vector<KeyInfo> result;
    for (const auto& entry : m_keyStore) {
        result.push_back(entry.second);
    }
    return result;
}

bool KMSManager::exportKeyStore(const std::string& exportFile, const std::string& password) {
    std::lock_guard<std::mutex> lock(m_mutex);
    ByteArray passwordData(password.begin(), password.end());
    ByteArray kek = m_crypto.sm3Hash(passwordData);
    kek.resize(SM4_KEY_LENGTH);
    ByteArray iv = m_crypto.generateRandomIV();
    std::stringstream ss;
    for (const auto& entry : m_fileKeys) {
        ss << entry.first << "|";
        ss << entry.second.masterKeyId << "|";
        ss << entry.second.iv.size() << "|";
        ss.write(reinterpret_cast<const char*>(entry.second.iv.data()), entry.second.iv.size());
        ss << "|";
        ss << entry.second.encryptedKey.size() << "|";
        ss.write(reinterpret_cast<const char*>(entry.second.encryptedKey.data()), entry.second.encryptedKey.size());
        ss << "\n";
    }
    std::string data = ss.str();
    ByteArray plainData(data.begin(), data.end());
    ByteArray encrypted = m_crypto.sm4Encrypt(plainData, kek, iv);
    std::ofstream ofs(exportFile, std::ios::binary);
    if (!ofs) {
        return false;
    }
    ofs.write(reinterpret_cast<const char*>(iv.data()), iv.size());
    ofs.write(reinterpret_cast<const char*>(encrypted.data()), encrypted.size());
    return true;
}

bool KMSManager::importKeyStore(const std::string& importFile, const std::string& password) {
    std::lock_guard<std::mutex> lock(m_mutex);
    std::ifstream ifs(importFile, std::ios::binary);
    if (!ifs) {
        return false;
    }
    ByteArray iv(SM4_IV_LENGTH);
    ifs.read(reinterpret_cast<char*>(iv.data()), SM4_IV_LENGTH);
    ifs.seekg(0, std::ios::end);
    size_t dataSize = static_cast<size_t>(ifs.tellg()) - SM4_IV_LENGTH;
    ifs.seekg(SM4_IV_LENGTH, std::ios::beg);
    ByteArray encrypted(dataSize);
    ifs.read(reinterpret_cast<char*>(encrypted.data()), dataSize);
    ByteArray passwordData(password.begin(), password.end());
    ByteArray kek = m_crypto.sm3Hash(passwordData);
    kek.resize(SM4_KEY_LENGTH);
    ByteArray plainData = m_crypto.sm4Decrypt(encrypted, kek, iv);
    if (plainData.empty()) {
        return false;
    }
    return true;
}

void KMSManager::setMasterKeyCacheTimeout(size_t seconds) {
    m_cacheTimeout = seconds;
}

void KMSManager::clearKeyCache() {
    std::lock_guard<std::mutex> lock(m_mutex);
    m_masterKey.clear();
    m_kekDerived.clear();
}

bool KMSManager::loadKeyStore() {
    std::ifstream ifs(m_keyStorePath, std::ios::binary);
    if (!ifs) {
        return false;
    }
    size_t fileKeyCount;
    ifs.read(reinterpret_cast<char*>(&fileKeyCount), sizeof(fileKeyCount));
    for (size_t i = 0; i < fileKeyCount; ++i) {
        size_t fileIdLen;
        ifs.read(reinterpret_cast<char*>(&fileIdLen), sizeof(fileIdLen));
        std::string fileId(fileIdLen, '\0');
        ifs.read(&fileId[0], fileIdLen);
        size_t masterKeyIdLen;
        ifs.read(reinterpret_cast<char*>(&masterKeyIdLen), sizeof(masterKeyIdLen));
        std::string masterKeyId(masterKeyIdLen, '\0');
        ifs.read(&masterKeyId[0], masterKeyIdLen);
        size_t ivLen;
        ifs.read(reinterpret_cast<char*>(&ivLen), sizeof(ivLen));
        ByteArray iv(ivLen);
        ifs.read(reinterpret_cast<char*>(iv.data()), ivLen);
        size_t keyLen;
        ifs.read(reinterpret_cast<char*>(&keyLen), sizeof(keyLen));
        ByteArray encryptedKey(keyLen);
        ifs.read(reinterpret_cast<char*>(encryptedKey.data()), keyLen);
        WrappedKey wk;
        wk.masterKeyId = masterKeyId;
        wk.iv = iv;
        wk.encryptedKey = encryptedKey;
        m_fileKeys[fileId] = wk;
    }
    return true;
}

bool KMSManager::saveKeyStore() {
    std::ofstream ofs(m_keyStorePath, std::ios::binary);
    if (!ofs) {
        return false;
    }
    size_t fileKeyCount = m_fileKeys.size();
    ofs.write(reinterpret_cast<const char*>(&fileKeyCount), sizeof(fileKeyCount));
    for (const auto& entry : m_fileKeys) {
        size_t fileIdLen = entry.first.size();
        ofs.write(reinterpret_cast<const char*>(&fileIdLen), sizeof(fileIdLen));
        ofs.write(entry.first.c_str(), fileIdLen);
        size_t masterKeyIdLen = entry.second.masterKeyId.size();
        ofs.write(reinterpret_cast<const char*>(&masterKeyIdLen), sizeof(masterKeyIdLen));
        ofs.write(entry.second.masterKeyId.c_str(), masterKeyIdLen);
        size_t ivLen = entry.second.iv.size();
        ofs.write(reinterpret_cast<const char*>(&ivLen), sizeof(ivLen));
        ofs.write(reinterpret_cast<const char*>(entry.second.iv.data()), ivLen);
        size_t keyLen = entry.second.encryptedKey.size();
        ofs.write(reinterpret_cast<const char*>(&keyLen), sizeof(keyLen));
        ofs.write(reinterpret_cast<const char*>(entry.second.encryptedKey.data()), keyLen);
    }
    return true;
}
