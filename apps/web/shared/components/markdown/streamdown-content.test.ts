import assert from "node:assert/strict";
import test from "node:test";

import { containsMarkdownMath, escapeNonMathDollars, normalizeMathDelimiters } from "./streamdown-content";

const CHECKOUT_CURRENCIES = "* **看最终结账货币符号**：结算页面明确显示为 **USD / $**，而不是被自动识别成 CNY（¥）、HKD（HK$）或 EUR（€）。";

function normalize(source: string): string {
  return normalizeMathDelimiters(escapeNonMathDollars(source));
}

test("checkout currency symbols stay literal inside and after strong text", () => {
  assert.equal(containsMarkdownMath(CHECKOUT_CURRENCIES), false);
  assert.equal(normalize(CHECKOUT_CURRENCIES), CHECKOUT_CURRENCIES.replaceAll("$", "&#36;"));

  for (const source of ["**USD / $** and HK$", "__USD / $__ and HK$", "**price $**（HK$）", "**USD /\n$** and HK$"]) {
    assert.equal(containsMarkdownMath(source), false, source);
    assert.equal(normalize(source), source.replaceAll("$", "&#36;"), source);
  }
});

test("streamed prefixes of checkout text keep currency dollars literal", () => {
  for (let end = 0; end <= CHECKOUT_CURRENCIES.length; end += 1) {
    const prefix = CHECKOUT_CURRENCIES.slice(0, end);
    assert.equal(containsMarkdownMath(prefix), false, prefix);
    assert.equal(normalize(prefix), prefix.replaceAll("$", "&#36;"), prefix);
  }
});

test("currency symbols beside strong text preserve neighboring formulas", () => {
  const source = "**USD / $**; $x$; HK$";
  assert.equal(containsMarkdownMath(source), true);
  assert.equal(normalize(source), "**USD / &#36;**; $x$; HK&#36;");
});

test("escaped currency dollars stay escaped beside strong markers", () => {
  const source = String.raw`**USD / \$** and HK\$`;
  assert.equal(containsMarkdownMath(source), false);
  assert.equal(normalize(source), source);
  assert.equal(normalize(String.raw`\$x+1\$`), "$x+1$");
});

test("escaped, closed and intraword markers preserve existing math detection", () => {
  for (const source of [
    "$**x$", "$__x$", "**closed** then $**x$", "__closed__ then $__x$",
    String.raw`\*\*escaped $**x$`, "word__word $__x$", "**closed** ($x$)",
    "**open $**x$", "__open $__x$", "**unclosed\n\n$** x$", "**unclosed\n \n$** x$",
    "**unclosed\n- $** x$", "**closed**, $** x$",
  ]) {
    assert.equal(containsMarkdownMath(source), true, source);
    assert.equal(normalize(source), source, source);
  }
});

test("strong currency text keeps context across inline code", () => {
  for (const source of ["**USD `code` / $** and HK$", "**`USD` / $** and HK$", "**USD `**literal**` / $** and HK$"]) {
    assert.equal(containsMarkdownMath(source), false, source);
    assert.equal(normalize(source), source.replaceAll("$", "&#36;"), source);
    const escaped = source.replaceAll("$", "\\$");
    assert.equal(normalize(escaped), escaped, escaped);
  }
});

test("repeated strong currency text keeps all dollar symbols", () => {
  const source = "**x $** ".repeat(8000);
  assert.equal(escapeNonMathDollars(source), source.replaceAll("$", "&#36;"));
});

test("inline and display math keep their delimiters", () => {
  for (const source of [
    "$2+2$", "$x$", "$ x^2 $", "($x$),", "**$x$**", "__$x$__",
    "$a*b$", "$x**2$", "$E=MC$", "$x_i$", "$\\text{**bold**}$", "$$\nx^2\n$$",
  ]) {
    assert.equal(containsMarkdownMath(source), true, source);
    assert.equal(normalize(source), source, source);
  }
  assert.equal(normalize(String.raw`$x + \$2$`), String.raw`$$x + \$2$$`);
});

test("existing currency amounts and code keep literal dollars", () => {
  for (const source of ["$1/月，$2", "$3（$1 + $2）", "- $2\n- $1"]) {
    assert.equal(containsMarkdownMath(source), false, source);
    assert.equal(normalize(source), source.replaceAll("$", "&#36;"), source);
  }
  for (const source of ["`**USD / $** and HK$`", "```md\n**USD / $** and HK$\n```", "    **USD / $** and HK$"]) {
    assert.equal(escapeNonMathDollars(source), source, source);
  }
});
