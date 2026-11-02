#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

struct ReportDiag {
    std::string severity = "info";
    std::string code;
    std::string message;
    std::string source;
    int line = -1;
};

struct ProgramReport {
    std::string status = "failed";
    std::string vertexStatus = "missing";
    std::string fragmentStatus = "missing";
    int logTruncated = 0;
    std::vector<ReportDiag> diagnostics;
};

struct CaptureOut {
    std::string path;
    int width = 0;
    int height = 0;
    uint64_t bytes = 0;
    std::string sha256;
    std::string format = "rgba8";
};

struct BackendOut {
    std::string platform;
    std::string contextProfile;
    std::string version;
    int versionMajor = 0;
    int versionMinor = 0;
    std::string shadingLanguage;
    std::string vendor;
    std::string rendererString;
    std::vector<std::string> extensions;
};

struct DrawReport {
    std::string status = "failed";
    std::string mesh;
    std::string program;
    int indexCount = 0;
    std::vector<ReportDiag> diagnostics;
};

struct RendererReport {
    std::string reportVersion = "renderer-report.1";
    std::string rendererVersion = "bscp-renderer-spike.0";
    std::string status = "ok";
    BackendOut backend;
    std::vector<std::string> programOrder;
    std::map<std::string, ProgramReport> programs;
    std::map<std::string, DrawReport> draws;
    std::optional<CaptureOut> capture;
    std::optional<CaptureOut> assembled;
    uint64_t contextMs = 0;
    uint64_t compileMs = 0;
    uint64_t renderMs = 0;
    uint64_t readMs = 0;
    std::vector<ReportDiag> diagnostics;

    void add_diag(const std::string& severity, const std::string& code, const std::string& message, const std::string& source = "", int line = -1) {
        ReportDiag entry;
        entry.severity = severity;
        entry.code = code;
        entry.message = message;
        entry.source = source;
        entry.line = line;
        diagnostics.push_back(std::move(entry));
    }
};

struct SpikeProgramEntry {
    std::string name;
    std::string vertex;
    std::string fragment;
    std::vector<std::string> defines;
};

struct DrawTextureEntry {
    std::string uniform;
    int textureIndex = -1;
    int channel = -1;
    std::string file;
    int width = 0;
    int height = 0;
};

struct DrawUniformEntry {
    std::string name;
    std::string type;
    std::vector<float> values;
};

struct DrawEntry {    std::string program;
    std::string material;
    std::string mesh;
    std::string meshFile;
    std::string indicesFile;
    int vertexCount = 0;
    int indexCount = 0;
    std::string indexType = "u16";
    std::vector<DrawTextureEntry> textures;
    std::vector<DrawUniformEntry> uniforms;
    std::vector<float> quantizationScale = {1.0f, 1.0f, 0.0f, 1.0f};
    std::vector<float> viewMatrix;
    std::vector<float> projectionMatrix;
};

struct SpikeManifest {
    std::string schema;
    std::vector<SpikeProgramEntry> programs;
    std::vector<DrawEntry> draws;
    int width = 256;
    int height = 256;
    std::string readback;
    std::vector<std::string> notes;
};

SpikeManifest parse_manifest(const std::string& path, std::string& error);

std::string render_report_json(const RendererReport& report);

std::string sha256_file(const std::string& path, std::string& error);
std::string sha256_bytes(const uint8_t* data, size_t length);
