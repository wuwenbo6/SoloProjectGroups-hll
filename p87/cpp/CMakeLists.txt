cmake_minimum_required(VERSION 3.10)
project(OptionPricing)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(OpenMP REQUIRED)

add_executable(option_pricing
    main.cpp
    option_pricing.cpp
)

target_link_libraries(option_pricing PRIVATE OpenMP::OpenMP_CXX)
