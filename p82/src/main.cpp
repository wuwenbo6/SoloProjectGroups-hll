#include "fuse_operations.h"
#include "performance_test.h"
#include <iostream>
#include <cstring>
#include <unistd.h>
#include <sys/stat.h>
#include <getopt.h>

void printUsage(const char* progName) {
    std::cout << "使用方法: " << progName << " [选项] <挂载点>\n\n"
              << "选项:\n"
              << "  -h, --help              显示帮助信息\n"
              << "  -v, --version           显示版本信息\n"
              << "  -s, --storage <路径>    指定数据存储目录 (默认: ./data)\n"
              << "  -k, --key <文件>        指定SM2私钥文件 (默认: ./certs/sm2_key.pem)\n"
              << "  -c, --cert <文件>       指定国密证书文件 (可选)\n"
              << "  -f, --foreground        前台运行\n"
              << "  -d, --debug             调试模式\n"
              << "  -g, --gen-key           生成SM2密钥对\n"
              << "  -r, --gen-cert          生成自签名国密证书\n"
              << "  -t, --test              运行性能测试\n"
              << "  --test-size <KB>        性能测试数据大小 (默认: 1024 KB)\n"
              << "  --test-iter <次数>      性能测试迭代次数 (默认: 10)\n"
              << "\nKMS 密钥托管选项:\n"
              << "  --enable-kms            启用KMS密钥托管\n"
              << "  --master-key <文件>     指定KMS主密钥文件\n"
              << "  --gen-master-key        生成新的KMS主密钥\n"
              << "  --rotate-master-key <新密钥>  轮换KMS主密钥\n"
              << "\n并行加密选项:\n"
              << "  --parallel              启用多线程并行加密\n"
              << "  --threads <数量>        并行线程数 (默认: CPU核心数)\n"
              << "\n日志选项:\n"
              << "  --log-path <路径>       加密日志输出目录 (默认: ./logs)\n"
              << "  --enable-log            启用加密操作日志\n"
              << "  --export-log <文件>     导出加密日志到文件\n"
              << "  --log-format <格式>     日志格式: json/csv (默认: json)\n\n"
              << "示例:\n"
              << "  " << progName << " -g -k ./certs/my_key.pem\n"
              << "  " << progName << " -r -c ./certs/my_cert.pem -k ./certs/my_key.pem\n"
              << "  " << progName << " --enable-kms --master-key ./kms/master.key --parallel --enable-log /mnt/gm_fuse\n"
              << "  " << progName << " -s ./data -k ./certs/sm2_key.pem /mnt/gm_fuse\n"
              << "  " << progName << " -t --test-size 4096\n";
}

void printVersion() {
    std::cout << "GM-FUSE 国密加密虚拟文件系统 v1.0.0\n"
              << "Copyright (c) 2024\n"
              << "支持: SM2签名, SM3哈希, SM4加密\n";
}



