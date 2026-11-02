#include "spike.h"
#include "glfuncs.h"

#include <chrono>
#include <map>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <KHR/khrplatform.h>

#ifndef _WIN32
#include <sys/stat.h>
#include <sys/types.h>
#endif

namespace {

using Gl = gldefs::Gl;
using gldefs::GL_COMPILE_STATUS;
using gldefs::GL_COLOR_BUFFER_BIT;
using gldefs::GL_FRAGMENT_SHADER_TYPE;
using gldefs::GL_INFO_LOG_LENGTH;
using gldefs::GL_LINK_STATUS;
using gldefs::GL_MAJOR_VERSION;
using gldefs::GL_MINOR_VERSION;
using gldefs::GL_NUM_EXTENSIONS;
using gldefs::GL_RGBA;
using gldefs::GL_SHADING_LANGUAGE_VERSION;
using gldefs::GL_TRIANGLES;
using gldefs::GL_UNSIGNED_BYTE;
using gldefs::GL_VENDOR;
using gldefs::GL_VERSION;
using gldefs::GL_VERTEX_SHADER_TYPE;
using gldefs::GL_RENDERER;
using gldefs::GL_TEXTURE_2D;
using gldefs::GL_TEXTURE0;
using gldefs::GL_TEXTURE_MIN_FILTER;
using gldefs::GL_TEXTURE_MAG_FILTER;
using gldefs::GL_TEXTURE_WRAP_S;
using gldefs::GL_TEXTURE_WRAP_T;
using gldefs::GL_LINEAR;
using gldefs::GL_CLAMP_TO_EDGE;
using gldefs::GL_REPEAT;
using gldefs::GL_DEPTH_TEST;
using gldefs::GL_UNIFORM_BUFFER;
using gldefs::GL_UNSIGNED_SHORT;
using gldefs::GL_UNSIGNED_INT;
using gldefs::GL_ELEMENT_ARRAY_BUFFER;
using gldefs::GL_TEXTURE_CUBE_MAP;
using gldefs::GL_TEXTURE_CUBE_MAP_POSITIVE_X;
using gldefs::GL_TEXTURE_COMPARE_MODE;
using gldefs::GL_TEXTURE_COMPARE_FUNC;
using gldefs::GL_COMPARE_REF_TO_TEXTURE;
using gldefs::GL_DEPTH_COMPONENT;
using gldefs::GL_DEPTH_COMPONENT32;
using gldefs::GL_LEQUAL;
using gldefs::GL_SAMPLER_2D;
using gldefs::GL_SAMPLER_CUBE;
using gldefs::GL_SAMPLER_2D_SHADOW;
using gldefs::GL_ACTIVE_UNIFORMS;
using gldefs::GL_ARRAY_BUFFER;
using gldefs::GL_STATIC_DRAW;
using gldefs::GL_FLOAT;
using gldefs::GL_NEAREST;
using gldefs::GL_DEPTH_BUFFER_BIT;
using gldefs::GL_INVALID_INDEX;

bool read_text_file(const std::string& path, std::string& out, std::string& error) {
    FILE* file = fopen(path.c_str(), "rb");
    if (!file) {
        error = "not readable: " + path;
        return false;
    }
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    out.resize(size > 0 ? static_cast<size_t>(size) : 0, '\0');
    if (size > 0) {
        size_t got = fread(out.data(), 1, out.size(), file);
        out.resize(got);
    }
    fclose(file);
    return true;
}

bool ensure_dir(const std::string& path, std::string& error) {
#ifndef _WIN32
    std::string parent;
    size_t slash = path.find_last_of('/');
    parent = slash <= 0 || slash == std::string::npos ? path : path.substr(0, slash);
    if (!parent.empty() && parent != path) {
        if (!ensure_dir(parent, error)) return false;
    }
    if (mkdir(path.c_str(), 0755) == 0 || errno == EEXIST) return true;
    error = std::string("mkdir failed: ") + path + " (" + std::strerror(errno) + ")";
    return false;
#else
    error = "windows not supported";
    return false;
#endif
}

bool write_bytes(const std::string& path, const std::vector<uint8_t>& data, std::string& error) {
    FILE* file = fopen(path.c_str(), "wb");
    if (!file) {
        error = "not writable: " + path;
        return false;
    }
    size_t wrote = data.empty() ? 0 : fwrite(data.data(), 1, data.size(), file);
    fclose(file);
    if (wrote != data.size()) {
        error = "short write: " + path;
        return false;
    }
    return true;
}

uint64_t elapsed_ms(std::chrono::steady_clock::time_point started) {
    return static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - started).count());
}

void print_json_and_flush(const RendererReport& report) {
    std::string json = render_report_json(report);
    std::fputs(json.c_str(), stdout);
    std::fputc('\n', stdout);
    std::fflush(stdout);
}

bool publish_failure(RendererReport& report, const std::string& code, const std::string& message, const std::string& source) {
    report.add_diag("error", code, message, source);
    report.status = "failed";
    print_json_and_flush(report);
    return false;
}

// GLSL requires #version first, so manifest defines are inserted after the
// opening line with a #line directive that keeps diagnostic line numbers
// pointing into the composed source.
std::string apply_defines(const std::string& source, const std::vector<std::string>& defines) {
    if (defines.empty()) return source;
    size_t newline = source.find('\n');
    std::string prologue = source.substr(0, newline == std::string::npos ? source.size() : newline);
    std::string rest = newline == std::string::npos ? std::string() : source.substr(newline + 1);
    std::string prefix;
    for (const std::string& define : defines) {
        size_t equals = define.find('=');
        if (equals == std::string::npos) prefix += "#define " + define + " 1\n";
        else prefix += "#define " + define.substr(0, equals) + " " + define.substr(equals + 1) + "\n";
    }
    prefix += "#line 1\n";
    return prologue + "\n" + prefix + rest;
}

