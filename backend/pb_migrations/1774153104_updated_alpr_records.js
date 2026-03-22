/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update field
  collection.fields.addAt(5, new Field({
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
      "WH",
      "GN",
      "GD",
      "PU"
    ]
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1621077608")

  // update field
  collection.fields.addAt(5, new Field({
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
      "WH",
      "GN",
      "GD"
    ]
  }))

  return app.save(collection)
})
