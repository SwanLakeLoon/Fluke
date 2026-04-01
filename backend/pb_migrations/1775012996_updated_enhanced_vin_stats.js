/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcvinstatsenh")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, GROUP_CONCAT(DISTINCT v.plate) as plate_list, MAX(v.searchable) as searchable, MAX(CASE WHEN v.physical_vin_relation = vi.id THEN 1 ELSE 0 END) as is_physical_vin FROM vins vi LEFT JOIN vehicles v ON v.vin_relation = vi.id OR v.physical_vin_relation = vi.id LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY vi.id"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_pGDz")

  // remove field
  collection.fields.removeById("_clone_fCco")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_CMS1",
    "max": 25,
    "min": 0,
    "name": "vin",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_qrT1",
    "max": 0,
    "min": 0,
    "name": "title_issues",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(7, new Field({
    "hidden": false,
    "id": "json1643363974",
    "maxSize": 1,
    "name": "is_physical_vin",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcvinstatsenh")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT vi.id as id, vi.vin as vin, vi.title_issues as title_issues, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, GROUP_CONCAT(DISTINCT v.plate) as plate_list, MAX(v.searchable) as searchable FROM vins vi LEFT JOIN vehicles v ON v.vin_relation = vi.id LEFT JOIN sightings s ON s.vehicle = v.id GROUP BY vi.id"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_pGDz",
    "max": 25,
    "min": 0,
    "name": "vin",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(2, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_fCco",
    "max": 0,
    "min": 0,
    "name": "title_issues",
    "pattern": "",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("_clone_CMS1")

  // remove field
  collection.fields.removeById("_clone_qrT1")

  // remove field
  collection.fields.removeById("json1643363974")

  return app.save(collection)
})
