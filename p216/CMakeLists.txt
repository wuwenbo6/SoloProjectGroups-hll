cmake_minimum_required(VERSION 3.15)
project(g729_sim CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(EMSCRIPTEN)
    add_executable(g729_sim
        src/g729_encoder.cpp
        src/g729_decoder.cpp
        src/packet_loss_simulator.cpp
        src/mos_estimator.cpp
        src/emscripten_bindings.cpp
    )

    set_target_properties(g729_sim PROPERTIES
        LINK_FLAGS "-O3 \
            -s EXPORTED_FUNCTIONS='[_malloc, _free]' \
            -s EXPORTED_RUNTIME_METHODS='[ccall, cwrap, UTF8ToString, stringToUTF8]' \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s MODULARIZE=1 \
            -s EXPORT_NAME='G729Module' \
            -s ENVIRONMENT='web' \
            --bind"
    )

    set(CMAKE_EXECUTABLE_SUFFIX ".js")
else()
    add_executable(g729_test
        src/g729_encoder.cpp
        src/g729_decoder.cpp
        src/packet_loss_simulator.cpp
        src/mos_estimator.cpp
        src/test_main.cpp
    )

    find_package(GTest QUIET)
    if(GTest_FOUND)
        target_link_libraries(g729_test GTest::GTest GTest::Main)
    endif()
endif()
