import test from "node:test";
import assert from "node:assert/strict";
import { checkAccountForm, cleanUsername } from "../ui/account.mjs";

const good = { mode: "signUp", email: "a@b.co", password: "secret1", username: "Mina_7" };

test("a complete form passes", () => {
  assert.equal(checkAccountForm(good), null);
  assert.equal(checkAccountForm({ ...good, mode: "signIn", username: "" }), null);
});

test("email shape is checked first", () => {
  for (const email of ["", "plain", "a@b", "a b@c.de", "@b.co"]) {
    assert.match(checkAccountForm({ ...good, email }), /email/i);
  }
  assert.equal(checkAccountForm({ ...good, email: "  a@b.co " }), null);
});

test("passwords need at least 6 characters", () => {
  assert.match(checkAccountForm({ ...good, password: "12345" }), /6 characters/);
  assert.equal(checkAccountForm({ ...good, password: "123456" }), null);
});

test("usernames follow the schema rule after lowercasing, and only matter for sign-up", () => {
  assert.equal(cleanUsername("  Mina_7 "), "mina_7");
  for (const username of ["", "ab", "a".repeat(21), "has space", "dot.name", "émile"]) {
    assert.match(checkAccountForm({ ...good, username }), /Username/);
  }
  assert.equal(checkAccountForm({ ...good, username: "a-b_9" }), null);
  assert.equal(checkAccountForm({ ...good, mode: "signIn", username: "x" }), null);
});
