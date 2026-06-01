cmake_minimum_required(VERSION 3.15)
project(gm_fuse LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

if(APPLE)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -D_DARWIN_USE_64_BIT_INODE")
endif()

find_package(PkgConfig REQUIRED)
pkg_check_modules(FUSE REQUIRED fuse3)

find_package(OpenSSL REQUIRED)
if(OPENSSL_FOUND)
    message(STATUS "OpenSSL found: ${OPENSSL_VERSION}")
endif()

include_directories(
    ${PROJECT_SOURCE_DIR}/include
    ${FUSE_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIR}
)

link_directories(
    ${FUSE_LIBRARY_DIRS}
    ${OPENSSL_LIBRARY_DIRS}
)

set(SOURCES
    src/main.cpp
    src/gm_crypto.cpp
    src/fuse_operations.cpp
    src/virtual_fs.cpp
    src/metadata.cpp
    src/performance_test.cpp
    src/kms_manager.cpp
    src/crypto_logger.cpp
    src/parallel_crypto.cpp
)

set(HEADERS
    include/gm_crypto.h
    include/fuse_operations.h
    include/virtual_fs.h
    include/metadata.h
    include/performance_test.h
    include/common.h
    include/kms_manager.h
    include/crypto_logger.h
    include/parallel_crypto.h
)

add_executable(gm-fuse ${SOURCES} ${HEADERS})

target_link_libraries(gm-fuse
    ${FUSE_LIBRARIES}
    OpenSSL::SSL
    OpenSSL::Crypto
    pthread
)

target_compile_definitions(gm-fuse PRIVATE
    FUSE_USE_VERSION=31
    _FILE_OFFSET_BITS=64
)

enable_testing()
add_executable(test_gm_crypto tests/test_gm_crypto.cpp src/gm_crypto.cpp)
target_link_libraries(test_gm_crypto OpenSSL::SSL OpenSSL::Crypto pthread)
add_test(NAME test_gm_crypto COMMAND test_gm_crypto)

add_executable(test_performance tests/test_performance.cpp src/gm_crypto.cpp src/performance_test.cpp)
target_link_libraries(test_performance OpenSSL::SSL OpenSSL::Crypto pthread)
add_test(NAME test_performance COMMAND test_performance)

install(TARGETS gm-fuse DESTINATION bin)
