import assert from "node:assert/strict";
import test from "node:test";

import { createKeyValueStorage } from "../src/browser_storage.js";

test("adapts GM value functions to an async namespaced storage", async () => {
  const values = new Map();
  const api = {
    getValue: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setValue: (key, value) => values.set(key, value),
    deleteValue: (key) => values.delete(key),
    addValueChangeListener: (_key, callback) => { api.callback = callback; return 7; }
  };
  const storage = createKeyValueStorage("assistant.state", api, { empty: true });
  assert.deepEqual(await storage.get(), { empty: true });
  await storage.set({ armed: true });
  assert.deepEqual(await storage.get(), { armed: true });
  assert.equal(storage.listen(() => {}), 7);
  await storage.delete();
  assert.deepEqual(await storage.get(), { empty: true });
});
