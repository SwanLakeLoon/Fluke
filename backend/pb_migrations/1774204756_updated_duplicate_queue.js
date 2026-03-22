/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736376973")

  // add field
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pbc_1621077608",
    "hidden": false,
    "id": "relation878164153",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "existing_record_id",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736376973")

  // remove field
  collection.fields.removeById("relation878164153")

  return app.save(collection)
})
