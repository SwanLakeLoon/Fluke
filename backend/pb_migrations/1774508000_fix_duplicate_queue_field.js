/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const col = app.findCollectionByNameOrId("pbc_1736376973"); // duplicate_queue
  if (!col) return;

  // Remove the existing relation field (added by 1774204756_updated_duplicate_queue.js)
  const existing = col.fields.getByName("existing_record_id");
  if (existing && existing.type !== "text") {
    col.fields.removeById(existing.id);
  }

  // Always ensure a plain text version exists
  if (!col.fields.getByName("existing_record_id")) {
    col.fields.addAt(5, new Field({
      "id": "textexistingrecordid1",
      "name": "existing_record_id",
      "type": "text",
      "required": false,
      "max": 50,
      "min": 0,
      "autogeneratePattern": "",
      "hidden": false,
      "presentable": false,
      "system": false,
    }));
  }

  return app.save(col);
}, (app) => {
  return null;
})
