import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateFormula,
  findUnknownVariables,
  FormulaEvaluationError,
  FormulaSyntaxError,
  isValidVariableKey,
  parseFormulaExpression,
} from "../formulaEvaluator";

function run(expression: string, scope: Record<string, number> = {}): number {
  return evaluateFormula(parseFormulaExpression(expression), scope);
}

describe("evaluateFormula", () => {
  it("respects operator precedence and parentheses", () => {
    assert.equal(run("2 + 3 * 4"), 14);
    assert.equal(run("(2 + 3) * 4"), 20);
    assert.equal(run("10 - 4 - 3"), 3);
    assert.equal(run("2 * 3 / 4"), 1.5);
  });

  it("supports powers, unary minus and the ^ operator used by Firestore expressions", () => {
    assert.equal(run("2 ^ 3"), 8);
    assert.equal(run("V^2", { V: 3 }), 9);
    assert.equal(run("-x + 5", { x: 2 }), 3);
  });

  it("reads variables from the scope", () => {
    assert.equal(run("area * height / time", { area: 0.04, height: 0.1, time: 20 }), 0.0002);
  });

  it("supports the whitelisted functions and pi", () => {
    assert.equal(run("sqrt(16)"), 4);
    assert.equal(run("abs(-3)"), 3);
    assert.equal(run("max(1, 5, 3)"), 5);
    assert.equal(run("pow(2, 10)"), 1024);
    assert.ok(Math.abs(run("pi * 2") - 2 * Math.PI) < 1e-12);
  });

  it("lets a scope variable shadow a built-in constant", () => {
    assert.equal(run("pi", { pi: 3 }), 3);
  });

  it("reports division by zero", () => {
    assert.throws(
      () => run("a / b", { a: 1, b: 0 }),
      (error: unknown) =>
        error instanceof FormulaEvaluationError && error.code === "DIVISION_BY_ZERO",
    );
  });

  it("reports division by a subexpression that evaluates to zero", () => {
    assert.throws(
      () => run("1 / (a - a)", { a: 5 }),
      (error: unknown) =>
        error instanceof FormulaEvaluationError && error.code === "DIVISION_BY_ZERO",
    );
  });

  it("rejects non-finite results and math domain errors", () => {
    assert.throws(() => run("sqrt(-1)"), FormulaEvaluationError);
    assert.throws(() => run("log(0)"), FormulaEvaluationError);
    assert.throws(() => run("10 ^ 1000"), FormulaEvaluationError);
  });
});

describe("parseFormulaExpression", () => {
  it("collects variables and excludes function names", () => {
    const parsed = parseFormulaExpression("sqrt(a * b) + c");

    assert.deepEqual([...parsed.variables].sort(), ["a", "b", "c"]);
  });

  it("reports a parse error for malformed input", () => {
    assert.throws(
      () => parseFormulaExpression("2 +"),
      (error: unknown) =>
        error instanceof FormulaSyntaxError && error.code === "FORMULA_PARSE_ERROR",
    );
  });

  // Formula expressions are untrusted Firestore data. Every one of these must be refused.
  const unsafe: [string, string][] = [
    ["assignment", "x = 5"],
    ["function definition", "f(x) = x ^ 2"],
    ["unlisted function", "evaluate('1 + 1')"],
    ["import", "import({}, {})"],
    ["createUnit", "createUnit('foo')"],
    ["inherited function name", "constructor(1)"],
    ["property access", "a.b"],
    ["index access", "a[1]"],
    ["string literal", "'abc'"],
    ["array literal", "[1, 2, 3]"],
    ["object literal", "{a: 1}"],
    ["conditional", "a ? 1 : 2"],
    ["comparison", "a > 1"],
    ["factorial", "5!"],
    ["modulo", "a mod b"],
    ["unit literal call", "2 cm(3)"],
    ["wrong arity", "sqrt(1, 2)"],
  ];

  for (const [name, expression] of unsafe) {
    it(`refuses ${name}: ${expression}`, () => {
      assert.throws(
        () => parseFormulaExpression(expression),
        (error: unknown) => error instanceof FormulaSyntaxError,
      );
    });
  }

  it("refuses very long expressions", () => {
    assert.throws(() => parseFormulaExpression("1 + ".repeat(300) + "1"), FormulaSyntaxError);
  });
});

describe("findUnknownVariables", () => {
  it("returns variables missing from the scope", () => {
    const parsed = parseFormulaExpression("a + b * c");

    assert.deepEqual(findUnknownVariables(parsed, { a: 1 }), ["b", "c"]);
  });

  it("does not treat inherited object properties as defined", () => {
    const parsed = parseFormulaExpression("constructor + toString");

    assert.deepEqual(findUnknownVariables(parsed, {}), ["constructor", "toString"]);
  });

  it("treats pi as built in", () => {
    assert.deepEqual(findUnknownVariables(parseFormulaExpression("pi * r"), { r: 1 }), []);
  });
});

describe("isValidVariableKey", () => {
  it("accepts plain identifiers, including those used in Firestore", () => {
    for (const key of ["Q", "V", "NRe", "Rm", "deltaP", "f", "pipeDiameter", "manometerDensity"]) {
      assert.equal(isValidVariableKey(key), true, key);
    }
  });

  it("rejects keys that are not a single plain symbol", () => {
    for (const key of ["", "a b", "2x", "1+1", "a.b", "true", "x y z", "mod", "to", "in", "and", "or", "xor", "not"]) {
      assert.equal(isValidVariableKey(key), false, JSON.stringify(key));
    }
  });
});
