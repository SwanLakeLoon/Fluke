/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736376973")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\"",
    "listRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\"",
    "updateRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\"",
    "viewRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1736376973")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"admin\"",
    "listRule": "@request.auth.role = \"admin\"",
    "updateRule": "@request.auth.role = \"admin\"",
    "viewRule": "@request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
})
