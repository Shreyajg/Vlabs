// Pure module. Formula expressions come from Firestore and are UNTRUSTED.
//
// mathjs is used only to parse. The tree is then validated against a strict allow-list and
// evaluated by the small interpreter below. No eval(), no new Function(), and none of
// mathjs's own evaluation (which supports assignment, indexing, units, complex numbers, ...).
import {
  isConstantNode,
  isFunctionNode,
  isOperatorNode,
  isParenthesisNode,
  isSymbolNode,
  parse,
  type MathNode,
} from "mathjs/number";

const MAX_EXPRESSION_LENGTH = 500;

// `in` also matches inherited names such as "constructor", so always test own properties.
const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** Constants available to every formula unless the scope defines the same name. */
export const BUILTIN_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  pi: Math.PI,
});

const FUNCTIONS: Readonly<Record<string, (...args: number[]) => number>> = Object.freeze({
  sqrt: (x) => {
    if (x < 0) throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", "sqrt of a negative number");
    return Math.sqrt(x);
  },
  abs: (x) => Math.abs(x),
  exp: (x) => Math.exp(x),
  log: (x) => {
    if (x <= 0) throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", "log of a non-positive number");
    return Math.log(x);
  },
  log10: (x) => {
    if (x <= 0) throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", "log10 of a non-positive number");
    return Math.log10(x);
  },
  pow: (base, exponent) => Math.pow(base, exponent),
  min: (...values) => Math.min(...values),
  max: (...values) => Math.max(...values),
});

// coalesce(a, b, ...) returns the first argument whose variables are all defined, so a formula can
// prefer an optional entry and fall back to a calculation: coalesce(rm, lhs - rhs). It cannot be a plain
// function above, because its arguments must not all be evaluated: an undefined optional entry is not
// an error there. The last argument is the fallback, and its variables are always required.
const COALESCE = "coalesce";

const FUNCTION_ARITY: Readonly<Record<string, { min: number; max: number }>> = Object.freeze({
  sqrt: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  exp: { min: 1, max: 1 },
  log: { min: 1, max: 1 },
  log10: { min: 1, max: 1 },
  pow: { min: 2, max: 2 },
  min: { min: 1, max: 20 },
  max: { min: 1, max: 20 },
  [COALESCE]: { min: 2, max: 20 },
});

export const ALLOWED_FUNCTION_NAMES: readonly string[] = [...Object.keys(FUNCTIONS), COALESCE];

export type FormulaSyntaxErrorCode = "FORMULA_PARSE_ERROR" | "UNSUPPORTED_FORMULA_SYNTAX";
export type FormulaEvaluationErrorCode = "DIVISION_BY_ZERO" | "FORMULA_EVALUATION_ERROR";

export class FormulaSyntaxError extends Error {
  readonly code: FormulaSyntaxErrorCode;

  constructor(code: FormulaSyntaxErrorCode, message: string) {
    super(message);
    this.name = "FormulaSyntaxError";
    this.code = code;
  }
}

export class FormulaEvaluationError extends Error {
  readonly code: FormulaEvaluationErrorCode;

  constructor(code: FormulaEvaluationErrorCode, message: string) {
    super(message);
    this.name = "FormulaEvaluationError";
    this.code = code;
  }
}

export interface ParsedFormula {
  node: MathNode;
  /** Variable names the expression must have, excluding function names and coalesce's optional ones. */
  variables: string[];
  /** Variables read only by a non-final coalesce argument. They may be undefined. */
  optionalVariables: string[];
}

// mathjs parses these bare words as plain symbols, but they are infix operators in expressions.
const RESERVED_WORDS: ReadonlySet<string> = new Set(["mod", "to", "in", "and", "or", "xor", "not", "end"]);

/** A variable key is valid if mathjs reads it back as a single plain symbol and it is not a reserved word. */
export function isValidVariableKey(key: string): boolean {
  if (key === "" || key.length > 64 || RESERVED_WORDS.has(key)) return false;

  try {
    const node = parse(key);
    return isSymbolNode(node) && node.name === key;
  } catch {
    return false;
  }
}

/**
 * Validates a tree against the allow-list and collects the variables it reads. Variables that only a
 * non-final coalesce argument reads go to `optional`; everything else goes to `variables`.
 */
function collectVariables(node: MathNode, variables: Set<string>, optional: Set<string>): void {
  if (isConstantNode(node)) {
    if (typeof node.value !== "number") {
      throw new FormulaSyntaxError("UNSUPPORTED_FORMULA_SYNTAX", "Only numeric literals are allowed.");
    }
    return;
  }

  if (isSymbolNode(node)) {
    variables.add(node.name);
    return;
  }

  if (isParenthesisNode(node)) {
    collectVariables(node.content, variables, optional);
    return;
  }

  if (isOperatorNode(node)) {
    if (!SUPPORTED_OPERATORS.has(node.fn)) {
      throw new FormulaSyntaxError("UNSUPPORTED_FORMULA_SYNTAX", `Operator "${node.op}" is not supported.`);
    }

    node.args.forEach((arg) => collectVariables(arg, variables, optional));
    return;
  }

  if (isFunctionNode(node)) {
    if (!isSymbolNode(node.fn) || !(hasOwn(FUNCTIONS, node.fn.name) || node.fn.name === COALESCE)) {
      const name = isSymbolNode(node.fn) ? node.fn.name : "(expression)";

      throw new FormulaSyntaxError("UNSUPPORTED_FORMULA_SYNTAX", `Function "${name}" is not supported.`);
    }

    const arity = FUNCTION_ARITY[node.fn.name];

    if (node.args.length < arity.min || node.args.length > arity.max) {
      throw new FormulaSyntaxError(
        "UNSUPPORTED_FORMULA_SYNTAX",
        `Function "${node.fn.name}" was called with ${node.args.length} argument(s).`,
      );
    }

    if (node.fn.name === COALESCE) {
      const last = node.args.length - 1;

      // Every argument is still validated. Only where its variables are recorded differs.
      node.args.forEach((arg, index) =>
        collectVariables(arg, index < last ? optional : variables, optional),
      );
      return;
    }

    node.args.forEach((arg) => collectVariables(arg, variables, optional));
    return;
  }

  throw new FormulaSyntaxError("UNSUPPORTED_FORMULA_SYNTAX", `"${node.type}" expressions are not supported.`);
}

