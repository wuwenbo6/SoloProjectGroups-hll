cmake_minimum_required(VERSION 3.14)
project(ptp-clock-simulator VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(ptp_clock
    src/main.cpp
    src/bmca.cpp
    src/state_machine.cpp
    src/ptp_clock.cpp
    src/http_server.cpp
)

target_include_directories(ptp_clock PRIVATE ${CMAKE_SOURCE_DIR}/src)

find_library(PTHREAD pthread)
if(PTHREAD)
    target_link_libraries(ptp_clock PRIVATE ${PTHREAD})
endif()
