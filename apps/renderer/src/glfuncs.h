#pragma once

#include <KHR/khrplatform.h>
#include <cstring>
#include <string>

namespace gldefs {

struct Gl {
    using PFN_glGetString = const void* (*)(int);
    using PFN_glGetStringi = const void* (*)(int, int);
    using PFN_glGetIntegerv = void (*)(uint32_t, int*);
    using PFN_glCreateShader = uint32_t (*)(uint32_t);
    using PFN_glShaderSource = void (*)(uint32_t, int, const char* const*, const int*);
    using PFN_glCompileShader = void (*)(uint32_t);
    using PFN_glGetShaderiv = void (*)(uint32_t, uint32_t, int*);
    using PFN_glGetShaderInfoLog = void (*)(uint32_t, int, int*, char*);
    using PFN_glCreateProgram = uint32_t (*)();
    using PFN_glAttachShader = void (*)(uint32_t, uint32_t);
    using PFN_glLinkProgram = void (*)(uint32_t);
    using PFN_glGetProgramiv = void (*)(uint32_t, uint32_t, int*);
    using PFN_glActiveUniform_t = void (*)(uint32_t, uint32_t, int, int*, int*, uint32_t*, char*);
    using PFN_glGetProgramInfoLog = void (*)(uint32_t, int, int*, char*);
    using PFN_glDeleteShader = void (*)(uint32_t);
    using PFN_glDeleteProgram = void (*)(uint32_t);
    using PFN_glGenVertexArrays = void (*)(int, uint32_t*);
    using PFN_glDeleteVertexArrays = void (*)(int, const uint32_t*);
    using PFN_glBindVertexArray = void (*)(uint32_t);
    using PFN_glUseProgram = void (*)(uint32_t);
    using PFN_glClearColor = void (*)(float, float, float, float);
    using PFN_glClear = void (*)(uint32_t);
    using PFN_glViewport = void (*)(int, int, int, int);
    using PFN_glDrawArrays = void (*)(uint32_t, int, int);
    using PFN_glReadPixels = void (*)(int, int, int, int, uint32_t, uint32_t, void*);
    using PFN_glFinish = void (*)();
    using PFN_glGetError = uint32_t (*)();
    using PFN_glGetAttribLocation = int (*)(uint32_t, const char*);
    using PFN_glGetUniformLocation = int (*)(uint32_t, const char*);
    using PFN_glGetUniformBlockIndex = uint32_t (*)(uint32_t, const char*);
    using PFN_glUniformBlockBinding = void (*)(uint32_t, uint32_t, uint32_t);
    using PFN_glUniform1f = void (*)(int, float);
    using PFN_glUniform1i = void (*)(int, int);
    using PFN_glUniform2f = void (*)(int, float, float);
    using PFN_glUniform3f = void (*)(int, float, float, float);
    using PFN_glUniform4f = void (*)(int, float, float, float, float);
    using PFN_glUniform4fv = void (*)(int, int, const float*);
    using PFN_glUniformMatrix4fv = void (*)(int, int, unsigned char, const float*);
    using PFN_glGenBuffers = void (*)(int, uint32_t*);
    using PFN_glBindBuffer = void (*)(uint32_t, uint32_t);
    using PFN_glBufferData = void (*)(uint32_t, size_t, const void*, uint32_t);
    using PFN_glBindBufferBase = void (*)(uint32_t, uint32_t, uint32_t);
    using PFN_glEnableVertexAttribArray = void (*)(uint32_t);
    using PFN_glVertexAttribPointer = void (*)(uint32_t, int, uint32_t, unsigned char, int, const void*);
    using PFN_glVertexAttrib4f = void (*)(uint32_t, float, float, float, float);
    using PFN_glGenTextures = void (*)(int, uint32_t*);
    using PFN_glBindTexture = void (*)(uint32_t, uint32_t);
    using PFN_glActiveTexture = void (*)(uint32_t);
    using PFN_glTexImage2D = void (*)(uint32_t, int, int, int, int, int, uint32_t, uint32_t, const void*);
    using PFN_glTexParameteri = void (*)(uint32_t, uint32_t, uint32_t);
    using PFN_glDrawElements = void (*)(uint32_t, int, uint32_t, const void*);
    using PFN_glEnable = void (*)(uint32_t);
    using PFN_glDeleteBuffers = void (*)(int, const uint32_t*);
    using PFN_glDeleteTextures = void (*)(int, const uint32_t*);

