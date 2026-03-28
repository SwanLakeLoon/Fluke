/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id": "pbcvinstatsenh", // 15 characters
    "name": "enhanced_vin_stats",
    "type": "view",
    "system": false,
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "viewQuery": "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, GROUP_CONCAT(DISTINCT v.plate) as plate_list, MAX(v.searchable) as searchable FROM vins vi LEFT JOIN vehicles v ON v.vin_relation = vi.id LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY vi.id"
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("enhanced_vin_stats");
  return app.delete(collection);
})
