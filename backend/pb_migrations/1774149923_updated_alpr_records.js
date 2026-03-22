/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "listRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\"",
    "viewRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
