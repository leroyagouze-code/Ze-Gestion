cmake_minimum_required(VERSION 3.18)
project(zegestion)

# nodejs-mobile : en-têtes et libnode.so par architecture, dans app/libnode (téléchargé par la CI)
set(LIBNODE_DIR ${CMAKE_SOURCE_DIR}/../../../libnode)

add_library(native-lib SHARED native-lib.cpp)
target_include_directories(native-lib PRIVATE ${LIBNODE_DIR}/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${LIBNODE_DIR}/bin/${ANDROID_ABI}/libnode.so)

find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})
