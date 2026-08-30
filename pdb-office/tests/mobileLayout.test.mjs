import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const revenueCss = await readFile(new URL("../components/revenue/revenue.css", import.meta.url), "utf8");
const workTimeCss = await readFile(new URL("../components/work-time/work-time.css", import.meta.url), "utf8");

test("constrains the native iOS date control to its revenue field", () => {
  assert.match(revenueCss, /\.revenue-input\[type="date"\]\s*\{[^}]*-webkit-appearance:\s*none;/s);
  assert.match(revenueCss, /\.revenue-input\[type="date"\]\s*\{[^}]*max-inline-size:\s*100%;/s);
  assert.match(revenueCss, /::-webkit-date-and-time-value\s*\{[^}]*min-width:\s*0;/s);
});

test("stacks work-time filters at the phone breakpoint", () => {
  assert.match(workTimeCss, /@media \(max-width:\s*680px\)[\s\S]*?\.work-time__filters\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});