struct StageInput {
    bool present = false;
    std::string path;
    std::string source;
    std::string error;
};

StageInput load_stage(const std::string& bundleDir, const std::string& name, const std::string& stage) {
    StageInput input;
    std::string path = name[0] == '/' ? name : bundleDir + "/" + name;
    std::string error;
    if (read_text_file(path, input.source, error)) {
        input.present = true;
        input.path = path;
        input.error.clear();
    } else {
        input.present = false;
        input.path = path;
        input.error = stage + " " + error;
        input.source.clear();
    }
    return input;
}

uint32_t compile_stage(const Gl& gl, uint32_t type, const std::string& stagePath, const std::string& source, std::string& log) {
    uint32_t shader = gl.glCreateShader(type);
    if (shader == 0) {
        log = "glCreateShader failed for " + stagePath;
        return 0;
    }
    const char* text = source.c_str();
    int length = static_cast<int>(source.size());
    gl.glShaderSource(shader, 1, &text, &length);
    gl.glCompileShader(shader);
    int status = 0;
    gl.glGetShaderiv(shader, GL_COMPILE_STATUS, &status);
    int logLength = 0;
    gl.glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &logLength);
    if (logLength > 1) {
        std::vector<char> buffer(static_cast<size_t>(logLength));
        gl.glGetShaderInfoLog(shader, logLength, nullptr, buffer.data());
        log.assign(buffer.data(), buffer.data() + buffer.size() - (buffer.size() > 0 && buffer.back() == '\0' ? 1 : 0));
    }
    if (status != 1) {
        if (log.empty()) log = "shader did not compile: " + stagePath;
        gl.glDeleteShader(shader);
        return 0;
    }
    return shader;
}

ProgramReport link_program(const Gl& gl, uint32_t enclosedVertex, uint32_t enclosedFragment, uint32_t& handleOut) {
    ProgramReport program;
    handleOut = 0;
    uint32_t handle = gl.glCreateProgram();
    if (handle != 0) {
        if (enclosedVertex != 0) gl.glAttachShader(handle, enclosedVertex);
        if (enclosedFragment != 0) gl.glAttachShader(handle, enclosedFragment);
        gl.glLinkProgram(handle);
        int status = 0;
        gl.glGetProgramiv(handle, GL_LINK_STATUS, &status);
        int logLength = 0;
        gl.glGetProgramiv(handle, GL_INFO_LOG_LENGTH, &logLength);
        std::string log;
        if (logLength > 1) {
            std::vector<char> buffer(static_cast<size_t>(logLength));
            gl.glGetProgramInfoLog(handle, logLength, nullptr, buffer.data());
            log.assign(buffer.data(), buffer.data() + buffer.size() - (buffer.size() > 0 && buffer.back() == '\0' ? 1 : 0));
        }
        if (status == 1) program.status = "linked";
        if (!log.empty()) {
            program.logTruncated = log.size() > 4000 ? 1 : 0;
            ReportDiag diag;
            diag.severity = status == 1 ? "info" : "error";
            diag.code = status == 1 ? "renderer.link-log" : "renderer.link-failed";
            diag.message = log.size() > 4000 ? log.substr(0, 4000) + "..." : log;
            diag.source = "program";
            program.diagnostics.push_back(diag);
        }
        if (status == 1) handleOut = handle;
        else gl.glDeleteProgram(handle);
    }
    return program;
}

std::vector<uint8_t> read_binary_file(const std::string& path, std::string& error) {
    FILE* file = fopen(path.c_str(), "rb");
    if (!file) {
        error = "not readable: " + path;
        return {};
    }
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    std::vector<uint8_t> out(size > 0 ? static_cast<size_t>(size) : 0);
    if (!out.empty() && fread(out.data(), 1, out.size(), file) != out.size()) {
        error = "short read: " + path;
        out.clear();
    }
    fclose(file);
    return out;
}

uint32_t upload_texture(const Gl& gl, int width, int height, const std::vector<uint8_t>& pixels) {
    uint32_t texture = 0;
    gl.glGenTextures(1, &texture);
    if (texture == 0) return 0;
    gl.glBindTexture(GL_TEXTURE_2D, texture);
    gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    gl.glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE,
        pixels.empty() ? nullptr : pixels.data());
    return texture;
}

// The capture pass draws a self-contained gradient triangle to validate the
// headless context, draw and rgba8 readback; archive programs are gated by
// link status only, since their real draw inputs (decoded models, textures)
// are outside this spike's scope.
const char* CAPTURE_VERT_SOURCE = R"GLSL(#version 430
out vec2 v_uv;
void main(){
  vec2 quad[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  vec2 position = quad[gl_VertexID];
  v_uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
)GLSL";

const char* CAPTURE_FRAG_SOURCE = R"GLSL(#version 430
in vec2 v_uv;
out vec4 frag;
void main(){
  frag = vec4(v_uv.x, v_uv.y, 1.0 - v_uv.x * v_uv.y, 1.0);
}
)GLSL";

}  // namespace

