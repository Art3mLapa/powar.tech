#include "spike.h"

#include <cstdio>
#include <string>

namespace {

std::string json_escape(const std::string& input) {
    std::string out;
    for (char c : input) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buffer[8];
                    std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
                    out += buffer;
                } else out += c;
                break;
        }
    }
    return out;
}

void write_diag(std::string& out, const ReportDiag& diag) {
    out += "{\"severity\":\"";
    out += json_escape(diag.severity);
    out += "\",\"code\":\"";
    out += json_escape(diag.code);
    out += "\",\"message\":\"";
    out += json_escape(diag.message);
    out += "\",\"source\":\"";
    out += json_escape(diag.source);
    out += "\",\"line\":";
    out += diag.line >= 0 ? std::to_string(diag.line) : std::string("null");
    out += "}";
}

void write_diag_array(std::string& out, const std::vector<ReportDiag>& diags) {
    out += "[";
    for (size_t i = 0; i < diags.size(); i++) {
        if (i > 0) out += ",";
        write_diag(out, diags[i]);
    }
    out += "]";
}

}  // namespace

std::string render_report_json(const RendererReport& report) {
    std::string out;
    out += "{";
    out += "\"reportVersion\":\"" + json_escape(report.reportVersion) + "\",";
    out += "\"rendererVersion\":\"" + json_escape(report.rendererVersion) + "\",";
    out += "\"status\":\"" + json_escape(report.status) + "\"";
    out += ",\"backend\":{";
    out += "\"platform\":\"" + json_escape(report.backend.platform) + "\",";
    out += "\"contextProfile\":\"" + json_escape(report.backend.contextProfile) + "\",";
    out += "\"version\":\"" + json_escape(report.backend.version) + "\",";
    out += "\"versionMajor\":" + std::to_string(report.backend.versionMajor) + ",";
    out += "\"versionMinor\":" + std::to_string(report.backend.versionMinor) + ",";
    out += "\"shadingLanguage\":\"" + json_escape(report.backend.shadingLanguage) + "\",";
    out += "\"vendor\":\"" + json_escape(report.backend.vendor) + "\",";
    out += "\"rendererString\":\"" + json_escape(report.backend.rendererString) + "\",";
    out += "\"extensions\":[";
    for (size_t i = 0; i < report.backend.extensions.size(); i++) {
        if (i > 0) out += ",";
        out += "\"" + json_escape(report.backend.extensions[i]) + "\"";
    }
    out += "]}";
    out += ",\"programs\":{";
    for (size_t i = 0; i < report.programOrder.size(); i++) {
        const std::string& name = report.programOrder[i];
        const ProgramReport& program = report.programs.at(name);
        if (i > 0) out += ",";
        out += "\"" + json_escape(name) + "\":{";
        out += "\"status\":\"" + json_escape(program.status) + "\",";
        out += "\"vertexStatus\":\"" + json_escape(program.vertexStatus) + "\",";
        out += "\"fragmentStatus\":\"" + json_escape(program.fragmentStatus) + "\",";
        out += "\"logTruncated\":" + std::to_string(program.logTruncated) + ",";
        out += "\"diagnostics\":";
        write_diag_array(out, program.diagnostics);
        out += "}";
    }
    out += "}";
    if (!report.draws.empty()) {
        out += ",\"draws\":{";
        bool firstDraw = true;
        for (const auto& entry : report.draws) {
            if (!firstDraw) out += ",";
            firstDraw = false;
            const DrawReport& draw = entry.second;
            out += "\"" + json_escape(entry.first) + "\":{";
            out += "\"status\":\"" + json_escape(draw.status) + "\",";
            out += "\"mesh\":\"" + json_escape(draw.mesh) + "\",";
            out += "\"program\":\"" + json_escape(draw.program) + "\",";
            out += "\"indexCount\":" + std::to_string(draw.indexCount) + ",";
            out += "\"diagnostics\":";
            write_diag_array(out, draw.diagnostics);
            out += "}";
        }
        out += "}";
    }
    out += ",\"capture\":";
    if (report.capture) {
        const CaptureOut& capture = *report.capture;
        out += "{";
        out += "\"path\":\"" + json_escape(capture.path) + "\",";
        out += "\"width\":" + std::to_string(capture.width) + ",";
        out += "\"height\":" + std::to_string(capture.height) + ",";
        out += "\"bytes\":" + std::to_string(capture.bytes) + ",";
        out += "\"sha256\":\"" + json_escape(capture.sha256) + "\",";
        out += "\"format\":\"" + json_escape(capture.format) + "\"";
        out += "}";
    } else out += "null";
    out += ",\"assembled\":";
    if (report.assembled) {
        const CaptureOut& capture = *report.assembled;
        out += "{\"path\":\"" + json_escape(capture.path) + "\",";
        out += "\"width\":" + std::to_string(capture.width) + ",";
        out += "\"height\":" + std::to_string(capture.height) + ",";
        out += "\"bytes\":" + std::to_string(capture.bytes) + ",";
        out += "\"sha256\":\"" + json_escape(capture.sha256) + "\",";
        out += "\"format\":\"" + json_escape(capture.format) + "\"}";
    } else out += "null";
    out += ",\"timings\":{\"contextMs\":" + std::to_string(report.contextMs) + ",\"compileMs\":" + std::to_string(report.compileMs) + ",\"renderMs\":" + std::to_string(report.renderMs) + ",\"readMs\":" + std::to_string(report.readMs) + "}";
    out += ",\"diagnostics\":";
    write_diag_array(out, report.diagnostics);
    out += ",\"contractVersion\":\"renderer-spike.1\"}";
    return out;
}
