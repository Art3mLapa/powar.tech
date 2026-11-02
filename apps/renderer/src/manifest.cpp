#include "spike.h"

#include <cstdlib>
#include <memory>

namespace {

struct JsonDom {
    enum class Kind { Value, String, Number, Object, Array, Bool, Null };
    Kind kind = Kind::Null;
    std::string text;
    double number = 0;
    std::vector<std::pair<std::string, std::unique_ptr<JsonDom>>> members;
    std::vector<std::unique_ptr<JsonDom>> items;

    const JsonDom* get(const std::string& key) const {
        for (const auto& member : members) {
            if (member.first == key) return member.second.get();
        }
        return nullptr;
    }
};

struct JsonParser {
    const char* begin;
    const char* end;
    size_t pos = 0;
    std::string error;

    explicit JsonParser(const std::string& source) : begin(source.data()), end(source.data() + source.size()) {}

    bool done() {
        skip_ws();
        return pos >= static_cast<size_t>(end - begin) || error.size() > 0;
    }

    void skip_ws() {
        while (pos < static_cast<size_t>(end - begin)) {
            char c = begin[pos];
            if (c == ' ' || c == '\t' || c == '\n' || c == '\r') pos++;
            else if (c == '/' && pos + 1 < static_cast<size_t>(end - begin) && begin[pos + 1] == '/') {
                while (pos < static_cast<size_t>(end - begin) && begin[pos] != '\n') pos++;
            } else break;
        }
    }

    char peek() {
        skip_ws();
        return pos < static_cast<size_t>(end - begin) ? begin[pos] : '\0';
    }

    std::unique_ptr<JsonDom> parse() {
        auto value = parse_value();
        if (error.empty()) skip_ws();
        return value;
    }

    std::unique_ptr<JsonDom> parse_value() {
        char c = peek();
        if (error.size() > 0) return nullptr;
        if (c == '{') return parse_object();
        if (c == '[') return parse_array();
        if (c == '"') {
            auto out = std::make_unique<JsonDom>();
            out->kind = JsonDom::Kind::String;
            out->text = parse_string();
            return out;
        }
        if (c == 't' || c == 'f') {
            auto out = std::make_unique<JsonDom>();
            out->kind = JsonDom::Kind::Bool;
            static const char* kTrue = "true";
            static const char* kFalse = "false";
            const char* token = c == 't' ? kTrue : kFalse;
            for (int i = 0; token[i] != '\0'; i++) {
                if (pos + static_cast<size_t>(i) >= static_cast<size_t>(end - begin) || begin[pos + static_cast<size_t>(i)] != token[i]) {
                    fail("bad literal");
                    return out;
                }
            }
            out->number = c == 't' ? 1 : 0;
            pos += c == 't' ? 4 : 5;
            return out;
        }
        if (c == '-' || (c >= '0' && c <= '9')) {
            auto out = std::make_unique<JsonDom>();
            out->kind = JsonDom::Kind::Number;
            size_t start = pos;
            if (c == '-') pos++;
            bool exponent = false;
            while (pos < static_cast<size_t>(end - begin)) {
                char d = begin[pos];
                if (d == '.' || d == '-' || d == '+' || d == 'e' || d == 'E') exponent = true;
                if ((d >= '0' && d <= '9') || d == '.' || d == '-' || d == '+' || d == 'e' || d == 'E') pos++;
                else break;
            }
            out->number = std::strtod(begin + start, nullptr);
            if (!exponent && out->number == static_cast<double>(static_cast<long long>(out->number))) out->kind = JsonDom::Kind::Number;
            (void)exponent;
            return out;
        }
        if (c == 'n' && pos + 4 <= static_cast<size_t>(end - begin) && begin[pos + 1] == 'u' && begin[pos + 2] == 'l' && begin[pos + 3] == 'l') {
            pos += 4;
            auto out = std::make_unique<JsonDom>();
            out->kind = JsonDom::Kind::Null;
            return out;
        }
        fail(std::string("unexpected character '") + c + "'");
        return nullptr;
    }

