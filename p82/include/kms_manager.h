#ifndef KMS_MANAGER_H
#define KMS_MANAGER_H

#include "common.h"
#include "gm_crypto.h"
#include <map>
#include <string>
#include <mutex>
#include <memory>
#include <chrono>
#include <vector>

enum class KeyType {
    SM4_FILE_KEY,
    SM2_SIGNING_KEY,
    MASTER_KEY
};

struct KeyInfo {
    std::string keyId;
    KeyType type;
    ByteArray wrappedKey;
    std::string createdAt;
    std::string lastUsed;
    uint64_t usageCount;
    bool active;
};

struct WrappedKey {
    ByteArray encryptedKey;
    ByteArray iv;
    std::string masterKeyId;
};

class KMSManager {
public:
    KMSManager(const std::string& storagePath, GMCrypto& crypto);
    ~KMSManager();

    bool init();
    bool loadMasterKey(const std::string& masterKeyFile);
    bool generateMasterKey(const std::string& masterKeyFile, const std::string& keyId);

    WrappedKey wrapKey(const ByteArray& plainKey, KeyType type);
    ByteArray unwrapKey(const WrappedKey& wrapped);

    std::string registerFileKey(const std::string& fileId, const WrappedKey& wrappedKey);
    WrappedKey getFileKey(const std::string& fileId);
    bool deleteFileKey(const std::string& fileId);

    bool rotateMasterKey(const std::string& newMasterKeyFile);
    bool rewrapAllKeys();

    std::vector<KeyInfo> listKeys();
    bool exportKeyStore(const std::string& exportFile, const std::string& password);
    bool importKeyStore(const std::string& importFile, const std::string& password);

    void setMasterKeyCacheTimeout(size_t seconds);
    void clearKeyCache();

    std::string getCurrentMasterKeyId() const { return m_masterKeyId; }
    size_t getManagedKeyCount() const { return m_keyStore.size(); }

private:
    std::string generateKeyId();
    std::string getCurrentTimestamp();
    bool loadKeyStore();
    bool saveKeyStore();
    bool ensureKekDerived();

    std::string m_storagePath;
    std::string m_keyStorePath;
    GMCrypto& m_crypto;

    std::string m_masterKeyId;
    ByteArray m_masterKey;
    ByteArray m_kekDerived;

    std::map<std::string, KeyInfo> m_keyStore;
    std::map<std::string, WrappedKey> m_fileKeys;

    size_t m_cacheTimeout;
    std::chrono::steady_clock::time_point m_lastMasterKeyUse;

    mutable std::mutex m_mutex;
    bool m_initialized;
};

#endif