int main(int argc, char* argv[]) {
    FuseContext ctx;
    ctx.storagePath = "./data";
    ctx.keyFile = "./certs/sm2_key.pem";
    ctx.certFile = "";
    ctx.masterKeyFile = "./kms/master.key";
    ctx.logPath = "./logs";
    ctx.foreground = false;
    ctx.debug = false;
    ctx.enableKMS = false;
    ctx.enableParallelCrypto = false;
    ctx.enableLogging = false;
    ctx.parallelThreads = 0;

    bool genKey = false;
    bool genCert = false;
    bool runTest = false;
    size_t testSizeKB = 1024;
    int testIter = 10;

    bool genMasterKey = false;
    std::string rotateMasterKeyFile;
    std::string exportLogFile;
    std::string logFormat = "json";

    static struct option longOptions[] = {
        {"help", no_argument, 0, 'h'},
        {"version", no_argument, 0, 'v'},
        {"storage", required_argument, 0, 's'},
        {"key", required_argument, 0, 'k'},
        {"cert", required_argument, 0, 'c'},
        {"foreground", no_argument, 0, 'f'},
        {"debug", no_argument, 0, 'd'},
        {"gen-key", no_argument, 0, 'g'},
        {"gen-cert", no_argument, 0, 'r'},
        {"test", no_argument, 0, 't'},
        {"test-size", required_argument, 0, 1000},
        {"test-iter", required_argument, 0, 1001},
        {"enable-kms", no_argument, 0, 1002},
        {"master-key", required_argument, 0, 1003},
        {"gen-master-key", no_argument, 0, 1004},
        {"rotate-master-key", required_argument, 0, 1005},
        {"parallel", no_argument, 0, 1006},
        {"threads", required_argument, 0, 1007},
        {"log-path", required_argument, 0, 1008},
        {"enable-log", no_argument, 0, 1009},
        {"export-log", required_argument, 0, 1010},
        {"log-format", required_argument, 0, 1011},
        {0, 0, 0, 0}
    };

    int opt;
    int optionIndex = 0;
    while ((opt = getopt_long(argc, argv, "hvs:k:c:fdgrt", longOptions, &optionIndex)) != -1) {
        switch (opt) {
            case 'h':
                printUsage(argv[0]);
                return 0;
            case 'v':
                printVersion();
                return 0;
            case 's':
                ctx.storagePath = optarg;
                break;
            case 'k':
                ctx.keyFile = optarg;
                break;
            case 'c':
                ctx.certFile = optarg;
                break;
            case 'f':
                ctx.foreground = true;
                break;
            case 'd':
                ctx.debug = true;
                ctx.foreground = true;
                break;
            case 'g':
                genKey = true;
                break;
            case 'r':
                genCert = true;
                break;
            case 't':
                runTest = true;
                break;
            case 1000:
                testSizeKB = std::stoul(optarg);
                break;
            case 1001:
                testIter = std::stoi(optarg);
                break;
            case 1002:
                ctx.enableKMS = true;
                break;
            case 1003:
                ctx.masterKeyFile = optarg;
                break;
            case 1004:
                genMasterKey = true;
                break;
            case 1005:
                rotateMasterKeyFile = optarg;
                break;
            case 1006:
                ctx.enableParallelCrypto = true;
                break;
            case 1007:
                ctx.parallelThreads = std::stoul(optarg);
                break;
            case 1008:
                ctx.logPath = optarg;
                break;
            case 1009:
                ctx.enableLogging = true;
                break;
            case 1010:
                exportLogFile = optarg;
                break;
            case 1011:
                logFormat = optarg;
                break;
            default:
                printUsage(argv[0]);
                return 1;
        }
    }

    ctx.crypto = std::make_unique<GMCrypto>();
    ctx.crypto->init();

    if (ctx.enableKMS) {
        ctx.kms = std::make_unique<KMSManager>(ctx.storagePath + "/kms", *ctx.crypto);
        ctx.kms->init();

        if (genMasterKey) {
            std::cout << "正在生成KMS主密钥...\n";
            struct stat st;
            std::string kmsDir = ctx.masterKeyFile.substr(0, ctx.masterKeyFile.find_last_of('/'));
            if (!kmsDir.empty() && stat(kmsDir.c_str(), &st) != 0) {
                mkdir(kmsDir.c_str(), 0700);
            }
            if (ctx.kms->generateMasterKey(ctx.masterKeyFile, "master_v1")) {
                std::cout << "KMS主密钥生成成功: " << ctx.masterKeyFile << "\n";
            } else {
                std::cerr << "KMS主密钥生成失败!\n";
                return 1;
            }
            return 0;
        }

        if (!rotateMasterKeyFile.empty()) {
            std::cout << "正在轮换KMS主密钥...\n";
            if (!ctx.kms->loadMasterKey(ctx.masterKeyFile)) {
                std::cerr << "加载当前主密钥失败!\n";
                return 1;
            }
            if (ctx.kms->rotateMasterKey(rotateMasterKeyFile)) {
                std::cout << "主密钥轮换成功!\n";
            } else {
                std::cerr << "主密钥轮换失败!\n";
                return 1;
            }
            return 0;
        }

        std::cout << "加载KMS主密钥...\n";
        if (!ctx.kms->loadMasterKey(ctx.masterKeyFile)) {
            std::cerr << "警告: 加载KMS主密钥失败，尝试生成新密钥...\n";
            if (!ctx.kms->generateMasterKey(ctx.masterKeyFile, "master_v1")) {
                std::cerr << "KMS主密钥生成失败!\n";
                return 1;
            }
        }
        std::cout << "KMS主密钥ID: " << ctx.kms->getCurrentMasterKeyId() << "\n";
    }

    if (ctx.enableLogging) {
        std::cout << "初始化加密日志系统...\n";
        if (!CryptoLogger::instance().init(ctx.logPath, true)) {
            std::cerr << "警告: 日志系统初始化失败!\n";
            ctx.enableLogging = false;
        } else {
            CryptoLogger::instance().enableConsoleOutput(ctx.debug);
            std::cout << "日志目录: " << ctx.logPath << "\n";
        }
    }

    if (ctx.enableParallelCrypto) {
        std::cout << "初始化并行加密...\n";
        if (ctx.parallelThreads == 0) {
            ctx.parallelThreads = ParallelCrypto::instance().getOptimalThreadCount();
        }
        ParallelCrypto::instance().init(ctx.parallelThreads);
        std::cout << "并行线程数: " << ctx.parallelThreads << "\n";
    }

    if (!exportLogFile.empty()) {
        std::cout << "导出加密日志...\n";
        if (CryptoLogger::instance().exportLogs(exportLogFile, logFormat)) {
            std::cout << "日志导出成功: " << exportLogFile << "\n";
        } else {
            std::cerr << "日志导出失败!\n";
            return 1;
        }
        return 0;
    }

    if (genKey) {
        std::cout << "正在生成SM2密钥对...\n";
        std::string pubKeyFile = ctx.keyFile + ".pub";
        if (ctx.crypto->generateSM2KeyPair(ctx.keyFile, pubKeyFile)) {
            std::cout << "密钥生成成功:\n";
            std::cout << "  私钥: " << ctx.keyFile << "\n";
            std::cout << "  公钥: " << pubKeyFile << "\n";
        } else {
            std::cerr << "密钥生成失败!\n";
            return 1;
        }
        if (!genCert && !runTest) {
            return 0;
        }
    }

    if (genCert) {
        std::cout << "正在生成自签名国密证书...\n";
        if (ctx.certFile.empty()) {
            ctx.certFile = "./certs/sm2_cert.pem";
        }
        if (ctx.crypto->createSelfSignedCert(ctx.certFile, ctx.keyFile, "GM-FUSE")) {
            std::cout << "证书生成成功: " << ctx.certFile << "\n";
        } else {
            std::cerr << "证书生成失败!\n";
            return 1;
        }
        if (!runTest) {
            return 0;
        }
    }

    if (runTest) {
        std::cout << "正在运行性能测试...\n";
        if (!ctx.crypto->getPrivateKey()) {
            std::string pubKeyFile = ctx.keyFile + ".pub";
            if (!ctx.crypto->loadSM2KeyPair(ctx.keyFile, pubKeyFile)) {
                std::cerr << "加载密钥失败，正在生成新密钥...\n";
                ctx.crypto->generateSM2KeyPair(ctx.keyFile, pubKeyFile);
            }
        }
        PerformanceTest pt(*ctx.crypto);
        auto results = pt.runAllTests(testSizeKB, testIter);
        pt.printResults(results);
        return 0;
    }

    if (optind >= argc) {
        std::cerr << "错误: 未指定挂载点\n\n";
        printUsage(argv[0]);
        return 1;
    }
    ctx.mountPoint = argv[optind];

    std::cout << "初始化GM-FUSE...\n";
    std::cout << "  挂载点: " << ctx.mountPoint << "\n";
    std::cout << "  存储目录: " << ctx.storagePath << "\n";
    std::cout << "  密钥文件: " << ctx.keyFile << "\n";

    struct stat st;
    if (stat(ctx.storagePath.c_str(), &st) != 0) {
        std::cout << "创建存储目录: " << ctx.storagePath << "\n";
        if (mkdir(ctx.storagePath.c_str(), 0755) != 0) {
            std::cerr << "无法创建存储目录!\n";
            return 1;
        }
    }

    std::string pubKeyFile = ctx.keyFile + ".pub";
    if (!ctx.crypto->loadSM2KeyPair(ctx.keyFile, pubKeyFile)) {
        std::cout << "加载密钥失败，正在生成新密钥...\n";
        if (!ctx.crypto->generateSM2KeyPair(ctx.keyFile, pubKeyFile)) {
            std::cerr << "密钥生成失败!\n";
            return 1;
        }
    }

    if (!ctx.certFile.empty()) {
        if (ctx.crypto->loadSM2Certificate(ctx.certFile)) {
            std::cout << "证书加载成功: " << ctx.certFile << "\n";
        } else {
            std::cerr << "警告: 证书加载失败!\n";
        }
    }

    ctx.vfs = std::make_unique<VirtualFS>(ctx.storagePath, *ctx.crypto, ctx.kms.get());
    if (!ctx.vfs->loadFromStorage()) {
        std::cout << "创建新的虚拟文件系统...\n";
        ctx.vfs->init();
    } else {
        std::cout << "已加载现有虚拟文件系统\n";
    }

    ctx.vfs->enableKMS(ctx.enableKMS);
    ctx.vfs->enableParallelCrypto(ctx.enableParallelCrypto);
    ctx.vfs->enableLogging(ctx.enableLogging);
    if (ctx.parallelThreads > 0) {
        ctx.vfs->setParallelThreadCount(ctx.parallelThreads);
    }

    setFuseContext(&ctx);

    std::vector<const char*> fuseArgv;
    fuseArgv.push_back(argv[0]);

    if (ctx.foreground) {
        fuseArgv.push_back("-f");
    }
    if (ctx.debug) {
        fuseArgv.push_back("-d");
    }

    fuseArgv.push_back("-o");
    fuseArgv.push_back("default_permissions,allow_other");

    fuseArgv.push_back(ctx.mountPoint.c_str());

    struct fuse_operations ops = {};
    ops.getattr = gm_getattr;
    ops.readdir = gm_readdir;
    ops.create = gm_create;
    ops.mkdir = gm_mkdir;
    ops.unlink = gm_unlink;
    ops.rmdir = gm_rmdir;
    ops.open = gm_open;
    ops.read = gm_read;
    ops.write = gm_write;
    ops.truncate = gm_truncate;
    ops.utimens = gm_utimens;
    ops.chmod = gm_chmod;
    ops.chown = gm_chown;
    ops.init = gm_init;
    ops.destroy = gm_destroy;
    ops.fsync = gm_fsync;
    ops.fsyncdir = gm_fsyncdir;
    ops.release = gm_release;
    ops.statfs = gm_statfs;

    std::cout << "文件系统已挂载，按 Ctrl+C 卸载\n";

    int result = fuse_main(fuseArgv.size(), const_cast<char**>(fuseArgv.data()), &ops, nullptr);

    ctx.vfs->saveToStorage();

    if (ctx.enableParallelCrypto) {
        ParallelCrypto::instance().shutdown();
    }

    if (ctx.enableLogging) {
        CryptoLogger::instance().shutdown();
    }

    std::cout << "\n文件系统已卸载\n";

    return result;
}
