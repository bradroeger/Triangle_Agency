import assert from "node:assert/strict";
import test from "node:test";
import {
  getRequisitionItem,
  listRequisitionItems,
} from "../src/requisitions/catalog.js";

test("lists the published requisition catalogue without exposing mutable records", () => {
  const items = listRequisitionItems();
  assert.equal(items.length, 23);
  assert.equal(getRequisitionItem("official-mug-12oz").cost, 3);
  assert.equal(getRequisitionItem("skybreaker-helicopter-fire-resistant").cost, 999);
  assert.equal(getRequisitionItem("not-an-item"), null);
  items[0].name = "Changed";
  assert.equal(getRequisitionItem("official-mug-12oz").name, "Official Triangle Agency Mug (12oz)");
});
