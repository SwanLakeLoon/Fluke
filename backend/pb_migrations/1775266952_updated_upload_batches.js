/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_313657898")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role ?= \"uploader\" || @request.auth.role ?= \"approver\" || @request.auth.role ?= \"admin\"",
    "deleteRule": "@request.auth.role ?= \"admin\"",
    "listRule": "uploaded_by = @request.auth.id || @request.auth.role ?= \"approver\" || @request.auth.role ?= \"admin\"",
    "updateRule": "@request.auth.role ?= \"approver\" || @request.auth.role ?= \"admin\"",
    "viewRule": "uploaded_by = @request.auth.id || @request.auth.role ?= \"approver\" || @request.auth.role ?= \"admin\""
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_313657898")

  // update collection data
  unmarshal({
    "createRule": "@request.auth.role = \"uploader\" || @request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "deleteRule": "@request.auth.role = \"admin\"",
    "listRule": "uploaded_by = @request.auth.id || @request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "updateRule": "@request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "viewRule": "uploaded_by = @request.auth.id || @request.auth.role = \"approver\" || @request.auth.role = \"admin\""
  }, collection)

  return app.save(collection)
})
