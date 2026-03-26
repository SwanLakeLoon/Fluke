/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const vehicles = app.findCollectionByNameOrId("vehicles");
  const sightings = app.findCollectionByNameOrId("sightings");

  // Fix API rules for vehicles
  if (vehicles) {
    vehicles.createRule = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"';
    vehicles.updateRule = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"';
    vehicles.deleteRule = '@request.auth.role ?= "admin"';
    app.save(vehicles);
  }

  // Fix API rules for sightings
  if (sightings) {
    sightings.createRule = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"';
    sightings.updateRule = '@request.auth.role ?= "admin" || @request.auth.role ?= "approver"';
    sightings.deleteRule = '@request.auth.role ?= "admin"';
    app.save(sightings);
  }

  // Add OR to alpr_records color field
  try {
    const alpr = app.findCollectionByNameOrId("alpr_records");
    if (alpr) {
      const colorField = alpr.fields.getByName("color");
      if (colorField && colorField.type === "select") {
        const values = new Set(colorField.values || []);
        values.add("OR");
        colorField.values = Array.from(values);
        app.save(alpr);
      }
    }
  } catch (e) {
    // Ignore if not found
  }
}, (app) => {
  return null;
})
