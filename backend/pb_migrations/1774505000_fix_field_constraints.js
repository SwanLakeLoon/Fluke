/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const vehicles = app.findCollectionByNameOrId("vehicles");
  const sightings = app.findCollectionByNameOrId("sightings");

  // Fix vehicles fields
  const vReg = vehicles.fields.getById("textvehiclereg");
  vReg.max = 0; // In Go/PB null/0 sometimes means original, but let's set to safe high number if it was 0
  // Actually, looking at the previous migration, 0 was explicitly set.
  // To allow any length, we should set max to a large number or 0 (if 0 means unlimited in this context).
  // But since 0 caused the 400, let's set to 500 for safety.
  vReg.max = 500;

  const vVin = vehicles.fields.getById("textvehiclevin");
  vVin.max = 100;

  const vTitle = vehicles.fields.getById("textvehicletitle");
  vTitle.max = 500;

  // Fix sightings fields
  const sLoc = sightings.fields.getById("textsightingloc");
  sLoc.max = 500;

  const sNotes = sightings.fields.getById("textsightingnotes");
  sNotes.max = 2000;

  app.save(vehicles);
  app.save(sightings);
}, (app) => {
  // Rollback not really feasible for constraint fixes without knowing original intended state
  return null;
})
