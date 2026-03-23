/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": "@request.auth.role = \"uploader\" || @request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "deleteRule": "@request.auth.role = \"admin\"",
    "fields": [
      {
        "autogeneratePattern": "[a-z0-9]{15}",
        "hidden": false,
        "id": "text3208210256",
        "max": 15,
        "min": 15,
        "name": "id",
        "pattern": "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required": true,
        "system": true,
        "type": "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "_pb_users_auth_",
        "hidden": false,
        "id": "relation3823579430",
        "maxSelect": 1,
        "minSelect": 0,
        "name": "uploaded_by",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "relation"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1007413605",
        "max": 0,
        "min": 0,
        "name": "filename",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "number2793122322",
        "max": null,
        "min": null,
        "name": "row_count",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "json176944289",
        "maxSize": 0,
        "name": "rows",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "json"
      },
      {
        "hidden": false,
        "id": "select2063623452",
        "maxSelect": 1,
        "name": "status",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "pending",
          "approved",
          "rejected"
        ]
      }
    ],
    "id": "pbc_313657898",
    "indexes": [],
    "listRule": "uploaded_by = @request.auth.id || @request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "name": "upload_batches",
    "system": false,
    "type": "base",
    "updateRule": "@request.auth.role = \"approver\" || @request.auth.role = \"admin\"",
    "viewRule": "uploaded_by = @request.auth.id || @request.auth.role = \"approver\" || @request.auth.role = \"admin\""
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_313657898");

  return app.delete(collection);
})
