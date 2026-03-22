/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "deleteRule": "@request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "deleteRule": null
  }, collection)

  return app.save(collection)
})
