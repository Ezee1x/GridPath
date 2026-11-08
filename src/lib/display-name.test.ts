import assert from "node:assert/strict";
import test from "node:test";
import { displayName } from "./display-name";

test("all-caps geocoder addresses read in title case with state codes kept", () => {
  assert.equal(displayName("50 FOSTER ST, WORCESTER, MA, 01608"), "50 Foster St, Worcester, MA, 01608");
  assert.equal(displayName("79 LOWLAND ST, HOLLISTON, MA, 01746"), "79 Lowland St, Holliston, MA, 01746");
});

test("names that already use mixed case are left alone", () => {
  assert.equal(displayName("79 Lowland Street, Holliston, MA"), "79 Lowland Street, Holliston, MA");
  assert.equal(displayName("ACME Battery Co"), "ACME Battery Co");
});
