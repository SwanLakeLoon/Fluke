/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcvinstatsenh")

  // update collection data
  unmarshal({
    "listRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\"",
    "viewRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\""
  }, collection)

  // remove field
  collection.fields.removeById("_clone_Afen")

  // remove field
  collection.fields.removeById("_clone_zIzG")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_jHcD",
    "max": 25,
    "min": 0,
    "name": "vin",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_Zakv",
    "max": 0,
    "min": 0,
    "name": "title_issues",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcvinstatsenh")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_Afen",
    "max": 25,
    "min": 0,
    "name": "vin",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_zIzG",
    "max": 0,
    "min": 0,
    "name": "title_issues",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("_clone_jHcD")

  // remove field
  collection.fields.removeById("_clone_Zakv")

  return app.save(collection)
})
