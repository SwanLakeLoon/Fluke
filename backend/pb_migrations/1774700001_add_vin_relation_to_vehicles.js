/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001");

  // Add vin_relation field (relation to vins collection)
  collection.fields.add(new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_vins00000001",
    "hidden": false,
    "id": "relvehiclevin",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "vin_relation",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001");

  collection.fields.removeById("relvehiclevin");

  return app.save(collection);
})
