/// <reference types="tree-sitter-cli/dsl" />

const PREC = {
	ASSIGN: 1,
	RANGE: 2,
	OR: 3,
	AND: 4,
	BOR: 5,
	BXOR: 6,
	BAND: 7,
	EQ: 8,
	CMP: 9,
	SHIFT: 10,
	ADD: 11,
	MUL: 12,
	UNARY: 13,
	CAST: 14,
	CALL: 16,
	MEMBER: 17,
};

const ASSIGN_OPS = [
	'=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
	'<<=', '>>=', '<<<=', '>>>=', '&&=', '||=',
];

const OVERLOADABLE_OPS = [
	'+', '-', '*', '/', '%', '==', '!=', '<', '<=', '>', '>=',
	'&&', '||', '!', '&', '|', '^', '~', '<<', '>>', '<<<', '>>>',
	'+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '&&=', '||=', '<<=', '>>=',
];

function sepBy1(sep, rule) {
	return seq(rule, repeat(seq(sep, rule)));
}

function sepBy(sep, rule) {
	return optional(sepBy1(sep, rule));
}

module.exports = grammar({
	name: 'jai',

	externals: $ => [
		$.block_comment,
		$._here_string_delimiter,
		$.here_string_body,
		$._here_string_end,
		$.asm_body,
		$._string_content,
		$._error_sentinel,
	],

	extras: $ => [
		/\s+/,
		$.comment,
		$.block_comment,
		$.note,
	],

	word: $ => $.identifier,

	conflicts: $ => [
		[$.parameter_list, $.argument_list],
		[$._argument, $.parenthesized_expression],
		[$._declaration_name, $._primary_expression],
		[$._primary_expression, $._blocky_expression_statement],
		[$._primary_expression, $.using_statement],
		[$._primary_expression, $._type],
		[$._primary_expression, $._type_name],
		[$._type_name, $.named_return],
		[$._parameter_name, $.named_return],
		[$.parameter, $._return_item],
		[$.return_list],
		[$._declaration_prefix, $.using_statement],
		[$.using_modifier, $.parameter_list],
		[$.using_modifier, $.parenthesized_expression],
		[$.using_modifier, $._primary_expression],
		[$.using_modifier, $._postfix_expression],
		[$.polymorphic_type, $._postfix_expression],
		[$.for_directive, $.checked_block],
	],

	supertypes: $ => [],

	inline: $ => [],

	rules: {
		source_file: $ => repeat($._statement),

		_statement: $ => choice(
			$._common_statement,
			$.expression_statement,
		),

		_embedded_statement: $ => choice(
			$._common_statement,
			alias($.restricted_expression_statement, $.expression_statement),
		),

		_common_statement: $ => choice(
			$.block,
			$.declaration,
			$.assignment_statement,
			$.if_statement,
			$.if_case_statement,
			$.while_statement,
			$.for_statement,
			$.return_statement,
			$.break_statement,
			$.continue_statement,
			$.remove_statement,
			$.defer_statement,
			$.push_context_statement,
			$.using_statement,
			$.assert_directive,
			$.through_directive,
			$.bytes_directive,
			$.asm_statement,
			$.checked_block,
			$.scope_directive,
			$.module_parameters_directive,
			$.add_context_directive,
			$.placeholder_directive,
			$.poke_name_directive,
			$.no_reset_statement,
			$.program_export_directive,
			$.empty_statement,
		),

		block: $ => seq('{', repeat($._statement), '}'),

		empty_statement: _ => ';',

		expression_statement: $ => $._expression_statement_semi,
		_expression_statement_semi: $ => choice(
			seq($._expression, ';'),
			$._blocky_expression_statement,
		),

		restricted_expression_statement: $ => choice(
			seq($._statement_expression, ';'),
			$._blocky_expression_statement,
		),

		_blocky_expression_statement: $ => prec.dynamic(-1,
			choice($.run_expression, $.struct_type, $.enum_type, $.insert_expression),
		),

		_statement_expression: $ => choice(
			$._postfix_expression,
			$.cast_expression,
			$.autocast_expression,
			$.inline_expression,
			$.prefix_dereference,
		),

		declaration: $ => prec.right(seq(
			repeat($._declaration_prefix),
			sepBy1(',', $._declaration_name),
			choice(
				seq(
					':',
					optional(seq(
						field('type', $._type),
						repeat($._declaration_directive),
					)),
					optional(choice(
						seq('=', field('value', $.value_list)),
						seq(':', field('value', $.value_list)),
					)),
				),
				seq(':=', field('value', $.value_list)),
				seq('::', field('value', $.value_list)),
			),
			optional(';'),
		)),

		_declaration_prefix: $ => choice($.using_clause, '#as'),

		_declaration_name: $ => seq(
			field('name', choice($.identifier, $.backtick_identifier, $.operator_name)),
			optional('='),
		),

		_declaration_directive: $ => choice(
			$.align_directive,
			$.elsewhere_directive,
		),

		align_directive: $ => seq('#align', $._expression),

		elsewhere_directive: $ => prec.right(seq(
			'#elsewhere',
			optional(field('library', $.identifier)),
			optional(field('link_name', $.string_literal)),
		)),

		value_list: $ => prec.right(sepBy1(',', choice(
			$._expression,
			$.uninitialized,
			$.brace_literal,
			$.spread_expression,
		))),

		uninitialized: _ => '---',

		operator_name: $ => prec.right(seq(
			'operator',
			choice(
				...OVERLOADABLE_OPS,
				seq('[', ']', optional('=')),
				seq('*', '[', ']'),
			),
		)),

		assignment_statement: $ => prec.right(seq(
			sepBy1(',', $._assignment_target),
			field('operator', choice(...ASSIGN_OPS)),
			field('right', $.value_list),
			optional(';'),
		)),

		_assignment_target: $ => seq(
			choice(
				$._statement_expression,
				alias(seq('<<', $._statement_expression), $.unary_expression),
			),
			optional(':'),
		),

		if_statement: $ => prec.right(seq(
			field('directive', choice('if', '#if')),
			field('condition', $._expression),
			optional('then'),
			field('consequence', $._embedded_statement),
			optional(seq('else', field('alternative', $._embedded_statement))),
		)),

		if_case_statement: $ => seq(
			field('directive', choice('if', '#if')),
			optional('#complete'),
			field('value', $._expression),
			'==',
			'{',
			repeat(choice($.case_clause, $._statement)),
			'}',
		),

		case_clause: $ => prec.right(seq(
			'case',
			optional(field('value', sepBy1(',', $._expression))),
			';',
			repeat($._statement),
		)),

		while_statement: $ => prec.right(seq(
			'while',
			optional(seq(field('name', choice($.identifier, $.backtick_identifier)), ':=')),
			field('condition', $._expression),
			field('body', $._embedded_statement),
		)),

		for_statement: $ => prec.right(seq(
			'for',
			repeat(seq($.for_modifier, optional(','))),
			optional(seq(':', field('expansion', $.identifier))),
			optional(seq(
				field('name', sepBy1(',', choice($.identifier, $.backtick_identifier))),
				':',
			)),
			field('iterable', $._expression),
			repeat($.for_directive),
			field('body', $._embedded_statement),
		)),

		for_directive: _ => prec.dynamic(2, choice('#no_abc', '#no_aoc')),

		for_modifier: $ => choice(
			'<',
			prec(PREC.UNARY + 1, '*'),
			seq('<=', $._adjacent_expression),
			seq('*=', $._adjacent_expression),
		),

		return_statement: $ => prec.right(seq(
			choice('return', alias(token(prec(2, '`return')), '`return')),
			optional(field('value', $.return_value_list)),
			optional(';'),
		)),

		return_value_list: $ => prec.right(seq(
			sepBy1(',', choice(
				$._expression,
				$.named_value,
				$.uninitialized,
				$.brace_literal,
				$.spread_expression,
			)),
			optional(','),
		)),

		named_value: $ => seq(
			field('name', $.identifier),
			'=',
			field('value', choice($._expression, $.brace_literal, $.uninitialized)),
		),

		break_statement: $ => prec.right(seq(
			'break',
			optional(field('label', $.identifier)),
			optional(';'),
		)),

		continue_statement: $ => prec.right(seq(
			'continue',
			optional(field('label', $.identifier)),
			optional(';'),
		)),

		remove_statement: $ => prec.right(seq(
			'remove',
			optional($._expression),
			optional(';'),
		)),

		defer_statement: $ => seq(
			choice('defer', alias(token(prec(2, '`defer')), '`defer')),
			$._statement,
		),

		push_context_statement: $ => prec.right(seq(
			choice('push_context', alias(token(prec(2, '`push_context')), '`push_context')),
			optional(seq(',', sepBy1(',', $.identifier))),
			choice(
				field('body', $.block),
				seq(field('context', $._expression), field('body', $.block)),
				seq(field('context', $._expression), optional(';')),
			),
		)),

		using_statement: $ => prec.right(seq(
			$.using_clause,
			field('target', choice($._adjacent_expression, $.struct_type, $.enum_type)),
			optional(';'),
		)),

		using_clause: $ => prec.right(seq(
			'using',
			optional(seq(',', sepBy1(',', $.using_modifier))),
		)),

		using_modifier: $ => prec.right(seq(
			choice('except', 'only', 'map'),
			optional(choice(
				seq('(', sepBy(',', $._expression), ')'),
				prec.dynamic(1, $.identifier),
				$.array_literal,
				$.run_expression,
			)),
		)),

		checked_block: $ => seq(choice('#no_aoc', '#no_abc'), $.block),

		scope_directive: $ => prec.right(seq(
			choice('#scope_file', '#scope_module', '#scope_export'),
			optional(';'),
		)),

		assert_directive: $ => prec.right(seq(
			'#assert',
			optional(token.immediate(/(,[a-zA-Z_]+)+/)),
			choice(
				prec.dynamic(1, field('arguments', $.argument_list)),
				seq($._expression, optional(field('message', $.string_literal))),
			),
			optional(';'),
		)),

		through_directive: _ => prec.right(seq('#through', optional(';'))),

		bytes_directive: $ => prec.right(seq('#bytes', $._expression, optional(';'))),

		asm_statement: $ => seq(
			'#asm',
			optional(sepBy1(',', field('feature', $.identifier))),
			'{',
			optional($.asm_body),
			'}',
		),

		module_parameters_directive: $ => prec.right(seq(
			'#module_parameters',
			$.parameter_list,
			optional($.parameter_list),
			optional(';'),
		)),

		add_context_directive: $ => prec.right(seq(
			'#add_context',
			choice(
				$.declaration,
				seq('::', $._expression, optional(';')),
			),
		)),

		placeholder_directive: $ => prec.right(seq(
			'#placeholder',
			$.identifier,
			optional(';'),
		)),

		poke_name_directive: $ => prec.right(seq(
			'#poke_name',
			$._statement_expression,
			$.identifier,
			optional(';'),
		)),

		no_reset_statement: $ => seq('#no_reset', $._statement),

		program_export_directive: $ => prec.right(seq(
			'#program_export',
			optional($.string_literal),
			optional(';'),
		)),

		insert_expression: $ => prec.right(seq(
			choice('#insert', '#insert_internal'),
			optional(seq(',', sepBy1(',', $.insert_modifier))),
			optional($.insert_parameters),
			choice(
				seq('->', $._type, $.block),
				$._adjacent_expression,
			),
		)),

		insert_modifier: $ => prec.right(seq(
			$.identifier,
			optional(seq('(', optional($._expression), ')')),
		)),

		insert_parameters: $ => seq(
			'(',
			sepBy1(',', $.insert_parameter),
			')',
		),

		insert_parameter: $ => seq(
			field('name', choice('break', 'continue', 'remove', $.identifier)),
			'=',
			field('value', $._insert_argument),
		),

		_insert_argument: $ => choice(
			prec.right(seq('break', optional($.identifier))),
			prec.right(seq('continue', optional($.identifier))),
			'remove',
			$.block,
			$.assert_directive,
			$._expression,
		),

		_type: $ => choice(
			$._type_name,
			$.pointer_type,
			$.array_type,
			$.procedure,
			$.polymorphic_type,
			$.struct_type,
			$.enum_type,
			$.type_directive,
			$.context_type,
			$.run_expression,
			$.directive_expression,
		),

		_type_name: $ => choice(
			$.identifier,
			$.member_type,
			$.parameterized_type,
		),

		member_type: $ => prec.left(PREC.MEMBER, seq($._type_name, '.', field('member', $.identifier))),

		parameterized_type: $ => prec.left(PREC.CALL, seq($._type_name, field('arguments', $.argument_list))),

		pointer_type: $ => prec.right(seq('*', $._type)),

		array_type: $ => prec.right(seq(
			'[',
			optional(field('size', choice('..', $._expression))),
			']',
			field('element', $._type),
		)),

		polymorphic_type: $ => prec.right(seq(
			'$',
			field('name', $.identifier),
			optional(seq(
				'/',
				optional('interface'),
				field('constraint', choice($._type_name, $.array_literal)),
			)),
		)),

		type_directive: $ => prec.right(seq(
			'#type',
			optional(seq(',', sepBy1(',', $.identifier))),
			$._type,
		)),

		context_type: _ => '#Context',

		struct_type: $ => prec.right(seq(
			field('kind', choice('struct', 'union')),
			optional(seq(field('tag_name', $.identifier), ':', field('tag_type', $._type))),
			optional(field('parameters', $.parameter_list)),
			repeat(choice($._struct_directive, $.modify_directive)),
			field('body', $.struct_body),
			repeat($._struct_directive),
		)),

		_struct_directive: _ => choice(
			'#type_info_none',
			'#type_info_procedures_are_void_pointers',
			'#type_info_no_size_complaint',
			'#no_padding',
		),

		struct_body: $ => seq(
			'{',
			repeat(choice(
				$._statement,
				$.union_binding,
				$.overlay_member,
			)),
			'}',
		),

		union_binding: $ => prec.right(seq(
			$.unary_dot,
			',,',
			field('name', $.identifier),
			choice(
				seq(':', field('type', $._type)),
				seq(':=', field('value', $._expression)),
			),
			optional(';'),
		)),

		overlay_member: $ => seq(
			'#overlay',
			'(',
			field('target', $._expression),
			')',
			$.declaration,
		),

		enum_type: $ => prec.right(seq(
			field('kind', choice('enum', 'enum_flags')),
			optional(field('backing_type', $._type)),
			repeat(choice('#specified', '#complete')),
			field('body', $.enum_body),
		)),

		enum_body: $ => seq('{', repeat($._statement), '}'),

		modify_directive: $ => seq('#modify', $.block),

		procedure: $ => prec.right(seq(
			field('parameters', $.parameter_list),
			optional(field('result', $.return_list)),
			repeat($._procedure_modifier),
			optional(field('body', $.block)),
		)),

		parameter_list: $ => seq(
			'(',
			optional(seq($.parameter, repeat(seq(',', $.parameter)), optional(','))),
			')',
		),

		parameter: $ => prec.dynamic(1, prec.right(seq(
			repeat(choice($.using_clause, '#as', '#discard')),
			choice(
				seq(
					$._parameter_name,
					':',
					optional('..'),
					field('type', $._type),
					optional(seq('=', field('default', choice($._expression, $.uninitialized)))),
				),
				seq($._parameter_name, ':=', field('default', $._expression)),
				seq(optional('..'), field('type', $._type)),
			),
		))),

		_parameter_name: $ => seq(
			optional(choice('$$', '$')),
			field('name', choice($.identifier, $.backtick_identifier)),
		),

		return_list: $ => seq(
			'->',
			choice(
				sepBy1(',', $._return_item),
				seq('(', sepBy1(',', $._return_item), optional(','), ')'),
			),
		),

		_return_item: $ => prec.right(choice(
			field('type', $._type),
			$.named_return,
		)),

		named_return: $ => prec.dynamic(-1, prec.right(seq(
			optional('#must'),
			field('name', $.identifier),
			choice(
				seq(':', field('type', $._type), optional(seq('=', field('default', $._expression)))),
				seq(':=', field('default', $._expression)),
			),
		))),

		_procedure_modifier: $ => choice(
			'#expand',
			'#c_call',
			'#no_context',
			'#no_debug',
			'#no_abc',
			'#no_aoc',
			'#no_alias',
			'#no_call',
			'#symmetric',
			'#compiler',
			'#compile_time',
			'#entry_point',
			'#dump',
			'#cpp_method',
			'#cpp_return_type_is_non_pod',
			$.deprecated_directive,
			$.foreign_directive,
			$.elsewhere_directive,
			$.intrinsic_directive,
			$.program_export_modifier,
			$.modify_directive,
		),

		deprecated_directive: $ => prec.right(seq('#deprecated', optional($.string_literal))),

		foreign_directive: $ => prec.right(seq(
			'#foreign',
			optional(field('library', $.identifier)),
			optional(field('link_name', $.string_literal)),
		)),

		intrinsic_directive: $ => prec.right(seq('#intrinsic', optional($.string_literal))),

		program_export_modifier: $ => prec.right(seq('#program_export', optional($.string_literal))),

		_expression: $ => choice(
			$.binary_expression,
			$._unary_expression,
		),

		_unary_expression: $ => choice(
			$.unary_expression,
			$.cast_expression,
			$.autocast_expression,
			$.inline_expression,
			$.prefix_dereference,
			$._postfix_expression,
		),

		_postfix_expression: $ => choice(
			$.member_expression,
			$.pointer_dereference,
			$.call_expression,
			$.index_expression,
			$.postfix_cast,
			$.struct_literal,
			$.array_literal,
			alias($.cast_call_expression, $.cast_expression),
			$._primary_expression,
		),

		_primary_expression: $ => choice(
			$.identifier,
			$.backtick_identifier,
			$.number,
			$.string_literal,
			$.here_string,
			$.boolean,
			$.null,
			$.parenthesized_expression,
			$.lambda_expression,
			$.procedure,
			$.unary_dot,
			$.ifx_expression,
			$.run_expression,
			$.code_expression,
			$.bake_expression,
			$.import_expression,
			$.load_expression,
			$.library_expression,
			$.insert_expression,
			$.char_literal,
			$.array_type,
			$.polymorphic_type,
			$.struct_type,
			$.enum_type,
			$.type_directive,
			$.context_type,
			$.directive_expression,
			$.directive_call,
		),

		identifier: _ => token(
			/[_\p{XID_Start}](?:[_\p{XID_Continue}]|\\[ \t]*[_\p{XID_Continue}])*/u,
		),

		backtick_identifier: _ => token(/`[_\p{XID_Start}][_\p{XID_Continue}]*/u),

		boolean: _ => choice('true', 'false'),

		null: _ => 'null',

		number: $ => choice(
			token(/[0-9][0-9_]*\.[0-9][0-9_]*([eE][+-]?[0-9_]+)?/),
			token(/\.[0-9][0-9_]*([eE][+-]?[0-9_]+)?/),
			token(/[0-9][0-9_]*[eE][+-]?[0-9_]+/),
			token(/0[xX][0-9a-fA-F_]+/),
			token(/0[hH][0-9a-fA-F_]+/),
			token(/0[bB][01_]+/),
			seq(token(/[0-9][0-9_]*/), optional(token.immediate('.'))),
		),

		string_literal: $ => seq(
			'"',
			repeat(choice(
				$.escape_sequence,
				$._string_content,
			)),
			token.immediate('"'),
		),

		escape_sequence: _ => token.immediate(choice(
			/\\x[0-9a-fA-F]{2}/,
			/\\d[0-9]{1,3}/,
			/\\u[0-9a-fA-F]{4}/,
			/\\U[0-9a-fA-F]{8}/,
			/\\./,
		)),

		here_string: $ => seq(
			'#string',
			optional(token.immediate(/,[^ \t\r\n]+/)),
			field('delimiter', alias($._here_string_delimiter, $.here_string_delimiter)),
			optional($.here_string_body),
			alias($._here_string_end, $.here_string_delimiter),
		),

		char_literal: $ => seq('#char', $.string_literal),

		member_expression: $ => prec.left(PREC.MEMBER, seq(
			field('object', $._postfix_expression),
			'.',
			field('member', choice($.identifier, $.operator_name)),
		)),

		pointer_dereference: $ => prec.left(PREC.MEMBER, seq(
			field('object', $._postfix_expression),
			'.',
			'*',
		)),

		postfix_cast: $ => prec.left(PREC.MEMBER, seq(
			field('operand', $._postfix_expression),
			'.',
			'(',
			field('type', $._type),
			')',
		)),

		unary_dot: $ => prec.right(seq('.', field('member', $.identifier))),

		call_expression: $ => prec.dynamic(10, prec.left(PREC.CALL, seq(
			field('function', $._postfix_expression),
			field('arguments', $.argument_list),
		))),

		argument_list: $ => seq(
			'(',
			optional(seq(
				optional(',,'),
				$._argument,
				repeat(seq(choice(',', ',,'), $._argument)),
				optional(choice(',', ',,')),
			)),
			')',
		),

		_argument: $ => choice(
			$._expression,
			$.named_argument,
			$.uninitialized,
			$.brace_literal,
			$.spread_expression,
		),

		named_argument: $ => seq(
			field('name', $.identifier),
			'=',
			field('value', choice($._expression, $.uninitialized, $.brace_literal, $.spread_expression)),
		),

		index_expression: $ => prec.left(PREC.CALL, seq(
			field('object', $._postfix_expression),
			'[',
			field('index', $._expression),
			']',
		)),

		unary_expression: $ => prec.right(PREC.UNARY, seq(
			field('operator', choice('-', '+', '!', '~', '*', '<<')),
			field('operand', $._unary_expression),
		)),

		spread_expression: $ => prec.right(seq('..', $._expression)),

		prefix_dereference: $ => prec.right(PREC.UNARY, seq(
			'(', '.', '*', ')',
			field('operand', $._unary_expression),
		)),

		binary_expression: $ => {
			const table = [
				[PREC.RANGE, '..'],
				[PREC.OR, '||'],
				[PREC.AND, '&&'],
				[PREC.BOR, '|'],
				[PREC.BXOR, '^'],
				[PREC.BAND, '&'],
				[PREC.EQ, '=='],
				[PREC.EQ, '!='],
				[PREC.CMP, '<'],
				[PREC.CMP, '<='],
				[PREC.CMP, '>'],
				[PREC.CMP, '>='],
				[PREC.SHIFT, '<<'],
				[PREC.SHIFT, '>>'],
				[PREC.SHIFT, '<<<'],
				[PREC.SHIFT, '>>>'],
				[PREC.ADD, '+'],
				[PREC.ADD, '-'],
				[PREC.MUL, '*'],
				[PREC.MUL, '/'],
				[PREC.MUL, '%'],
			];
			return choice(...table.map(([p, op]) => prec.left(p, seq(
				field('left', $._expression),
				field('operator', op),
				field('right', $._expression),
			))));
		},

		parenthesized_expression: $ => seq('(', $._expression, ')'),

		cast_expression: $ => prec.right(PREC.CAST, seq(
			'cast',
			optional(seq(',', sepBy1(',', $.identifier))),
			'(',
			field('type', $._type),
			')',
			field('operand', $._unary_expression),
		)),

		cast_call_expression: $ => seq(
			'cast',
			optional(seq(',', sepBy1(',', $.identifier))),
			'(',
			field('type', $._type),
			',',
			field('operand', $._expression),
			optional(seq(',', $.identifier)),
			')',
		),

		autocast_expression: $ => prec.right(PREC.CAST, seq(
			'xx',
			optional(seq(',', sepBy1(',', $.identifier))),
			field('operand', $._unary_expression),
		)),

		lambda_expression: $ => prec.right(seq(
			field('parameters', choice($.identifier, $.parameter_list)),
			'=>',
			field('body', choice($._expression, $.block)),
		)),

		struct_literal: $ => choice(
			prec.dynamic(5, prec.left(PREC.MEMBER, seq(
				field('type', $._postfix_expression),
				'.',
				'{',
				sepBy(',', $._literal_field),
				optional(','),
				'}',
			))),
			prec.left(PREC.MEMBER, seq(
				'.',
				'{',
				sepBy(',', $._literal_field),
				optional(','),
				'}',
			)),
		),

		_literal_field: $ => choice(
			$._expression,
			$.named_literal_field,
			$.brace_literal,
			$.uninitialized,
		),

		named_literal_field: $ => seq(
			field('name', $._expression),
			'=',
			field('value', choice($._expression, $.brace_literal, $.uninitialized)),
		),

		array_literal: $ => choice(
			prec.dynamic(5, prec.left(PREC.MEMBER, seq(
				field('type', $._postfix_expression),
				'.',
				'[',
				sepBy(',', choice($._expression, $.brace_literal)),
				optional(','),
				']',
			))),
			prec.left(PREC.MEMBER, seq(
				'.',
				'[',
				sepBy(',', choice($._expression, $.brace_literal)),
				optional(','),
				']',
			)),
		),

		brace_literal: $ => seq(
			'{',
			sepBy(',', $._literal_field),
			optional(','),
			'}',
		),

		ifx_expression: $ => prec.right(seq(
			choice('ifx', '#ifx'),
			field('condition', $._expression),
			optional(choice(
				seq('then', field('consequence', choice($._expression, $.block))),
				field('consequence', choice($._adjacent_expression, $.block)),
			)),
			optional(seq('else', field('alternative', choice($._expression, $.block)))),
		)),

		_adjacent_expression: $ => $._statement_expression,

		inline_expression: $ => prec.right(PREC.CAST, seq(
			choice('inline', 'no_inline'),
			$._unary_expression,
		)),

		run_expression: $ => prec.right(seq(
			'#run',
			optional(token.immediate(/(,[a-zA-Z_]+)+/)),
			choice(
				seq('->', sepBy1(',', $._type), $.block),
				$.block,
				$._expression,
			),
		)),

		code_expression: $ => prec.right(seq(
			'#code',
			optional(token.immediate(/(,[a-zA-Z_]+)+/)),
			optional(choice(
				$.block,
				$.declaration,
				seq($._expression, optional(seq('=', $._expression))),
			)),
		)),

		bake_expression: $ => prec.right(seq(
			choice('#bake_arguments', '#bake_constants'),
			$._expression,
		)),

		import_expression: $ => prec.right(seq(
			'#import',
			optional(token.immediate(/,[a-z_]+/)),
			field('name', choice($.string_literal, $.here_string)),
			repeat($.argument_list),
		)),

		load_expression: $ => prec.right(seq('#load', field('name', $.string_literal))),

		library_expression: $ => prec.right(seq(
			'#library',
			optional(token.immediate(/(,[a-z_]+)+/)),
			field('name', $.string_literal),
		)),

		directive_expression: _ => choice(
			'#caller_location',
			'#caller_code',
			'#filepath',
			'#file',
			'#line',
			'#compile_time',
			'#this',
			'#command_line_arguments',
		),

		directive_call: $ => prec.right(seq(
			choice('#location', '#exists', '#procedure_of_call', '#procedure_name'),
			optional(seq('(', sepBy(',', $._expression), ')')),
		)),

		comment: _ => token(seq('//', /[^\n]*/)),

		note: _ => token(seq(
			'@',
			choice(
				seq(
					/[A-Za-z_0-9][A-Za-z_0-9\-]*/,
					optional(seq('(', /[^)\n]*/, ')')),
				),
				seq('"', /[^"\n]*/, '"'),
			),
		)),
	},
});
