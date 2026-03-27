/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id":         "pbcicechangelog",
    "name":       "ice_change_log",
    "type":       "base",
    "system":     false,
    "listRule":   "@request.auth.id != \"\"",
    "viewRule":   "@request.auth.id != \"\"",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "fields": [
      {
        "id": "texticclplate", "name": "plate", "type": "text",
        "required": true, "max": 10, "min": 0, "presentable": true,
      },
      {
        "id": "texticcloldice", "name": "old_ice", "type": "text",
        "required": false, "max": 5, "min": 0,
      },
      {
        "id": "texticclnewice", "name": "new_ice", "type": "text",
        "required": false, "max": 5, "min": 0,
      },
      {
        "id": "numicclvehupd", "name": "vehicles_updated", "type": "number",
        "required": false,
      },
      {
        "id": "numicclsighupd", "name": "sightings_updated", "type": "number",
        "required": false,
      },
      {
        "id": "dateicclrundate", "name": "run_date", "type": "date",
        "required": false,
      },
      {
        "id": "boolicclack", "name": "acknowledged", "type": "bool",
        "required": false,
      },
    ],
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcicechangelog");
  return app.delete(collection);
})
