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
        "id": "text1906235227",
        "max": 10,
        "min": 0,
        "name": "plate",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2744374011",
        "max": 2,
        "min": 0,
        "name": "state",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": true,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text449607278",
        "max": 50,
        "min": 0,
        "name": "make",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text3616895705",
        "max": 50,
        "min": 0,
        "name": "model",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "select1716930793",
        "maxSelect": 1,
        "name": "color",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "BR",
          "GR",
          "BK",
          "BL",
          "TN",
          "SL",
          "R",
          "WH"
        ]
      },
      {
        "hidden": false,
        "id": "select3410985998",
        "maxSelect": 1,
        "name": "ice",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "Y",
          "N",
          "HS"
        ]
      },
      {
        "hidden": false,
        "id": "select3664747549",
        "maxSelect": 1,
        "name": "match_status",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "select",
        "values": [
          "Y",
          "N"
        ]
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text1655220135",
        "max": 0,
        "min": 0,
        "name": "registration",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text2970112321",
        "max": 0,
        "min": 0,
        "name": "vin",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text349989546",
        "max": 0,
        "min": 0,
        "name": "title_issues",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "autogeneratePattern": "",
        "hidden": false,
        "id": "text18589324",
        "max": 0,
        "min": 0,
        "name": "notes",
        "pattern": "",
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
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
        "presentable": false,
        "primaryKey": false,
        "required": false,
        "system": false,
        "type": "text"
      },
      {
        "hidden": false,
        "id": "date2862495610",
        "max": "",
        "min": "",
        "name": "date",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "date"
      },
      {
        "hidden": false,
        "id": "number4005799707",
        "max": null,
        "min": null,
        "name": "plate_confidence",
        "onlyInt": false,
        "presentable": false,
        "required": false,
        "system": false,
        "type": "number"
      },
      {
        "hidden": false,
        "id": "bool2496498701",
        "name": "searchable",
        "presentable": false,
        "required": false,
        "system": false,
        "type": "bool"
      }
    ],
    "id": "pbc_1621077608",
    "indexes": [],
    "listRule": "@request.auth.id != \"\" && searchable = true",
    "name": "alpr_records",
    "system": false,
    "type": "base",
    "updateRule": null,
    "viewRule": "@request.auth.id != \"\" && searchable = true"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608");

  return app.delete(collection);
})
