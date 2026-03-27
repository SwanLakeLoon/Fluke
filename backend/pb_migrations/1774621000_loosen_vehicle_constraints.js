/// <reference path="../pb_data/types.d.ts" />
/**
 * Loosen vehicle constraints:
 *  - plate: max 10 → max 20 (handles longer international/partial plates)
 *  - state: required true → required false (partial data allowed)
 */
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001");

  // plate: increase max from 10 → 20
  const plateField = collection.fields.getByName("plate");
  plateField.max = 20;

  // state: remove required constraint
  const stateField = collection.fields.getByName("state");
  stateField.required = false;

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001");

  const plateField = collection.fields.getByName("plate");
  plateField.max = 10;

  const stateField = collection.fields.getByName("state");
  stateField.required = true;

  return app.save(collection);
})
