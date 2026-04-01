/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001")

  // add field
  collection.fields.addAt(11, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_vins00000001",
    "hidden": false,
    "id": "relation2855848480",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "physical_vin_relation",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001")

  // remove field
  collection.fields.removeById("relation2855848480")

  return app.save(collection)
})
