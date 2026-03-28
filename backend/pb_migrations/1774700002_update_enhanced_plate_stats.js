/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen");

  // Update view to JOIN through vins via vin_relation instead of reading vin directly from vehicles
  collection.viewQuery = "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id LEFT JOIN vins vi ON v.vin_relation = vi.id GROUP BY v.id";

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen");

  // Revert to reading vin directly from vehicles
  collection.viewQuery = "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(v.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY v.id";

  return app.save(collection);
})
