/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "createRule": null,
    "deleteRule": null,
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
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1587448267",
        "max": 0,
        "min": 0,
        "name": "location",
        "pattern": "",
        "presentable": true,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select3781979028",
        "maxSelect": 1,
        "name": "alias",
        "presentable": false,
        "required": true,
        "system": false,
        "type": "select",
        "values": [
          "Known ICE HOTEL",
          "Known ICE Business Suite"
        ]
      }
    ],
    "id": "pbc_2939688472",
    "indexes": [
      "CREATE UNIQUE INDEX idx_location_aliases_location ON location_aliases (location)"
    ],
    "listRule": null,
    "name": "location_aliases",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": null
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_2939688472");

  return app.delete(collection);
})
