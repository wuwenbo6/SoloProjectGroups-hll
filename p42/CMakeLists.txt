cmake_minimum_required(VERSION 3.12)
project(shallow_water LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

option(USE_MPI "Enable MPI parallel support" OFF)

find_package(SWIG REQUIRED)
include(${SWIG_USE_FILE})

find_package(Python3 COMPONENTS Interpreter Development NumPy REQUIRED)

find_path(NETCDF_INCLUDE_DIR netcdf.h)
find_library(NETCDF_LIBRARY netcdf)

if(USE_MPI)
    find_package(MPI REQUIRED)
    add_definitions(-DUSE_MPI)
    include_directories(${MPI_CXX_INCLUDE_DIRS})
endif()

include_directories(
    ${CMAKE_SOURCE_DIR}/src/cpp
    ${Python3_INCLUDE_DIRS}
    ${Python3_NumPy_INCLUDE_DIRS}
    ${NETCDF_INCLUDE_DIR}
)

set(CMAKE_SWIG_FLAGS "")

set(SWIG_SOURCES
    src/swig/shallow_water.i
    src/cpp/shallow_water_solver.cpp
    src/cpp/netcdf_io.cpp
)

if(USE_MPI)
    list(APPEND SWIG_SOURCES src/cpp/shallow_water_mpi.cpp)
endif()

set_source_files_properties(src/swig/shallow_water.i PROPERTIES CPLUSPLUS ON)

swig_add_library(shallow_water
    TYPE SHARED
    LANGUAGE python
    SOURCES ${SWIG_SOURCES}
)

target_link_libraries(shallow_water
    ${Python3_LIBRARIES}
    ${NETCDF_LIBRARY}
)

if(USE_MPI)
    target_link_libraries(shallow_water ${MPI_CXX_LIBRARIES})
endif()

set_target_properties(shallow_water PROPERTIES
    SWIG_USE_TARGET_INCLUDE_DIRECTORIES TRUE
)

if(USE_MPI)
    add_executable(shallow_water_mpi
        src/cpp/shallow_water_mpi.cpp
        src/cpp/shallow_water_solver.cpp
    )
    target_link_libraries(shallow_water_mpi ${MPI_CXX_LIBRARIES} ${NETCDF_LIBRARY})
endif()