    PFN_glGetString glGetString = nullptr;
    PFN_glGetStringi glGetStringi = nullptr;
    PFN_glGetIntegerv glGetIntegerv = nullptr;
    PFN_glCreateShader glCreateShader = nullptr;
    PFN_glShaderSource glShaderSource = nullptr;
    PFN_glCompileShader glCompileShader = nullptr;
    PFN_glGetShaderiv glGetShaderiv = nullptr;
    PFN_glGetShaderInfoLog glGetShaderInfoLog = nullptr;
    PFN_glCreateProgram glCreateProgram = nullptr;
    PFN_glAttachShader glAttachShader = nullptr;
    PFN_glLinkProgram glLinkProgram = nullptr;
    PFN_glGetProgramiv glGetProgramiv = nullptr;
    PFN_glActiveUniform_t glActiveUniform_t = nullptr;
    PFN_glGetProgramInfoLog glGetProgramInfoLog = nullptr;
    PFN_glDeleteShader glDeleteShader = nullptr;
    PFN_glDeleteProgram glDeleteProgram = nullptr;
    PFN_glGenVertexArrays glGenVertexArrays = nullptr;
    PFN_glDeleteVertexArrays glDeleteVertexArrays = nullptr;
    PFN_glBindVertexArray glBindVertexArray = nullptr;
    PFN_glUseProgram glUseProgram = nullptr;
    PFN_glClearColor glClearColor = nullptr;
    PFN_glClear glClear = nullptr;
    PFN_glViewport glViewport = nullptr;
    PFN_glDrawArrays glDrawArrays = nullptr;
    PFN_glReadPixels glReadPixels = nullptr;
    PFN_glFinish glFinish = nullptr;
    PFN_glGetError glGetError = nullptr;
    PFN_glGetAttribLocation glGetAttribLocation = nullptr;
    PFN_glGetUniformLocation glGetUniformLocation = nullptr;
    PFN_glGetUniformBlockIndex glGetUniformBlockIndex = nullptr;
    PFN_glUniformBlockBinding glUniformBlockBinding = nullptr;
    PFN_glUniform1f glUniform1f = nullptr;
    PFN_glUniform1i glUniform1i = nullptr;
    PFN_glUniform2f glUniform2f = nullptr;
    PFN_glUniform3f glUniform3f = nullptr;
    PFN_glUniform4f glUniform4f = nullptr;
    PFN_glUniform4fv glUniform4fv = nullptr;
    PFN_glUniformMatrix4fv glUniformMatrix4fv = nullptr;
    PFN_glGenBuffers glGenBuffers = nullptr;
    PFN_glBindBuffer glBindBuffer = nullptr;
    PFN_glBufferData glBufferData = nullptr;
    PFN_glBindBufferBase glBindBufferBase = nullptr;
    PFN_glEnableVertexAttribArray glEnableVertexAttribArray = nullptr;
    PFN_glVertexAttribPointer glVertexAttribPointer = nullptr;
    PFN_glVertexAttrib4f glVertexAttrib4f = nullptr;
    PFN_glGenTextures glGenTextures = nullptr;
    PFN_glBindTexture glBindTexture = nullptr;
    PFN_glActiveTexture glActiveTexture = nullptr;
    PFN_glTexImage2D glTexImage2D = nullptr;
    PFN_glTexParameteri glTexParameteri = nullptr;
    PFN_glDrawElements glDrawElements = nullptr;
    PFN_glEnable glEnable = nullptr;
    PFN_glDeleteBuffers glDeleteBuffers = nullptr;
    PFN_glDeleteTextures glDeleteTextures = nullptr;
};

enum GlConstants : uint32_t {
    GL_VERSION = 0x1F02,
    GL_VENDOR = 0x1F00,
    GL_RENDERER = 0x1F01,
    GL_SHADING_LANGUAGE_VERSION = 0x8B8C,
    GL_NUM_EXTENSIONS = 0x821D,
    GL_MAJOR_VERSION = 0x821B,
    GL_MINOR_VERSION = 0x821C,
    GL_COMPUTE_SHADER_TYPE = 0x91B9,
    GL_FRAGMENT_SHADER_TYPE = 0x8B30,
    GL_VERTEX_SHADER_TYPE = 0x8B31,
    GL_COMPILE_STATUS = 0x8B81,
    GL_LINK_STATUS = 0x8B82,
    GL_INFO_LOG_LENGTH = 0x8B84,
    GL_COLOR = 0x1800,
    GL_COLOR_BUFFER_BIT = 0x00004000,
    GL_RGBA = 0x1908,
    GL_UNSIGNED_BYTE = 0x1401,
    GL_TRIANGLES = 0x0004,
    GL_ARRAY_BUFFER = 0x8892,
    GL_ELEMENT_ARRAY_BUFFER = 0x8893,
    GL_STATIC_DRAW = 0x88E4,
    GL_UNSIGNED_SHORT = 0x1403,
    GL_UNSIGNED_INT = 0x1405,
    GL_TEXTURE_2D = 0x0DE1,
    GL_TEXTURE0 = 0x84C0,
    GL_TEXTURE_MAG_FILTER = 0x2800,
    GL_TEXTURE_MIN_FILTER = 0x2801,
    GL_LINEAR = 0x2601,
    GL_NEAREST = 0x2600,
    GL_TEXTURE_WRAP_S = 0x2802,
    GL_TEXTURE_WRAP_T = 0x2803,
    GL_CLAMP_TO_EDGE = 0x812F,
    GL_REPEAT = 0x2901,
    GL_TEXTURE_WRAP_R = 0x2804,
    GL_DEPTH_TEST = 0x0B71,
    GL_UNIFORM_BUFFER = 0x8A11,
    GL_DEPTH_BUFFER_BIT = 0x00000100,
    GL_INVALID_INDEX = 0xFFFFFFFF,
    GL_SRGB8_ALPHA8 = 0x8C43,
    GL_FLOAT = 0x1406,
    GL_TEXTURE_CUBE_MAP = 0x8513,
    GL_TEXTURE_CUBE_MAP_POSITIVE_X = 0x8515,
    GL_TEXTURE_COMPARE_MODE = 0x8894,
    GL_TEXTURE_COMPARE_FUNC = 0x889D,
    GL_COMPARE_REF_TO_TEXTURE = 0x884E,
    GL_DEPTH_COMPONENT = 0x1902,
    GL_SAMPLER_2D = 0x8B5E,
    GL_SAMPLER_CUBE = 0x8B60,
    GL_SAMPLER_2D_SHADOW = 0x8B62,
    GL_ACTIVE_UNIFORMS = 0x8B86,
    GL_DEPTH_COMPONENT32 = 0x81A7,
    GL_LEQUAL = 0x0203,
};

template <typename Fn>
bool carry(Fn& target, const void* address) {
    Fn fn = nullptr;
    if (!address) return false;
    static_assert(sizeof(fn) == sizeof(address));
    std::memcpy(&fn, &address, sizeof(fn));
    target = fn;
    return true;
}

inline bool load(Gl& gl, const void* (*lookup)(const char*), std::string& error) {
    auto resolve = [lookup](auto& target, const char* name) { return carry(target, lookup(name)); };
    bool ok = true;
    ok = resolve(gl.glGetString, "glGetString") && ok;
    ok = resolve(gl.glGetStringi, "glGetStringi") && ok;
    ok = resolve(gl.glGetIntegerv, "glGetIntegerv") && ok;
    ok = resolve(gl.glCreateShader, "glCreateShader") && ok;
    ok = resolve(gl.glShaderSource, "glShaderSource") && ok;
    ok = resolve(gl.glCompileShader, "glCompileShader") && ok;
    ok = resolve(gl.glGetShaderiv, "glGetShaderiv") && ok;
    ok = resolve(gl.glGetShaderInfoLog, "glGetShaderInfoLog") && ok;
    ok = resolve(gl.glCreateProgram, "glCreateProgram") && ok;
    ok = resolve(gl.glAttachShader, "glAttachShader") && ok;
    ok = resolve(gl.glLinkProgram, "glLinkProgram") && ok;
    ok = resolve(gl.glGetProgramiv, "glGetProgramiv") && ok;
    ok = resolve(gl.glActiveUniform_t, "glGetActiveUniform") && ok;
    ok = resolve(gl.glGetProgramInfoLog, "glGetProgramInfoLog") && ok;
    ok = resolve(gl.glDeleteShader, "glDeleteShader") && ok;
    ok = resolve(gl.glDeleteProgram, "glDeleteProgram") && ok;
    ok = resolve(gl.glGenVertexArrays, "glGenVertexArrays") && ok;
    ok = resolve(gl.glBindVertexArray, "glBindVertexArray") && ok;
    ok = resolve(gl.glUseProgram, "glUseProgram") && ok;
    ok = resolve(gl.glClearColor, "glClearColor") && ok;
    ok = resolve(gl.glClear, "glClear") && ok;
    ok = resolve(gl.glViewport, "glViewport") && ok;
    ok = resolve(gl.glDrawArrays, "glDrawArrays") && ok;
    ok = resolve(gl.glReadPixels, "glReadPixels") && ok;
    ok = resolve(gl.glFinish, "glFinish") && ok;
    ok = resolve(gl.glGetError, "glGetError") && ok;
    ok = resolve(gl.glGetAttribLocation, "glGetAttribLocation") && ok;
    ok = resolve(gl.glGetUniformLocation, "glGetUniformLocation") && ok;
    ok = resolve(gl.glGetUniformBlockIndex, "glGetUniformBlockIndex") && ok;
    ok = resolve(gl.glUniformBlockBinding, "glUniformBlockBinding") && ok;
    ok = resolve(gl.glUniform1f, "glUniform1f") && ok;
    ok = resolve(gl.glUniform1i, "glUniform1i") && ok;
    ok = resolve(gl.glUniform2f, "glUniform2f") && ok;
    ok = resolve(gl.glUniform3f, "glUniform3f") && ok;
    ok = resolve(gl.glUniform4f, "glUniform4f") && ok;
    ok = resolve(gl.glUniform4fv, "glUniform4fv") && ok;
    ok = resolve(gl.glUniformMatrix4fv, "glUniformMatrix4fv") && ok;
    ok = resolve(gl.glGenBuffers, "glGenBuffers") && ok;
    ok = resolve(gl.glBindBuffer, "glBindBuffer") && ok;
    ok = resolve(gl.glBufferData, "glBufferData") && ok;
    ok = resolve(gl.glBindBufferBase, "glBindBufferBase") && ok;
    ok = resolve(gl.glEnableVertexAttribArray, "glEnableVertexAttribArray") && ok;
    ok = resolve(gl.glVertexAttribPointer, "glVertexAttribPointer") && ok;
    ok = resolve(gl.glVertexAttrib4f, "glVertexAttrib4f") && ok;
    ok = resolve(gl.glGenTextures, "glGenTextures") && ok;
    ok = resolve(gl.glBindTexture, "glBindTexture") && ok;
    ok = resolve(gl.glActiveTexture, "glActiveTexture") && ok;
    ok = resolve(gl.glTexImage2D, "glTexImage2D") && ok;
    ok = resolve(gl.glTexParameteri, "glTexParameteri") && ok;
    ok = resolve(gl.glDrawElements, "glDrawElements") && ok;
    ok = resolve(gl.glEnable, "glEnable") && ok;
    ok = resolve(gl.glDeleteBuffers, "glDeleteBuffers") && ok;
    ok = resolve(gl.glDeleteTextures, "glDeleteTextures") && ok;
    ok = resolve(gl.glDeleteVertexArrays, "glDeleteVertexArrays") && ok;
    if (!ok) error = "gl entry points unavailable";
    return ok;
}

}  // namespace gldefs