const SUPPORTED_OPERATORS: ReadonlySet<string> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
  "pow",
  "unaryMinus",
  "unaryPlus",
]);

/**
 * Parses and validates an expression without evaluating it.
 * @throws FormulaSyntaxError for invalid or unsupported syntax.
 */
export function parseFormulaExpression(expression: string): ParsedFormula {
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new FormulaSyntaxError(
      "UNSUPPORTED_FORMULA_SYNTAX",
      `Expression is longer than ${MAX_EXPRESSION_LENGTH} characters.`,
    );
  }

  let node: MathNode;

  try {
    node = parse(expression);
  } catch (error) {
    throw new FormulaSyntaxError(
      "FORMULA_PARSE_ERROR",
      error instanceof Error ? error.message : "Expression could not be parsed.",
    );
  }

  const variables = new Set<string>();
  const optional = new Set<string>();

  collectVariables(node, variables, optional);

  return {
    node,
    variables: [...variables],
    // A variable that is also required somewhere else in the expression is required, not optional.
    optionalVariables: [...optional].filter((name) => !variables.has(name)),
  };
}

/** Variables the expression reads that are neither in `scope` nor built-in constants. */
export function findUnknownVariables(
  parsed: ParsedFormula,
  scope: Readonly<Record<string, number>>,
): string[] {
  return parsed.variables.filter(
    (name) => !hasOwn(scope, name) && !hasOwn(BUILTIN_CONSTANTS, name),
  );
}

function ensureFinite(value: number): number {
  if (!Number.isFinite(value)) {
    throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", "The result is not a finite number.");
  }

  return value;
}

/** True when every variable the expression requires is defined (its own optional ones do not count). */
function isComputable(node: MathNode, scope: Readonly<Record<string, number>>): boolean {
  const required = new Set<string>();

  collectVariables(node, required, new Set<string>());

  return [...required].every((name) => hasOwn(scope, name) || hasOwn(BUILTIN_CONSTANTS, name));
}

function evaluateNode(node: MathNode, scope: Readonly<Record<string, number>>): number {
  if (isConstantNode(node)) {
    return node.value as number;
  }

  if (isSymbolNode(node)) {
    if (hasOwn(scope, node.name)) return scope[node.name];
    if (hasOwn(BUILTIN_CONSTANTS, node.name)) return BUILTIN_CONSTANTS[node.name];

    throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", `Unknown variable "${node.name}".`);
  }

  if (isParenthesisNode(node)) {
    return evaluateNode(node.content, scope);
  }

  if (isOperatorNode(node)) {
    const args = node.args.map((arg) => evaluateNode(arg, scope));

    switch (node.fn) {
      case "add":
        return ensureFinite(args[0] + args[1]);
      case "subtract":
        return ensureFinite(args[0] - args[1]);
      case "multiply":
        return ensureFinite(args[0] * args[1]);
      case "divide":
        if (args[1] === 0) {
          throw new FormulaEvaluationError("DIVISION_BY_ZERO", "Division by zero.");
        }
        return ensureFinite(args[0] / args[1]);
      case "pow":
        return ensureFinite(Math.pow(args[0], args[1]));
      case "unaryMinus":
        return -args[0];
      case "unaryPlus":
        return args[0];
      default:
        throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", `Operator "${node.fn}" is not supported.`);
    }
  }

  if (isFunctionNode(node) && isSymbolNode(node.fn) && node.fn.name === COALESCE) {
    const last = node.args.length - 1;

    // The first argument that can be computed from defined values wins; the last one is the fallback.
    // An argument that IS computable but fails (division by zero, ...) is an error, not "unavailable".
    for (let index = 0; index < last; index += 1) {
      if (isComputable(node.args[index], scope)) return evaluateNode(node.args[index], scope);
    }

    return evaluateNode(node.args[last], scope);
  }

  if (isFunctionNode(node) && isSymbolNode(node.fn) && hasOwn(FUNCTIONS, node.fn.name)) {
    const args = node.args.map((arg) => evaluateNode(arg, scope));

    return ensureFinite(FUNCTIONS[node.fn.name](...args));
  }

  throw new FormulaEvaluationError("FORMULA_EVALUATION_ERROR", `"${node.type}" cannot be evaluated.`);
}

/**
 * Evaluates a parsed expression against `scope`.
 * @throws FormulaEvaluationError for division by zero, unknown variables and non-finite results.
 */
export function evaluateFormula(
  parsed: ParsedFormula,
  scope: Readonly<Record<string, number>>,
): number {
  return ensureFinite(evaluateNode(parsed.node, scope));
}
