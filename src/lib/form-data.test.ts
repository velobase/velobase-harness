import assert from "node:assert/strict";
import test from "node:test";
import { formText } from "./form-data";

void test("text form fields preserve strings and never stringify uploaded files", () => {
  const data = new FormData();
  data.set("name", "A name");
  data.set("upload", new Blob(["not a text field"]), "example.txt");
  assert.equal(formText(data, "name"), "A name");
  assert.equal(formText(data, "missing"), "");
  assert.equal(formText(data, "upload"), "");
});
