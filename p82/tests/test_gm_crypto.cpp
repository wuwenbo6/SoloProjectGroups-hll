#include "gm_crypto.h"
#include <iostream>
#include <cassert>
#include <cstring>

bool testSM3() {
    std::cout << "测试 SM3 哈希... ";
    GMCrypto crypto;
    crypto.init();

    std::string testStr = "Hello, World!";
    ByteArray data(testStr.begin(), testStr.end());

    ByteArray hash = crypto.sm3Hash(data);
    if (hash.size() != SM3_DIGEST_LENGTH) {
        std::cout << "失败: 哈希长度错误\n";
        return false;
    }

    if (!crypto.sm3Verify(data, hash)) {
        std::cout << "失败: 哈希验证失败\n";
        return false;
    }

    std::cout << "成功\n";
    return true;
}

bool testSM4() {
    std::cout << "测试 SM4 加解密... ";
    GMCrypto crypto;
    crypto.init();

    std::string testStr = "This is a test message for SM4 encryption!";
    ByteArray plaintext(testStr.begin(), testStr.end());

    ByteArray key = crypto.generateSM4Key();
    ByteArray iv = crypto.generateRandomIV();

    if (key.size() != SM4_KEY_LENGTH || iv.size() != SM4_IV_LENGTH) {
        std::cout << "失败: 密钥或IV生成失败\n";
        return false;
    }

    ByteArray ciphertext = crypto.sm4Encrypt(plaintext, key, iv);
    if (ciphertext.empty()) {
        std::cout << "失败: 加密失败\n";
        return false;
    }

    ByteArray decrypted = crypto.sm4Decrypt(ciphertext, key, iv);
    if (decrypted.empty()) {
        std::cout << "失败: 解密失败\n";
        return false;
    }

    if (decrypted != plaintext) {
        std::cout << "失败: 解密结果不匹配\n";
        return false;
    }

    std::cout << "成功\n";
    return true;
}

bool testSM2() {
    std::cout << "测试 SM2 签名验签... ";
    GMCrypto crypto;
    crypto.init();

    if (!crypto.generateSM2KeyPair("/tmp/test_sm2_key.pem", "/tmp/test_sm2_pub.pem")) {
        std::cout << "失败: 密钥对生成失败\n";
        return false;
    }

    std::string testStr = "Message to be signed";
    ByteArray data(testStr.begin(), testStr.end());

    ByteArray signature = crypto.sm2Sign(data);
    if (signature.empty()) {
        std::cout << "失败: 签名失败\n";
        return false;
    }

    if (!crypto.sm2Verify(data, signature)) {
        std::cout << "失败: 验签失败\n";
        return false;
    }

    std::string wrongStr = "Wrong message";
    ByteArray wrongData(wrongStr.begin(), wrongStr.end());
    if (crypto.sm2Verify(wrongData, signature)) {
        std::cout << "失败: 错误消息验签不应通过\n";
        return false;
    }

    std::cout << "成功\n";
    return true;
}

bool testCert() {
    std::cout << "测试国密证书生成... ";
    GMCrypto crypto;
    crypto.init();

    if (!crypto.createSelfSignedCert("/tmp/test_sm2_cert.pem", "/tmp/test_cert_key.pem", "Test CN")) {
        std::cout << "失败: 证书生成失败\n";
        return false;
    }

    if (!crypto.loadSM2Certificate("/tmp/test_sm2_cert.pem")) {
        std::cout << "失败: 证书加载失败\n";
        return false;
    }

    std::cout << "成功\n";
    return true;
}

int main() {
    std::cout << "=== 国密算法单元测试 ===\n\n";

    bool allPassed = true;
    allPassed &= testSM3();
    allPassed &= testSM4();
    allPassed &= testSM2();
    allPassed &= testCert();

    std::cout << "\n=== 测试结果: " << (allPassed ? "全部通过" : "有失败") << " ===\n";
    return allPassed ? 0 : 1;
}
