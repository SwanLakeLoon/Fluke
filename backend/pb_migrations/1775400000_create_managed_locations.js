/// <reference path="../pb_data/types.d.ts" />

// Create managed_locations — admin-curated canonical location names
// Create location_mappings — maps raw DB strings to canonical locations

migrate((app) => {
  // 1. managed_locations
  const managedLocations = new Collection({
    "id":         "pbc_managed_locs",
    "name":       "managed_locations",
    "type":       "base",
    "system":     false,
    "listRule":   '@request.auth.id != ""',
    "viewRule":   '@request.auth.id != ""',
    "createRule": '@request.auth.role ?= "admin"',
    "updateRule": '@request.auth.role ?= "admin"',
    "deleteRule": '@request.auth.role ?= "admin"',
    "fields": [
      {
        "autogeneratePattern": "",
        "hidden":     false,
        "id":         "text3208210256",
        "max":        0,
        "min":        0,
        "name":       "id",
        "pattern":    "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required":   true,
        "system":     true,
        "type":       "text"
      },
      {
        "autogeneratePattern": "",
        "hidden":     false,
        "id":         "fld_ml_name",
        "max":        500,
        "min":        1,
        "name":       "name",
        "pattern":    "",
        "presentable": true,
        "primaryKey": false,
        "required":   true,
        "system":     false,
        "type":       "text"
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_managed_locations_name ON managed_locations (name)"
    ]
  });

  app.save(managedLocations);

  // 2. location_mappings
  const locationMappings = new Collection({
    "id":         "pbc_loc_mappings",
    "name":       "location_mappings",
    "type":       "base",
    "system":     false,
    "listRule":   '@request.auth.role ?= "admin"',
    "viewRule":   '@request.auth.role ?= "admin"',
    "createRule": '@request.auth.role ?= "admin"',
    "updateRule": '@request.auth.role ?= "admin"',
    "deleteRule": '@request.auth.role ?= "admin"',
    "fields": [
      {
        "autogeneratePattern": "",
        "hidden":     false,
        "id":         "text3208210256",
        "max":        0,
        "min":        0,
        "name":       "id",
        "pattern":    "^[a-z0-9]+$",
        "presentable": false,
        "primaryKey": true,
        "required":   true,
        "system":     true,
        "type":       "text"
      },
      {
        "autogeneratePattern": "",
        "hidden":     false,
        "id":         "fld_lm_raw",
        "max":        500,
        "min":        1,
        "name":       "raw_value",
        "pattern":    "",
        "presentable": true,
        "primaryKey": false,
        "required":   true,
        "system":     false,
        "type":       "text"
      },
      {
        "cascadeDelete": false,
        "collectionId": "pbc_managed_locs",
        "hidden":     false,
        "id":         "fld_lm_ref",
        "maxSelect":  1,
        "minSelect":  0,
        "name":       "managed_location",
        "presentable": false,
        "required":   true,
        "system":     false,
        "type":       "relation"
      }
    ],
    "indexes": [
      "CREATE UNIQUE INDEX idx_location_mappings_raw ON location_mappings (raw_value)"
    ]
  });

  app.save(locationMappings);

}, (app) => {
  // Rollback: delete in reverse order (mappings first due to FK)
  try {
    const mappings = app.findCollectionByNameOrId("location_mappings");
    app.delete(mappings);
  } catch (e) {}

  try {
    const managed = app.findCollectionByNameOrId("managed_locations");
    app.delete(managed);
  } catch (e) {}
});