    std::unique_ptr<JsonDom> parse_object() {
        auto out = std::make_unique<JsonDom>();
        out->kind = JsonDom::Kind::Object;
        pos++;
        if (peek() == '}') {
            pos++;
            return out;
        }
        while (true) {
            std::string key = parse_string();
            if (error.size() > 0) return nullptr;
            if (peek() != ':') {
                fail("expected ':'");
                return nullptr;
            }
            pos++;
            auto value = parse_value();
            if (error.size() > 0) return nullptr;
            out->members.emplace_back(std::move(key), std::move(value));
            char next = peek();
            if (next == ',') {
                pos++;
                continue;
            }
            if (next == '}') {
                pos++;
                return out;
            }
            fail("expected ',' or '}' in object");
            return nullptr;
        }
    }

    std::unique_ptr<JsonDom> parse_array() {
        auto out = std::make_unique<JsonDom>();
        out->kind = JsonDom::Kind::Array;
        pos++;
        if (peek() == ']') {
            pos++;
            return out;
        }
        while (true) {
            auto value = parse_value();
            if (error.size() > 0) return nullptr;
            out->items.push_back(std::move(value));
            char next = peek();
            if (next == ',') {
                pos++;
                continue;
            }
            if (next == ']') {
                pos++;
                return out;
            }
            fail("expected ',' or ']' in array");
            return nullptr;
        }
    }

    std::string parse_string() {
        std::string out;
        if (peek() != '"') {
            fail("expected string");
            return out;
        }
        pos++;
        while (pos < static_cast<size_t>(end - begin)) {
            char c = begin[pos++];
            if (c == '"') return out;
            if (c == '\\' && pos < static_cast<size_t>(end - begin)) {
                char escape = begin[pos++];
                switch (escape) {
                    case '"': out += '"'; break;
                    case '\\': out += '\\'; break;
                    case '/': out += '/'; break;
                    case 'b': out += '\b'; break;
                    case 'f': out += '\f'; break;
                    case 'n': out += '\n'; break;
                    case 'r': out += '\r'; break;
                    case 't': out += '\t'; break;
                    case 'u': {
                        if (pos + 4 > static_cast<size_t>(end - begin)) {
                            fail("bad unicode escape");
                            return out;
                        }
                        unsigned code = static_cast<unsigned>(std::strtoul(std::string(begin + pos, 4).c_str(), nullptr, 16));
                        pos += 4;
                        if (code < 0x80) {
                            out += static_cast<char>(code);
                        } else if (code < 0x800) {
                            out += static_cast<char>(0xC0 | (code >> 6));
                            out += static_cast<char>(0x80 | (code & 0x3F));
                        } else {
                            out += static_cast<char>(0xE0 | (code >> 12));
                            out += static_cast<char>(0x80 | ((code >> 6) & 0x3F));
                            out += static_cast<char>(0x80 | (code & 0x3F));
                        }
                        break;
                    }
                    default: out += escape; break;
                }
            } else out += c;
        }
        fail("unterminated string");
        return out;
    }

    void fail(const std::string& message) {
        if (error.empty()) error = message + " at byte " + std::to_string(pos);
    }
};

}  // namespace

