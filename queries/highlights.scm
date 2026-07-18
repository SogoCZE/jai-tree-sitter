(comment) @comment
(block_comment) @comment
(note) @attribute

(number) @number
(boolean) @boolean
(null) @constant.builtin
(uninitialized) @constant.builtin

(string_literal) @string
(escape_sequence) @string.escape
(here_string) @string
(here_string_delimiter) @string.special
(char_literal (string_literal) @string.special)

(declaration
  name: (identifier) @function
  value: (value_list (procedure)))

(declaration
  name: (identifier) @function
  value: (value_list (inline_expression (procedure))))

(declaration
  name: (operator_name) @function)

(call_expression
  function: (identifier) @function)

(call_expression
  function: (member_expression
    member: (identifier) @function))

(lambda_expression
  parameters: (identifier) @variable.parameter)

(declaration
  name: (identifier) @type
  value: (value_list (struct_type)))

(declaration
  name: (identifier) @type
  value: (value_list (enum_type)))

(declaration
  name: (identifier) @type
  value: (value_list (type_directive)))

(declaration type: (identifier) @type)
(parameter type: (identifier) @type)
(named_return type: (identifier) @type)
(pointer_type (identifier) @type)
(array_type element: (identifier) @type)
(member_type (identifier) @type)
(parameterized_type (identifier) @type)
(polymorphic_type name: (identifier) @type)
(polymorphic_type constraint: (identifier) @type)
(cast_expression type: (identifier) @type)
(postfix_cast type: (identifier) @type)
(struct_literal type: (identifier) @type)
(array_literal type: (identifier) @type)
(enum_type backing_type: (identifier) @type)
(struct_type tag_type: (identifier) @type)
(type_directive (identifier) @type)
(context_type) @type

((identifier) @type.builtin
  (#any-of? @type.builtin
    "int" "s8" "s16" "s32" "s64" "u8" "u16" "u32" "u64"
    "float" "float32" "float64" "bool" "string" "void"
    "Any" "Type" "Code"))

((identifier) @constant
  (#match? @constant "^[A-Z][A-Z0-9_]+$"))

(unary_dot member: (identifier) @constant)

(enum_body
  (declaration name: (identifier) @constant))

(enum_body
  (expression_statement (identifier) @constant))

(member_expression member: (identifier) @property)
(named_argument name: (identifier) @property)
(named_literal_field name: (identifier) @property)
(named_value name: (identifier) @property)
(named_return name: (identifier) @variable.parameter)
(parameter name: (identifier) @variable.parameter)

(backtick_identifier) @variable.special

((identifier) @variable.special
  (#any-of? @variable.special "it" "it_index" "context" "temp"))

(break_statement label: (identifier) @label)
(continue_statement label: (identifier) @label)

[
  "if" "then" "else" "case"
  "for" "while" "break" "continue" "remove"
  "return" "defer" "using"
  "struct" "union" "enum" "enum_flags"
  "cast" "xx" "ifx" "inline" "no_inline"
  "operator" "push_context" "interface"
  "`return" "`defer" "`push_context"
] @keyword

[
  "#if" "#assert" "#through" "#complete"
  "#import" "#load" "#run" "#insert" "#insert_internal"
  "#char" "#string" "#code"
  "#scope_file" "#scope_module" "#scope_export"
  "#module_parameters" "#add_context" "#placeholder" "#poke_name"
  "#program_export" "#no_reset" "#bytes" "#asm"
  "#type" "#bake_arguments" "#bake_constants" "#library"
  "#foreign" "#elsewhere" "#deprecated" "#intrinsic" "#modify"
  "#expand" "#c_call" "#no_context" "#no_debug" "#no_abc" "#no_aoc"
  "#no_alias" "#no_call" "#symmetric" "#compiler" "#compile_time"
  "#entry_point" "#dump" "#cpp_method" "#cpp_return_type_is_non_pod"
  "#type_info_none" "#type_info_procedures_are_void_pointers"
  "#type_info_no_size_complaint" "#no_padding"
  "#align" "#overlay" "#specified" "#discard" "#as" "#must" "#ifx"
  "#caller_location" "#caller_code" "#filepath" "#file" "#line"
  "#this" "#command_line_arguments" "#location" "#exists"
  "#procedure_of_call" "#procedure_name"
] @keyword.directive

(asm_body) @embedded

[
  "+" "-" "*" "/" "%"
  "==" "!=" "<" "<=" ">" ">="
  "&&" "||" "!"
  "&" "|" "^" "~"
  "<<" ">>" "<<<" ">>>"
  "=" "+=" "-=" "*=" "/=" "%="
  "&=" "|=" "^=" "<<=" ">>=" "<<<=" ">>>=" "&&=" "||="
  ".." "=>" "->" "$" "$$"
] @operator

["{" "}" "(" ")" "[" "]"] @punctuation.bracket

["," ";" ":" "::" ":=" "." ",,"] @punctuation.delimiter
