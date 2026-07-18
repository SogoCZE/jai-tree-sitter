// External scanner for the Jai tree-sitter grammar.
//
// Handles three things the built-in lexer cannot express:
//   1. Nested block comments:  /* outer /* inner */ still comment */
//   2. Here-strings:           #string DELIM ... DELIM
//   3. Opaque #asm bodies:     #asm { ... }  (balanced braces, strings and
//      comments respected; the content has its own micro-syntax we do not
//      attempt to parse)

#include "tree_sitter/parser.h"

#include <stdlib.h>
#include <string.h>
#include <wctype.h>

enum TokenType {
  BLOCK_COMMENT,
  HERE_STRING_DELIMITER,
  HERE_STRING_BODY,
  HERE_STRING_END,
  ASM_BODY,
  STRING_CONTENT,
  ERROR_SENTINEL,
};

#define MAX_DELIMITER_LENGTH 64

typedef struct {
  uint8_t delimiter_length;
  char delimiter[MAX_DELIMITER_LENGTH];
} Scanner;

static inline void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static inline void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static inline bool is_identifier_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_';
}

// ---------------------------------------------------------------------------
// Nested block comments
// ---------------------------------------------------------------------------

static bool scan_block_comment(TSLexer *lexer) {
  while (iswspace(lexer->lookahead)) skip(lexer);
  if (lexer->lookahead != '/') return false;
  advance(lexer);
  if (lexer->lookahead != '*') return false;
  advance(lexer);

  unsigned depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) break;
    int32_t c = lexer->lookahead;
    advance(lexer);
    if (c == '/' && lexer->lookahead == '*') {
      advance(lexer);
      depth += 1;
    } else if (c == '*' && lexer->lookahead == '/') {
      advance(lexer);
      depth -= 1;
    }
  }

  lexer->result_symbol = BLOCK_COMMENT;
  lexer->mark_end(lexer);
  return true;
}

// ---------------------------------------------------------------------------
// Here-strings: #string DELIM ... DELIM
// ---------------------------------------------------------------------------

static bool scan_here_string_delimiter(Scanner *scanner, TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') skip(lexer);

  scanner->delimiter_length = 0;
  while (is_identifier_char(lexer->lookahead)) {
    if (scanner->delimiter_length < MAX_DELIMITER_LENGTH) {
      scanner->delimiter[scanner->delimiter_length++] = (char)lexer->lookahead;
    }
    advance(lexer);
  }

  if (scanner->delimiter_length == 0) return false;
  lexer->result_symbol = HERE_STRING_DELIMITER;
  lexer->mark_end(lexer);
  return true;
}

// Returns true when the current line (cursor at line start) consists of
// optional indentation, the end delimiter, optional trailing whitespace and
// a line end. Advances the lexer while checking; the caller relies on a
// previous mark_end() so over-consumption on mismatch is harmless.
static bool line_is_end_delimiter(Scanner *scanner, TSLexer *lexer) {
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
  for (uint8_t i = 0; i < scanner->delimiter_length; i++) {
    if (lexer->lookahead != scanner->delimiter[i]) return false;
    advance(lexer);
  }
  // The delimiter ends the string as long as it is not merely a prefix of a
  // longer identifier; code may continue on the same line (e.g. `END);`).
  return !is_identifier_char(lexer->lookahead);
}

// Scans the here-string body. When the body is empty (the end delimiter
// appears immediately on the next line) it emits HERE_STRING_END directly,
// because the scanner cannot rewind and a second scan call would not happen.
static bool scan_here_string_body(Scanner *scanner, TSLexer *lexer, const bool *valid_symbols) {
  if (scanner->delimiter_length == 0) return false;

  // Consume the remainder of the delimiter's own line (not content).
  while (lexer->lookahead != '\n') {
    if (lexer->eof(lexer)) return false;
    advance(lexer);
  }
  advance(lexer); // the newline

  bool has_content = false;
  for (;;) {
    lexer->mark_end(lexer);
    if (lexer->eof(lexer)) {
      lexer->result_symbol = HERE_STRING_BODY;
      return has_content;
    }
    // At a line start: check for the (possibly indented) end delimiter.
    if (line_is_end_delimiter(scanner, lexer)) {
      if (has_content) {
        lexer->result_symbol = HERE_STRING_BODY; // mark_end excluded this line
        return true;
      }
      // Empty body: emit the end token directly (it includes the newline).
      if (valid_symbols[HERE_STRING_END]) {
        lexer->mark_end(lexer);
        lexer->result_symbol = HERE_STRING_END;
        scanner->delimiter_length = 0;
        return true;
      }
      return false;
    }
    // Not the delimiter: consume the rest of this line as content.
    while (lexer->lookahead != '\n') {
      if (lexer->eof(lexer)) {
        lexer->mark_end(lexer);
        lexer->result_symbol = HERE_STRING_BODY;
        return true;
      }
      advance(lexer);
    }
    advance(lexer); // the newline
    has_content = true;
  }
}

