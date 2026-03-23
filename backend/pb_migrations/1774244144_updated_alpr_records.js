/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\"",
    "updateRule": "@request.auth.role = \"admin\" || @request.auth.role = \"approver\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"admin\"",
    "updateRule": "@request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
})
