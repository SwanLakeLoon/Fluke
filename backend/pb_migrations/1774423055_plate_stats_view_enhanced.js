/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id": "pbcplatestatsen",
    "name": "enhanced_plate_stats",
    "type": "view",
    "system": false,
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "viewQuery": "SELECT MIN(id) as id, plate, COUNT(id) as sighting_count, MAX(date) as latest_sighting, GROUP_CONCAT(state) as state_list, GROUP_CONCAT(ice) as ice_list, GROUP_CONCAT(vin) as vin_list, GROUP_CONCAT(location) as location_list, GROUP_CONCAT(match_status) as match_status_list, MAX(searchable) as searchable FROM alpr_records GROUP BY plate"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen");
  return app.delete(collection);
})
