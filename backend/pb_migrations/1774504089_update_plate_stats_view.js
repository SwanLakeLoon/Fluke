/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen");

  collection.viewQuery = "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(v.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY v.id";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen");

  collection.viewQuery = "SELECT MIN(id) as id, plate, COUNT(id) as sighting_count, MAX(date) as latest_sighting, GROUP_CONCAT(state) as state_list, GROUP_CONCAT(ice) as ice_list, GROUP_CONCAT(vin) as vin_list, GROUP_CONCAT(location) as location_list, GROUP_CONCAT(match_status) as match_status_list, MAX(searchable) as searchable FROM alpr_records GROUP BY plate";

  return app.save(collection);
})