SpikeManifest parse_manifest(const std::string& path, std::string& error) {
    SpikeManifest manifest;
    FILE* file = fopen(path.c_str(), "rb");
    if (!file) {
        error = "manifest not readable: " + path;
        return manifest;
    }
    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);
    std::string text(static_cast<size_t>(size > 0 ? size : 0), '\0');
    if (size > 0) {
        size_t got = fread(text.data(), 1, text.size(), file);
        text.resize(got);
    }
    fclose(file);

    JsonParser parser(text);
    auto root = parser.parse();
    if (parser.error.size() > 0) {
        error = "manifest parse: " + parser.error;
        return manifest;
    }
    if (!root || root->kind != JsonDom::Kind::Object) {
        error = "manifest root is not an object";
        return manifest;
    }
    manifest.width = 256;
    manifest.height = 256;
    if (const JsonDom* schema = root->get("schema")) manifest.schema = schema->text;
    if (const JsonDom* noteList = root->get("notes")) {
        if (noteList->kind == JsonDom::Kind::Array) {
            for (const auto& item : noteList->items) manifest.notes.push_back(item->text);
        }
    }
    if (const JsonDom* capture = root->get("capture")) {
        if (capture->kind == JsonDom::Kind::Object) {
            if (const JsonDom* width = capture->get("width")) manifest.width = static_cast<int>(width->number);
            if (const JsonDom* height = capture->get("height")) manifest.height = static_cast<int>(height->number);
            if (const JsonDom* readback = capture->get("readback")) manifest.readback = readback->text;
        }
    }
    if (const JsonDom* programList = root->get("programs")) {
        if (programList->kind == JsonDom::Kind::Array) {
            for (const auto& item : programList->items) {
                if (item->kind != JsonDom::Kind::Object) continue;
                SpikeProgramEntry entry;
                if (const JsonDom* name = item->get("name")) entry.name = name->text;
                if (const JsonDom* vertex = item->get("vertex")) entry.vertex = vertex->text;
                if (const JsonDom* fragment = item->get("fragment")) entry.fragment = fragment->text;
                if (const JsonDom* defineList = item->get("defines")) {
                    if (defineList->kind == JsonDom::Kind::Array) {
                        for (const auto& define : defineList->items) entry.defines.push_back(define->text);
                    }
                }
                manifest.programs.push_back(std::move(entry));
            }
        }
    }
    if (const JsonDom* drawList = root->get("draws")) {
        if (drawList->kind == JsonDom::Kind::Array) {
            for (const auto& item : drawList->items) {
                if (item->kind != JsonDom::Kind::Object) continue;
                DrawEntry entry;
                if (const JsonDom* value = item->get("program")) entry.program = value->text;
                if (const JsonDom* value = item->get("material")) entry.material = value->text;
                if (const JsonDom* value = item->get("mesh")) entry.mesh = value->text;
                if (const JsonDom* value = item->get("meshFile")) entry.meshFile = value->text;
                if (const JsonDom* value = item->get("indicesFile")) entry.indicesFile = value->text;
                if (const JsonDom* value = item->get("vertexCount")) entry.vertexCount = static_cast<int>(value->number);
                if (const JsonDom* value = item->get("indexCount")) entry.indexCount = static_cast<int>(value->number);
                if (const JsonDom* value = item->get("indexType")) entry.indexType = value->text;
                if (const JsonDom* value = item->get("quantizationScale")) {
                    if (value->kind == JsonDom::Kind::Array) {
                        entry.quantizationScale.clear();
                        for (const auto& number : value->items) entry.quantizationScale.push_back(static_cast<float>(number->number));
                    }
                }
                if (const JsonDom* value = item->get("viewMatrix")) {
                    if (value->kind == JsonDom::Kind::Array) {
                        for (const auto& number : value->items) entry.viewMatrix.push_back(static_cast<float>(number->number));
                    }
                }
                if (const JsonDom* value = item->get("projectionMatrix")) {
                    if (value->kind == JsonDom::Kind::Array) {
                        for (const auto& number : value->items) entry.projectionMatrix.push_back(static_cast<float>(number->number));
                    }
                }
                if (const JsonDom* textureList = item->get("textures")) {
                    if (textureList->kind == JsonDom::Kind::Array) {
                        for (const auto& texture : textureList->items) {
                            if (texture->kind != JsonDom::Kind::Object) continue;
                            DrawTextureEntry textureEntry;
                            if (const JsonDom* value = texture->get("uniform")) textureEntry.uniform = value->text;
                            if (const JsonDom* value = texture->get("textureIndex")) textureEntry.textureIndex = static_cast<int>(value->number);
                            if (const JsonDom* value = texture->get("channel")) textureEntry.channel = static_cast<int>(value->number);
                            if (const JsonDom* value = texture->get("width")) textureEntry.width = static_cast<int>(value->number);
                            if (const JsonDom* value = texture->get("height")) textureEntry.height = static_cast<int>(value->number);
                            if (const JsonDom* value = texture->get("file")) textureEntry.file = value->text;
                            entry.textures.push_back(std::move(textureEntry));
                        }
                    }
                }
                if (const JsonDom* uniformList = item->get("uniformValues")) {
                    if (uniformList->kind == JsonDom::Kind::Array) {
                        for (const auto& uniform : uniformList->items) {
                            if (uniform->kind != JsonDom::Kind::Object) continue;
                            DrawUniformEntry uniformEntry;
                            if (const JsonDom* value = uniform->get("name")) uniformEntry.name = value->text;
                            if (const JsonDom* value = uniform->get("type")) uniformEntry.type = value->text;
                            if (const JsonDom* value = uniform->get("values")) {
                                if (value->kind == JsonDom::Kind::Array) {
                                    for (const auto& number : value->items) uniformEntry.values.push_back(static_cast<float>(number->number));
                                }
                            }
                            entry.uniforms.push_back(std::move(uniformEntry));
                        }
                    }
                }
                manifest.draws.push_back(std::move(entry));
            }
        }
    }
    return manifest;
}
