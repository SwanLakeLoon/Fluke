/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_2629429820")

  // Fix: use = (equals) instead of ?= (contains) for the plain text role field.
  // ?= is for multi-value/relation fields; on a scalar it silently returns no results.
  unmarshal({
    "listRule": "@request.auth.role = \"admin\"",
    "viewRule": "@request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2629429820")

  unmarshal({
    "listRule": "@request.auth.role ?= \"admin\"",
    "viewRule": "@request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
})
