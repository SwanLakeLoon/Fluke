/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestats00")

  // update collection data
  unmarshal({
    "listRule": "(@request.auth.id != \"\") || @request.auth.role ?= \"admin\"",
    "viewRule": "(@request.auth.id != \"\") || @request.auth.role ?= \"admin\""
  }, collection)

  // remove field
  collection.fields.removeById("_clone_IO95")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_nHNP",
    "max": 10,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestats00")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_IO95",
    "max": 10,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("_clone_nHNP")

  return app.save(collection)
})
