/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable, MAX(v.physical_vin_relation) as physical_vin_relation FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id LEFT JOIN vins vi ON v.vin_relation = vi.id GROUP BY v.id"
  }, collection)

  // remove field
  collection.fields.removeById("_clone_E2MM")

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_k9Fn",
    "max": 20,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // add field
  collection.fields.addAt(10, new Field({
    "hidden": false,
    "id": "json2855848480",
    "maxSize": 1,
    "name": "physical_vin_relation",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbcplatestatsen")

  // update collection data
  unmarshal({
    "viewQuery": "SELECT v.id as id, v.plate as plate, COUNT(s.id) as sighting_count, MAX(s.date) as latest_sighting, MAX(v.state) as state_list, GROUP_CONCAT(s.ice) as ice_list, MAX(vi.vin) as vin_list, GROUP_CONCAT(s.location) as location_list, GROUP_CONCAT(s.match_status) as match_status_list, MAX(v.searchable) as searchable FROM vehicles v LEFT JOIN sightings s ON s.vehicle = v.id LEFT JOIN vins vi ON v.vin_relation = vi.id GROUP BY v.id"
  }, collection)

  // add field
  collection.fields.addAt(1, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "_clone_E2MM",
    "max": 20,
    "min": 0,
    "name": "plate",
    "pattern": "",
    "presentable": true,
    "primaryKey": false,
    "required": true,
    "system": false,
    "type": "text"
  }))

  // remove field
  collection.fields.removeById("_clone_k9Fn")

  // remove field
  collection.fields.removeById("json2855848480")

  return app.save(collection)
})