int main(int argc, char** argv) {
    std::string manifestPath;
    std::string outDir;
    for (int i = 1; i < argc; i++) {
        std::string flag = argv[i];
        if (i + 1 < argc && flag == "--manifest") manifestPath = argv[++i];
        else if (i + 1 < argc && flag == "--out") outDir = argv[++i];
        else if (flag == "--help") {
            std::printf("usage: renderer --manifest render_manifest.json --out DIR\n");
            return 0;
        }
    }
    if (manifestPath.empty() || outDir.empty()) {
        std::fprintf(stderr, "renderer needs --manifest PATH and --out DIR\n");
        return 2;
    }

    RendererReport report;

    std::string manifestError;
    SpikeManifest manifest = parse_manifest(manifestPath, manifestError);
    if (!manifestError.empty()) {
        publish_failure(report, "renderer.manifest-unreadable", manifestError, manifestPath);
        return 0;
    }
    std::string bundleDir;
    size_t lastSlash = manifestPath.find_last_of('/');
    bundleDir = lastSlash == std::string::npos ? std::string(".") : manifestPath.substr(0, lastSlash);

    auto startedClock = std::chrono::steady_clock::now();

    EGLDisplay display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
    if (display == EGL_NO_DISPLAY) {
        publish_failure(report, "renderer.egl-no-display", "eglGetDisplay returned EGL_NO_DISPLAY", "egl");
        return 0;
    }
    EGLint eglMajor = 0;
    EGLint eglMinor = 0;
    if (!eglInitialize(display, &eglMajor, &eglMinor)) {
        publish_failure(report, "renderer.egl-init-failed", "eglInitialize failed", "egl");
        return 0;
    }
    const EGLint configAttribs[] = {EGL_RENDERABLE_TYPE, EGL_OPENGL_BIT, EGL_SURFACE_TYPE, EGL_PBUFFER_BIT, EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 24, EGL_NONE};
    EGLConfig config = nullptr;
    EGLint numConfigs = 0;
    if (!eglChooseConfig(display, configAttribs, &config, 1, &numConfigs) || numConfigs < 1 || config == nullptr) {
        publish_failure(report, "renderer.egl-no-config", "eglChooseConfig returned no GL pbuffer config", "egl");
        return 0;
    }
    if (!eglBindAPI(EGL_OPENGL_API)) {
        publish_failure(report, "renderer.egl-bind-failed", "eglBindAPI(EGL_OPENGL_API) failed", "egl");
        return 0;
    }
    EGLint contextAttribs[] = {EGL_CONTEXT_MAJOR_VERSION, 4, EGL_CONTEXT_MINOR_VERSION, 3, EGL_CONTEXT_OPENGL_PROFILE_MASK, EGL_CONTEXT_OPENGL_CORE_PROFILE_BIT, EGL_NONE};
    EGLContext glContext = eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttribs);
    std::string contextProfile = "core 4.3";
    if (glContext == EGL_NO_CONTEXT) {
        contextAttribs[3] = 0;
        glContext = eglCreateContext(display, config, EGL_NO_CONTEXT, contextAttribs);
        contextProfile = "core 4.0";
    }
    if (glContext == EGL_NO_CONTEXT) {
        contextProfile = "compatibility";
        const EGLint legacyAttribs[] = {EGL_CONFIG_CAVEAT, EGL_NONE, EGL_NONE};
        (void)legacyAttribs;
        EGLint fallbackAttribs[] = {EGL_NONE};
        glContext = eglCreateContext(display, config, EGL_NO_CONTEXT, fallbackAttribs);
    }
    if (glContext == EGL_NO_CONTEXT) {
        publish_failure(report, "renderer.egl-no-context", "eglCreateContext failed for every requested profile", "egl");
        return 0;
    }
    int captureWidth = manifest.width > 0 ? manifest.width : 256;
    int captureHeight = manifest.height > 0 ? manifest.height : 256;
    EGLint pixelAttribs[] = {EGL_WIDTH, captureWidth, EGL_HEIGHT, captureHeight, EGL_NONE};
    EGLSurface surface = eglCreatePbufferSurface(display, config, pixelAttribs);
    bool surfaceless = surface == EGL_NO_SURFACE;
    if (!eglMakeCurrent(display, surfaceless ? EGL_NO_SURFACE : surface, surfaceless ? EGL_NO_SURFACE : surface, glContext)) {
        publish_failure(report, "renderer.egl-make-current-failed", surfaceless ? "eglMakeCurrent failed for surfaceless context" : "eglMakeCurrent failed", "egl");
        return 0;
    }

    Gl gl;
    std::string glError;
    if (!gldefs::load(gl, reinterpret_cast<const void* (*)(const char*)>(eglGetProcAddress), glError)) {
        publish_failure(report, "renderer.gl-loads-failed", glError, "gl");
        return 0;
    }
    report.contextMs = elapsed_ms(startedClock);

    {
        const void* version = gl.glGetString(GL_VERSION);
        const void* vendor = gl.glGetString(GL_VENDOR);
        const void* rendererEntered = gl.glGetString(GL_RENDERER);
        const void* shadingLanguage = gl.glGetString(GL_SHADING_LANGUAGE_VERSION);
        report.backend.version = version ? reinterpret_cast<const char*>(version) : "";
        report.backend.vendor = vendor ? reinterpret_cast<const char*>(vendor) : "";
        report.backend.rendererString = rendererEntered ? reinterpret_cast<const char*>(rendererEntered) : "";
        report.backend.shadingLanguage = shadingLanguage ? reinterpret_cast<const char*>(shadingLanguage) : "";
        int major = 0;
        int minor = 0;
        gl.glGetIntegerv(GL_MAJOR_VERSION, &major);
        gl.glGetIntegerv(GL_MINOR_VERSION, &minor);
        report.backend.versionMajor = major > 0 ? major : 4;
        report.backend.versionMinor = minor;
        report.backend.platform = surfaceless ? "egl-surfaceless" : "egl-pbuffer";
        report.backend.contextProfile = contextProfile;
        int extensionCount = 0;
        gl.glGetIntegerv(GL_NUM_EXTENSIONS, &extensionCount);
        for (unsigned index = 0; index < static_cast<unsigned>(extensionCount); index++) {
            const void* extension = gl.glGetStringi(index, GL_NUM_EXTENSIONS);
            if (extension) report.backend.extensions.emplace_back(reinterpret_cast<const char*>(extension));
        }
        const char* eglExtensions = eglQueryString(display, EGL_EXTENSIONS);
        if (eglExtensions) {
            const char* cursor = eglExtensions;
            while (*cursor) {
                const char* endPointer = std::strchr(cursor, ' ');
                report.backend.extensions.emplace_back(cursor, endPointer ? static_cast<size_t>(endPointer - cursor) : std::strlen(cursor));
                if (!endPointer) break;
                cursor = endPointer + 1;
            }
        }
    }

    auto compileStarted = std::chrono::steady_clock::now();
    int linkedCount = 0;
    int failedCount = 0;
    std::map<std::string, uint32_t> programHandles;
    for (const SpikeProgramEntry& entry : manifest.programs) {
        ProgramReport program;
        program.vertexStatus = "missing";
        program.fragmentStatus = "missing";
        bool unusable = false;
        uint32_t vertexShader = 0;
        uint32_t fragmentShader = 0;
        if (!entry.vertex.empty()) {
            StageInput vertex = load_stage(bundleDir, entry.vertex, "vertex");
            if (!vertex.present) {
                program.vertexStatus = "missing";
                unusable = true;
                report.add_diag("error", "renderer.source-missing", vertex.error, vertex.path);
            } else {
                std::string log;
                vertexShader = compile_stage(gl, GL_VERTEX_SHADER_TYPE, vertex.path, apply_defines(vertex.source, entry.defines), log);
                program.vertexStatus = vertexShader != 0 ? "compiled" : "failed";
                if (vertexShader == 0) {
                    unusable = true;
                    ReportDiag diag;
                    diag.severity = "error";
                    diag.code = "renderer.vertex-compile-failed";
                    diag.message = log.empty() ? "no info log" : log;
                    diag.source = vertex.path;
                    program.diagnostics.push_back(diag);
                } else if (!log.empty()) {
                    ReportDiag diag;
                    diag.severity = "info";
                    diag.code = "renderer.compile-log";
                    diag.message = log;
                    diag.source = vertex.path;
                    program.diagnostics.push_back(diag);
                }
            }
        }
        if (!entry.fragment.empty()) {
            StageInput fragment = load_stage(bundleDir, entry.fragment, "fragment");
            if (!fragment.present) {
                program.fragmentStatus = "missing";
                unusable = true;
                report.add_diag("error", "renderer.source-missing", fragment.error, fragment.path);
            } else {
                std::string log;
                fragmentShader = compile_stage(gl, GL_FRAGMENT_SHADER_TYPE, fragment.path, apply_defines(fragment.source, entry.defines), log);
                program.fragmentStatus = fragmentShader != 0 ? "compiled" : "failed";
                if (fragmentShader == 0) {
                    unusable = true;
                    ReportDiag diag;
                    diag.severity = "error";
                    diag.code = "renderer.fragment-compile-failed";
                    diag.message = log.empty() ? "no info log" : log;
                    diag.source = fragment.path;
                    program.diagnostics.push_back(diag);
                } else if (!log.empty()) {
                    ReportDiag diag;
                    diag.severity = "info";
                    diag.code = "renderer.compile-log";
                    diag.message = log;
                    diag.source = fragment.path;
                    program.diagnostics.push_back(diag);
                }
            }
        }
        if (!unusable && vertexShader != 0 && fragmentShader != 0) {
            uint32_t linkedHandle = 0;
            ProgramReport linked = link_program(gl, vertexShader, fragmentShader, linkedHandle);
            program.status = linked.status;
            program.logTruncated = linked.logTruncated;
            program.diagnostics.insert(program.diagnostics.end(), linked.diagnostics.begin(), linked.diagnostics.end());
            if (linkedHandle != 0) programHandles.emplace(entry.name, linkedHandle);
        } else if (!unusable && vertexShader == 0 && fragmentShader != 0) {
            program.status = "compiled";
        } else if (!unusable && vertexShader != 0 && fragmentShader == 0) {
            program.status = "compiled";
        }
        if (vertexShader != 0) gl.glDeleteShader(vertexShader);
        if (fragmentShader != 0) gl.glDeleteShader(fragmentShader);
        if (program.status == "linked") linkedCount++;
        else failedCount++;
        report.programOrder.push_back(entry.name);
        report.programs.emplace(entry.name, std::move(program));
    }
    report.compileMs = elapsed_ms(compileStarted);

    auto renderStarted = std::chrono::steady_clock::now();
    bool captureOk = false;
    int width = captureWidth;
    int height = captureHeight;
    std::vector<uint8_t> readback(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);
    uint32_t captureVertex = 0;
    uint32_t captureFragment = 0;
    {
        std::string log;
        captureVertex = compile_stage(gl, GL_VERTEX_SHADER_TYPE, "capture.vert", CAPTURE_VERT_SOURCE, log);
        if (captureVertex == 0) report.add_diag("error", "renderer.capture-compilation-failed", log.empty() ? "capture vertex shader failed" : log, "capture.vert");
        log.clear();
        captureFragment = compile_stage(gl, GL_FRAGMENT_SHADER_TYPE, "capture.frag", CAPTURE_FRAG_SOURCE, log);
        if (captureFragment == 0) report.add_diag("error", "renderer.capture-compilation-failed", log.empty() ? "capture fragment shader failed" : log, "capture.frag");
    }
    if (captureVertex != 0 && captureFragment != 0) {
        gl.glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
        gl.glViewport(0, 0, width, height);
        gl.glClear(GL_COLOR_BUFFER_BIT);
        uint32_t captureProgram = gl.glCreateProgram();
        if (captureProgram != 0) {
            gl.glAttachShader(captureProgram, captureVertex);
            gl.glAttachShader(captureProgram, captureFragment);
            gl.glLinkProgram(captureProgram);
            int status = 0;
            gl.glGetProgramiv(captureProgram, GL_LINK_STATUS, &status);
            if (status == 1) {
                uint32_t vao = 0;
                gl.glGenVertexArrays(1, &vao);
                gl.glBindVertexArray(vao);
                while (gl.glGetError() != 0) {}
                gl.glUseProgram(captureProgram);
                uint32_t bindError = gl.glGetError();
                gl.glDrawArrays(GL_TRIANGLES, 0, 3);
                uint32_t drawError = gl.glGetError();
                if (bindError != 0) report.add_diag("warning", "renderer.gl-error", "glGetError after useProgram: " + std::to_string(bindError), "capture");
                if (drawError != 0) report.add_diag("warning", "renderer.gl-error", "glGetError after draw: " + std::to_string(drawError), "capture");
                gl.glFinish();
                uint32_t finishError = gl.glGetError();
                if (finishError != 0) report.add_diag("warning", "renderer.gl-error", "glGetError after finish: " + std::to_string(finishError), "capture");
                gl.glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, readback.data());
                captureOk = true;
            }
            gl.glDeleteProgram(captureProgram);
        } else report.add_diag("error", "renderer.capture-context-failed", "glCreateProgram returned zero for the capture pass", "capture");
    }
    report.renderMs = elapsed_ms(renderStarted);

    auto readStarted = std::chrono::steady_clock::now();
    if (captureOk) {
        std::string captureDir = outDir + "/capture";
        std::string dirError;
        if (!ensure_dir(captureDir, dirError)) {
            report.add_diag("error", "renderer.capture-dir-failed", dirError, captureDir);
        } else {
            std::string captureFile = captureDir + "/000000.rgba";
            std::string writeError;
            if (!write_bytes(captureFile, readback, writeError)) {
                report.add_diag("error", "renderer.capture-write-failed", writeError, captureFile);
                captureOk = false;
            } else {
                std::string digestError;
                std::string digest = sha256_file(captureFile, digestError);
                if (!digestError.empty()) {
                    report.add_diag("error", "renderer.capture-digest-failed", digestError, captureFile);
                } else {
                    CaptureOut capture;
                    capture.path = "000000.rgba";
                    capture.width = width;
                    capture.height = height;
                    capture.bytes = readback.size();
                    capture.sha256 = digest;
                    capture.format = "rgba8";
                    report.capture = capture;
                }
            }
        }
    }
    report.readMs = elapsed_ms(readStarted);
    if (!manifest.draws.empty()) {
        auto drawStarted = std::chrono::steady_clock::now();
        std::string captureDir = outDir + "/capture";
        std::string dirError;
        const bool captureDirReady = ensure_dir(captureDir, dirError);
        if (!captureDirReady) report.add_diag("error", "renderer.capture-dir-failed", dirError, captureDir);
        gl.glEnable(GL_DEPTH_TEST);
        gl.glClearColor(0.0f, 0.09f, 0.06f, 1.0f);
        gl.glViewport(0, 0, width, height);
        uint32_t whiteFallback = 0;
        uint32_t neutralCubeDiffuse = 0;
        uint32_t neutralCubeSpecular = 0;
        uint32_t neutralShadowDepth = 0;
        {
            std::vector<uint8_t> neutral(4, 0xFF);
            whiteFallback = upload_texture(gl, 1, 1, neutral);
            gl.glGenTextures(1, &neutralCubeDiffuse);
            gl.glBindTexture(GL_TEXTURE_CUBE_MAP, neutralCubeDiffuse);
            for (uint32_t face = 0; face < 6; face++) {
                std::vector<uint8_t> facePixel(4, 0xFF);
                gl.glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, facePixel.data());
            }
            gl.glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
            gl.glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
            gl.glGenTextures(1, &neutralCubeSpecular);
            gl.glBindTexture(GL_TEXTURE_CUBE_MAP, neutralCubeSpecular);
            for (uint32_t face = 0; face < 6; face++) {
                std::vector<uint8_t> facePixel(4, 0x00);
                gl.glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + face, 0, GL_RGBA, 1, 1, 0, GL_RGBA, GL_UNSIGNED_BYTE, facePixel.data());
            }
            gl.glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
            gl.glTexParameteri(GL_TEXTURE_CUBE_MAP, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
            gl.glBindTexture(GL_TEXTURE_2D, whiteFallback);
            gl.glGenTextures(1, &neutralShadowDepth);
            gl.glBindTexture(GL_TEXTURE_2D, neutralShadowDepth);
            std::vector<float> depthPixel(1, 1.0f);
            gl.glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT32, 1, 1, 0, GL_DEPTH_COMPONENT, GL_FLOAT, depthPixel.data());
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_MODE, GL_COMPARE_REF_TO_TEXTURE);
            gl.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_COMPARE_FUNC, GL_LEQUAL);
            gl.glBindTexture(GL_TEXTURE_2D, whiteFallback);
        }
        uint32_t viewUbo = 0;
         int drawnCount = 0;
         int drawnFailedCount = 0;
         gl.glClearColor(0.0f, 0.0f, 0.0f, 0.0f);
         gl.glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
        for (size_t drawIndex = 0; drawIndex < manifest.draws.size(); drawIndex++) {
            const DrawEntry& draw = manifest.draws[drawIndex];
            std::string drawKey = "draw-" + std::to_string(drawIndex);
            DrawReport drawReport;
            drawReport.mesh = draw.mesh;
            drawReport.program = draw.program;
            drawReport.indexCount = draw.indexCount;
            auto handleIt = programHandles.find(draw.program);
            if (handleIt == programHandles.end() || handleIt->second == 0) {
                drawReport.status = "failed";
                ReportDiag diag;
                diag.severity = "error";
                diag.code = "renderer.draw-program-unavailable";
                diag.message = draw.program + " is not a linked program in this bundle";
                diag.source = draw.meshFile;
                drawReport.diagnostics.push_back(diag);
                report.draws.emplace(drawKey, std::move(drawReport));
                drawnFailedCount++;
                continue;
            }
            std::string meshError;
            std::vector<uint8_t> meshData = read_binary_file(bundleDir + "/" + draw.meshFile, meshError);
            if (meshData.empty() || !meshError.empty()) {
                drawReport.status = "failed";
                ReportDiag diag;
                diag.severity = "error";
                diag.code = "renderer.draw-mesh-unreadable";
                diag.message = meshError;
                diag.source = draw.meshFile;
                drawReport.diagnostics.push_back(diag);
                report.draws.emplace(drawKey, std::move(drawReport));
                drawnFailedCount++;
                continue;
            }
            meshError.clear();
            std::vector<uint8_t> indexData = read_binary_file(bundleDir + "/" + draw.indicesFile, meshError);
            if (indexData.empty() || !meshError.empty()) {
                drawReport.status = "failed";
                ReportDiag diag;
                diag.severity = "error";
                diag.code = "renderer.draw-indices-unreadable";
                diag.message = meshError;
                diag.source = draw.indicesFile;
                drawReport.diagnostics.push_back(diag);
                report.draws.emplace(drawKey, std::move(drawReport));
                drawnFailedCount++;
                continue;
            }
            gl.glUseProgram(handleIt->second);
            uint32_t vertexHandle = 0;
            uint32_t indexHandle = 0;
            uint32_t drawVao = 0;
            gl.glGenBuffers(1, &vertexHandle);
            gl.glGenBuffers(1, &indexHandle);
            gl.glGenVertexArrays(1, &drawVao);
            gl.glBindVertexArray(drawVao);
            gl.glBindBuffer(GL_ARRAY_BUFFER, vertexHandle);
            gl.glBufferData(GL_ARRAY_BUFFER, meshData.size(), meshData.data(), GL_STATIC_DRAW);
            gl.glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, indexHandle);
            gl.glBufferData(GL_ELEMENT_ARRAY_BUFFER, indexData.size(), indexData.data(), GL_STATIC_DRAW);
            const auto bindAttribute = [&](const char* name, int components, size_t offset) {
                int slot = gl.glGetAttribLocation(handleIt->second, name);
                if (slot < 0) return;
                gl.glEnableVertexAttribArray(static_cast<uint32_t>(slot));
                gl.glVertexAttribPointer(static_cast<uint32_t>(slot), components, GL_FLOAT, 0, 56,
                    reinterpret_cast<const void*>(offset));
            };
            const auto setDefaultAttribute = [&](const char* name, float x, float y, float z, float w) {
                int slot = gl.glGetAttribLocation(handleIt->second, name);
                if (slot < 0) return;
                gl.glVertexAttrib4f(static_cast<uint32_t>(slot), x, y, z, w);
            };
            bindAttribute("positionIn", 4, 0);
            bindAttribute("normalIn", 4, 16);
            bindAttribute("tangentIn", 4, 32);
            bindAttribute("textureCoordsIn", 2, 48);
            setDefaultAttribute("textureCoords_2In", 0, 0, 0, 1);
            setDefaultAttribute("animationData", 0, 0, 0, 0);
            setDefaultAttribute("weights", 1, 0, 0, 0);
            setDefaultAttribute("colorIn", 1, 1, 1, 1);
            float identity[16] = {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
            auto set_uniform = [&](const std::string& name, const std::string& type, const std::vector<float>& values) {
                int location = gl.glGetUniformLocation(handleIt->second, name.c_str());
                if (location < 0) return;
                if (type == "vec4" && values.size() >= 4) gl.glUniform4fv(location, 1, values.data());
                else if (type == "vec3" && values.size() >= 3) gl.glUniform3f(location, values[0], values[1], values[2]);
                else if (!values.empty()) gl.glUniform1f(location, values[0]);
            };
            if (draw.viewMatrix.size() >= 16 && draw.projectionMatrix.size() >= 16) {
                uint32_t blockIndex = gl.glGetUniformBlockIndex(handleIt->second, "persistentBlock");
                if (blockIndex != GL_INVALID_INDEX) {
                    if (viewUbo == 0) gl.glGenBuffers(1, &viewUbo);
                    std::vector<float> block(32, 0.0f);
                    std::copy(draw.viewMatrix.begin(), draw.viewMatrix.begin() + 16, block.begin());
                    std::copy(draw.projectionMatrix.begin(), draw.projectionMatrix.begin() + 16, block.begin() + 16);
                    gl.glBindBuffer(GL_UNIFORM_BUFFER, viewUbo);
                    gl.glBufferData(GL_UNIFORM_BUFFER, block.size() * sizeof(float), block.data(), GL_STATIC_DRAW);
                    gl.glUniformBlockBinding(handleIt->second, blockIndex, 0);
                    gl.glBindBufferBase(GL_UNIFORM_BUFFER, 0, viewUbo);
                } else report.add_diag("warning", "renderer.draw-uniform-block-missing", "persistentBlock uniform block not found", draw.meshFile);
            }
            int modelMatrixLocation = gl.glGetUniformLocation(handleIt->second, "modelMatrix");
            if (modelMatrixLocation >= 0)
                gl.glUniformMatrix4fv(modelMatrixLocation, 1, 0, identity);
            set_uniform("quantizationScale", "vec4", draw.quantizationScale);
            set_uniform("lightmapColorAndSkylight", "vec4", {1.0f, 1.0f, 1.0f, 0.0f});
            int isAnimatedLocation = gl.glGetUniformLocation(handleIt->second, "isAnimated");
            if (isAnimatedLocation >= 0) gl.glUniform1i(isAnimatedLocation, 0);
            int isBlendShapesLocation = gl.glGetUniformLocation(handleIt->second, "isBlendShapes");
            if (isBlendShapesLocation >= 0) gl.glUniform1i(isBlendShapesLocation, 0);
            int shapeCountLocation = gl.glGetUniformLocation(handleIt->second, "activeBlendShapeCount");
            if (shapeCountLocation >= 0) gl.glUniform1i(shapeCountLocation, 0);
            int weightsLocation = gl.glGetUniformLocation(handleIt->second, "weightsPerVertex");
            if (weightsLocation >= 0) gl.glUniform1f(weightsLocation, 2.0f);
            int unitCounter = 1;
            std::vector<uint32_t> textureHandles;
            for (const DrawTextureEntry& texture : draw.textures) {
                if (!texture.file.empty()) {
                if (texture.file.empty()) continue;
                std::string textureError;
                std::vector<uint8_t> pixels = read_binary_file(bundleDir + "/" + texture.file, textureError);
                if (pixels.empty() || !textureError.empty()) {
                    ReportDiag diag;
                    diag.severity = "warning";
                    diag.code = "renderer.draw-texture-unreadable";
                    diag.message = textureError;
                    diag.source = texture.file;
                    drawReport.diagnostics.push_back(diag);
                    continue;
                }
                size_t expected = static_cast<size_t>(texture.width) * static_cast<size_t>(texture.height) * 4;
                if (pixels.size() < expected) {
                    ReportDiag diag;
                    diag.severity = "warning";
                    diag.code = "renderer.draw-texture-short";
                    diag.message = std::to_string(expected) + " bytes expected";
                    diag.source = texture.file;
                    drawReport.diagnostics.push_back(diag);
                    continue;
                }
                uint32_t unit = static_cast<uint32_t>(unitCounter++);
                gl.glActiveTexture(GL_TEXTURE0 + unit);
                uint32_t textureHandle = upload_texture(gl, texture.width, texture.height, pixels);
                gl.glBindTexture(GL_TEXTURE_2D, textureHandle);
                if (texture.textureIndex >= 0) {
                    int slotLocation = gl.glGetUniformLocation(handleIt->second, ("usedTextures[" + std::to_string(texture.textureIndex) + "]").c_str());
                    if (slotLocation >= 0) gl.glUniform1i(slotLocation, static_cast<int>(unit));
                }
                if (!texture.uniform.empty()) {
                    int mapLocation = gl.glGetUniformLocation(handleIt->second, texture.uniform.c_str());
                    if (mapLocation >= 0) gl.glUniform1i(mapLocation, texture.textureIndex);
                    int channelLocation = gl.glGetUniformLocation(handleIt->second,
                        texture.uniform == "specularMap" ? "specularChannel" :
                        texture.uniform == "glossMap" ? "glossChannel" : "g_aoChannel");
                    if (channelLocation >= 0 && texture.channel >= 0) gl.glUniform1i(channelLocation, texture.channel);
                }
                textureHandles.push_back(textureHandle);
                continue;
                }
                int slotLocation = gl.glGetUniformLocation(handleIt->second, ("usedTextures[" + std::to_string(texture.textureIndex) + "]").c_str());
                if (slotLocation >= 0) gl.glUniform1i(slotLocation, 0);
                if (!texture.uniform.empty()) {
                    int mapLocation = gl.glGetUniformLocation(handleIt->second, texture.uniform.c_str());
                    if (mapLocation >= 0) gl.glUniform1i(mapLocation, texture.textureIndex);
                }
            }
            for (const DrawUniformEntry& uniform : draw.uniforms) set_uniform(uniform.name, uniform.type, uniform.values);
            while (gl.glGetError() != 0) {}
            int neutralSamplerUnit = 0;
            {
                int activeCount = 0;
                gl.glGetProgramiv(handleIt->second, GL_ACTIVE_UNIFORMS, &activeCount);
                for (int i = 0; i < activeCount; i++) {
                    char name[96];
                    int nameLength = 0;
                    int uniformSize = 0;
                    uint32_t uniformType = 0;
                    gl.glActiveUniform_t(handleIt->second, static_cast<uint32_t>(i), static_cast<int>(sizeof(name)), &nameLength, &uniformSize, &uniformType, name);
                    if (nameLength <= 0) continue;
                    name[std::min(nameLength, static_cast<int>(sizeof(name) - 1))] = '\0';
                    if (uniformType != GL_SAMPLER_2D && uniformType != GL_SAMPLER_CUBE && uniformType != GL_SAMPLER_2D_SHADOW) continue;
                    if (std::strncmp(name, "usedTextures[", 13) == 0 || std::strncmp(name, "diffuseMap", 10) == 0 || std::strncmp(name, "specularMap", 11) == 0 || std::strncmp(name, "normalMap", 9) == 0 || std::strncmp(name, "glossMap", 8) == 0) continue;
                    int location = gl.glGetUniformLocation(handleIt->second, name);
                    if (location < 0) continue;
                    if (neutralSamplerUnit == 0) neutralSamplerUnit = std::max(unitCounter, 8);
                    unitCounter = std::max(unitCounter, neutralSamplerUnit) + 1;
                    int unit = neutralSamplerUnit++;
                    gl.glActiveTexture(GL_TEXTURE0 + unit);
                    if (uniformType == GL_SAMPLER_2D) gl.glBindTexture(GL_TEXTURE_2D, whiteFallback);
                    else if (uniformType == GL_SAMPLER_CUBE) {
                        const bool diffuseEnvironment = std::strstr(name, "Diffuse") != nullptr || std::strcmp(name, "envMap") == 0;
                        gl.glBindTexture(GL_TEXTURE_CUBE_MAP, diffuseEnvironment ? neutralCubeDiffuse : neutralCubeSpecular);
                    }
                    else if (uniformType == GL_SAMPLER_2D_SHADOW) gl.glBindTexture(GL_TEXTURE_2D, neutralShadowDepth);
                    gl.glUniform1i(location, unit);
                }
                if (neutralSamplerUnit != 0) {
                    gl.glActiveTexture(GL_TEXTURE0);
                    gl.glBindTexture(GL_TEXTURE_2D, whiteFallback);
                }
            }
             if (drawIndex == 0)
                 gl.glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);
            uint32_t drawError = 0;
            gl.glDrawElements(GL_TRIANGLES, draw.indexCount,
                draw.indexType == "u32" ? GL_UNSIGNED_INT : GL_UNSIGNED_SHORT, nullptr);
            drawError = gl.glGetError();
            if (drawError != 0) {
                drawReport.status = "failed";
                ReportDiag diag;
                diag.severity = "error";
                diag.code = "renderer.draw-gl-error";
                diag.message = "glGetError after draw: " + std::to_string(drawError);
                diag.source = draw.meshFile;
                drawReport.diagnostics.push_back(diag);
                drawnFailedCount++;
            } else {
                gl.glFinish();
                if (captureDirReady) {
                     std::vector<uint8_t> drawReadback(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);
                     gl.glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, drawReadback.data());
                     for (int y = 0; y < height / 2; y++) {
                         uint8_t* top = drawReadback.data() + static_cast<size_t>(y) * width * 4;
                         uint8_t* bottom = drawReadback.data() + static_cast<size_t>(height - 1 - y) * width * 4;
                         for (int x = 0; x < width * 4; x++) std::swap(top[x], bottom[x]);
                     }
                    std::string captureFile = captureDir + "/" + drawKey + "-" + draw.mesh + ".rgba";
                    std::string writeError;
                    if (!write_bytes(captureFile, drawReadback, writeError)) {
                        ReportDiag diag;
                        diag.severity = "error";
                        diag.code = "renderer.capture-write-failed";
                        diag.message = writeError;
                        diag.source = captureFile;
                        drawReport.diagnostics.push_back(diag);
                        drawnFailedCount++;
                    } else {
                        drawReport.status = "drawn";
                        drawnCount++;
                    }
                }
            }
            for (uint32_t textureHandle : textureHandles) gl.glDeleteTextures(1, &textureHandle);
            gl.glBindTexture(GL_TEXTURE_2D, whiteFallback);
            gl.glBindVertexArray(0);
            gl.glDeleteVertexArrays(1, &drawVao);
            gl.glBindBuffer(GL_ARRAY_BUFFER, 0);
            gl.glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
            gl.glDeleteBuffers(1, &vertexHandle);
            gl.glDeleteBuffers(1, &indexHandle);
            report.draws.emplace(drawKey, std::move(drawReport));
        }
        if (captureDirReady) {
            gl.glFinish();
            std::vector<uint8_t> assembledReadback(static_cast<size_t>(width) * static_cast<size_t>(height) * 4);
            gl.glReadPixels(0, 0, width, height, GL_RGBA, GL_UNSIGNED_BYTE, assembledReadback.data());
            for (int y = 0; y < height / 2; y++) {
                uint8_t* top = assembledReadback.data() + static_cast<size_t>(y) * width * 4;
                uint8_t* bottom = assembledReadback.data() + static_cast<size_t>(height - 1 - y) * width * 4;
                for (int x = 0; x < width * 4; x++) std::swap(top[x], bottom[x]);
            }
            const std::string assembledPath = captureDir + "/assembled.rgba";
            std::string assembledError;
            if (write_bytes(assembledPath, assembledReadback, assembledError)) {
                std::string digestError;
                CaptureOut assembled;
                assembled.path = "assembled.rgba";
                assembled.width = width;
                assembled.height = height;
                assembled.bytes = assembledReadback.size();
                assembled.sha256 = sha256_file(assembledPath, digestError);
                assembled.format = "rgba8";
                report.assembled = assembled;
            } else {
                report.add_diag("error", "renderer.assembled-write-failed", assembledError, assembledPath);
            }
        }
        gl.glActiveTexture(GL_TEXTURE0);
        if (whiteFallback != 0) gl.glDeleteTextures(1, &whiteFallback);
        if (viewUbo != 0) gl.glDeleteBuffers(1, &viewUbo);
        report.add_diag(drawnFailedCount == 0 ? "info" : "warning", "renderer.draws-summary",
            std::to_string(drawnCount) + " drawn, " + std::to_string(drawnFailedCount) + " failed", "draws");
    }
    if (report.capture) report.status = "ok";
    else report.status = failedCount == 0 && report.diagnostics.empty() ? "ok" : "partial";

    print_json_and_flush(report);
    eglTerminate(display);
    return 0;
}