static bool scan_here_string_end(Scanner *scanner, TSLexer *lexer) {
  if (scanner->delimiter_length == 0) return false;
  // Skip whitespace/newlines that separate the (possibly empty) body token
  // from the closing delimiter.
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    skip(lexer);
  }
  for (uint8_t i = 0; i < scanner->delimiter_length; i++) {
    if (lexer->lookahead != scanner->delimiter[i]) return false;
    advance(lexer);
  }
  if (is_identifier_char(lexer->lookahead)) return false;

  scanner->delimiter_length = 0;
  lexer->result_symbol = HERE_STRING_END;
  lexer->mark_end(lexer);
  return true;
}

// ---------------------------------------------------------------------------
// #asm bodies: consume balanced braces without interpreting the contents
// ---------------------------------------------------------------------------

static bool scan_asm_body(TSLexer *lexer) {
  unsigned depth = 1;
  bool has_content = false;

  for (;;) {
    if (lexer->eof(lexer)) return false;
    int32_t c = lexer->lookahead;

    if (c == '}') {
      if (depth == 1) {
        lexer->mark_end(lexer);
        lexer->result_symbol = ASM_BODY;
        return has_content;
      }
      depth -= 1;
      advance(lexer);
    } else if (c == '{') {
      depth += 1;
      advance(lexer);
    } else if (c == '"') {
      advance(lexer);
      while (!lexer->eof(lexer) && lexer->lookahead != '"' && lexer->lookahead != '\n') {
        if (lexer->lookahead == '\\') advance(lexer);
        if (!lexer->eof(lexer)) advance(lexer);
      }
      if (lexer->lookahead == '"') advance(lexer);
    } else if (c == '/') {
      advance(lexer);
      if (lexer->lookahead == '/') {
        while (!lexer->eof(lexer) && lexer->lookahead != '\n') advance(lexer);
      } else if (lexer->lookahead == '*') {
        advance(lexer);
        unsigned comment_depth = 1;
        while (comment_depth > 0 && !lexer->eof(lexer)) {
          int32_t cc = lexer->lookahead;
          advance(lexer);
          if (cc == '/' && lexer->lookahead == '*') { advance(lexer); comment_depth++; }
          else if (cc == '*' && lexer->lookahead == '/') { advance(lexer); comment_depth--; }
        }
      }
    } else {
      if (!iswspace(c)) has_content = true;
      advance(lexer);
    }
    if (c != '{' && c != '}' && !iswspace(c)) has_content = true;
  }
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

void *tree_sitter_jai_external_scanner_create(void) {
  Scanner *scanner = calloc(1, sizeof(Scanner));
  return scanner;
}

void tree_sitter_jai_external_scanner_destroy(void *payload) {
  free(payload);
}

unsigned tree_sitter_jai_external_scanner_serialize(void *payload, char *buffer) {
  Scanner *scanner = (Scanner *)payload;
  buffer[0] = (char)scanner->delimiter_length;
  memcpy(buffer + 1, scanner->delimiter, scanner->delimiter_length);
  return 1u + scanner->delimiter_length;
}

void tree_sitter_jai_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  Scanner *scanner = (Scanner *)payload;
  scanner->delimiter_length = 0;
  if (length >= 1) {
    scanner->delimiter_length = (uint8_t)buffer[0];
    if (scanner->delimiter_length > MAX_DELIMITER_LENGTH) scanner->delimiter_length = 0;
    if ((unsigned)scanner->delimiter_length + 1 <= length) {
      memcpy(scanner->delimiter, buffer + 1, scanner->delimiter_length);
    } else {
      scanner->delimiter_length = 0;
    }
  }
}

bool tree_sitter_jai_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  Scanner *scanner = (Scanner *)payload;

  // Do not interfere with tree-sitter's error recovery.
  if (valid_symbols[ERROR_SENTINEL]) return false;

  // Inside a string literal: claim content before anything else so that the
  // block-comment scanner never fires on "/*" inside a string.
  if (valid_symbols[STRING_CONTENT]) {
    bool has_content = false;
    while (!lexer->eof(lexer) && lexer->lookahead != '"' &&
           lexer->lookahead != '\\' && lexer->lookahead != '\n') {
      advance(lexer);
      has_content = true;
    }
    if (has_content) {
      lexer->result_symbol = STRING_CONTENT;
      lexer->mark_end(lexer);
      return true;
    }
    return false;
  }

  if (valid_symbols[HERE_STRING_BODY] && scanner->delimiter_length > 0) {
    return scan_here_string_body(scanner, lexer, valid_symbols);
  }
  if (valid_symbols[HERE_STRING_END] && scanner->delimiter_length > 0) {
    return scan_here_string_end(scanner, lexer);
  }
  if (valid_symbols[HERE_STRING_DELIMITER]) {
    return scan_here_string_delimiter(scanner, lexer);
  }
  if (valid_symbols[ASM_BODY]) {
    return scan_asm_body(lexer);
  }
  if (valid_symbols[BLOCK_COMMENT]) {
    return scan_block_comment(lexer);
  }
  return false;
}
