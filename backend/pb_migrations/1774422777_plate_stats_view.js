/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id": "pbcplatestats00",
    "name": "plate_stats",
    "type": "view",
    "system": false,
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "viewQuery": "SELECT MIN(id) as id, plate, COUNT(id) as sighting_count, MAX(date) as latest_sighting FROM alpr_records GROUP BY plate"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestats00");
  return app.delete(collection);
})
