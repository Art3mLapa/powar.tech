cmake_minimum_required(VERSION 3.16)
project(bscp_renderer LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_EXTENSIONS OFF)
if (NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

find_package(Threads REQUIRED)

find_library(EGL_LIBRARY NAMES EGL libEGL REQUIRED)
find_path(EGL_INCLUDE_DIR EGL/egl.h REQUIRED)

add_executable(renderer
    src/main.cpp
    src/manifest.cpp
    src/report.cpp
    src/sha256.cpp
)
target_include_directories(renderer PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/src
    ${EGL_INCLUDE_DIR}
)
target_link_libraries(renderer PRIVATE ${EGL_LIBRARY} Threads::Threads)
target_compile_options(renderer PRIVATE -Wall -Wextra -Wno-unused-parameter -Wno-sign-compare)
