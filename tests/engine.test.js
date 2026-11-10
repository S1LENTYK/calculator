import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CalcError,
  evaluate,
  formatNumber,
  isPlainNumber,
  preview,
  toExpressionString,
} from "../src/engine.js";

function assertClose(actual, expected, epsilon = 1e-12) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Math.abs(actual - expected) <= epsilon * scale,
    `ожидалось ${expected}, получено ${actual}`,
  );
}

test("базовые арифметические операции", () => {
  assert.equal(evaluate("2 + 3"), 5);
  assert.equal(evaluate("10 − 4"), 6);
  assert.equal(evaluate("6 × 7"), 42);
  assert.equal(evaluate("20 ÷ 5"), 4);
  assert.equal(evaluate("2 + 3 * 4"), 14);
  assert.equal(evaluate("(2 + 3) * 4"), 20);
});

test("унарные операторы и степени", () => {
  assert.equal(evaluate("-5 + 2"), -3);
  assert.equal(evaluate("−(−7)"), 7);
  assert.equal(evaluate("2^10"), 1024);
  assert.equal(evaluate("2^3^2"), 512);
  assert.equal(evaluate("-2^2"), -4);
});

test("запятая и точка как десятичный разделитель", () => {
  assert.equal(evaluate("2,5 × 4"), 10);
  assert.equal(evaluate("2.5 × 4"), 10);
  assertClose(evaluate("0,1 + 0,2"), 0.3);
});

test("проценты в типичных сценариях", () => {
  assert.equal(evaluate("50%"), 0.5);
  assert.equal(evaluate("100 + 10%"), 110);
  assert.equal(evaluate("200 − 25%"), 150);
  assert.equal(evaluate("200 × 10%"), 20);
  assert.equal(evaluate("200 ÷ 10%"), 2000);
});

test("результат округляется до 12 значащих цифр", () => {
  assert.equal(evaluate("0,1 + 0,2"), 0.3);
  assert.equal(evaluate("1 ÷ 3"), 0.333333333333);
});

test("деление на ноль даёт понятную ошибку", () => {
  assert.throws(
    () => evaluate("5 ÷ 0"),
    (error) =>
      error instanceof CalcError &&
      error.code === "DIV_ZERO" &&
      error.message === "Деление на ноль",
  );
});

test("некорректные выражения обрабатываются", () => {
  assert.throws(() => evaluate(""), CalcError);
  assert.throws(() => evaluate("2 +"), CalcError);
  assert.throws(() => evaluate("2(3 + 4)"), CalcError);
  assert.throws(
    () => evaluate("(2 + 3"),
    (error) => error.code === "UNCLOSED",
  );
  assert.throws(
    () => evaluate("2 $ 3"),
    (error) => error.code === "UNKNOWN",
  );
});

test("форматирование чисел", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(12.5), "12,5");
  assert.equal(formatNumber(0.30000000000000004), "0,3");
  assert.equal(
    formatNumber(1234.5).replace(/\s/g, " "),
    "1 234,5",
  );
  assert.match(formatNumber(1e16), /^1e\+16$/);
});

test("предпросмотр не падает на незавершённом выражении", () => {
  assert.equal(preview("12 +"), 12);
  assert.equal(preview("12 + 3 ×"), 15);
  assert.equal(preview("(2 + 3"), null);
  assert.equal(preview(""), null);
});

test("определение простого числа", () => {
  assert.equal(isPlainNumber("42"), true);
  assert.equal(isPlainNumber("−3,5"), true);
  assert.equal(isPlainNumber("1e-7"), true);
  assert.equal(isPlainNumber("2 + 3"), false);
  assert.equal(isPlainNumber("50%"), false);
});

test("преобразование результата в строку выражения", () => {
  assert.equal(toExpressionString(12.5), "12,5");
  assert.equal(toExpressionString(-7), "−7");
  assert.equal(toExpressionString(0), "0");
});
