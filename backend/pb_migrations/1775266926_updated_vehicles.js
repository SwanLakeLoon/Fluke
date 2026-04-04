/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role ?= \"admin\" || @request.auth.role ?= \"approver\"",
    "deleteRule": "@request.auth.role ?= \"admin\"",
    "listRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\"",
    "updateRule": "@request.auth.role ?= \"admin\" || @request.auth.role ?= \"approver\"",
    "viewRule": "(@request.auth.id != \"\" && searchable = true) || @request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_vehicles0001")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "deleteRule": "@request.auth.role = \"admin\"",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
