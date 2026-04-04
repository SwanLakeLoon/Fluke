/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen")

  // update collection data
  unmarshal({
    "listRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\"",
    "viewRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\""
  }, collection)

  // remove field
  collection.fields.removeById("_clone_2iLa")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_PpVc",
    "max": 20,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_2iLa",
    "max": 20,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("_clone_PpVc")

  return app.save(collection)
})
