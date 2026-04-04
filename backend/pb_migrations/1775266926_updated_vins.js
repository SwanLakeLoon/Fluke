/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_vins00000001")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role ?= \"admin\" || @request.auth.role ?= \"approver\"",
    "listRule": "(@request.auth.id != \"\") || @request.auth.role ?= \"admin\"",
    "updateRule": "@request.auth.role ?= \"admin\" || @request.auth.role ?= \"approver\"",
    "viewRule": "(@request.auth.id != \"\") || @request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_vins00000001")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.id != \"\"",
    "listRule": "@request.auth.id != \"\"",
    "updateRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\""
  }, collection)

  return app.save(collection)
})
