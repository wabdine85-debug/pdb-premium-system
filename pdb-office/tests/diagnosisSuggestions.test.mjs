import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagnosisSuggestion } from "../modules/invoices/diagnosisSuggestions.js";

test("recognizes common spelling variants instead of requiring an exact code", () => {
  assert.match(buildDiagnosisSuggestion("HWS-Syndrom"), /Halswirbelsäule/);
  assert.match(buildDiagnosisSuggestion("Beschwerden der Halswirbelsäule"), /Halswirbelsäule/);
  assert.match(buildDiagnosisSuggestion("ISG / unterer Rücken"), /LWS-Beschwerden/);
});

test("combines multiple recognized findings", () => {
  const suggestion = buildDiagnosisSuggestion("HWS und LWS");
  assert.match(suggestion, /Halswirbelsäule/);
  assert.match(suggestion, /LWS-Beschwerden/);
});

test("returns an editable structured result for every other finding", () => {
  const suggestion = buildDiagnosisSuggestion("Schulter rechts");
  assert.match(suggestion, /Befund: Schulter rechts/);
  assert.match(suggestion, /bitte Symptome/);
});
