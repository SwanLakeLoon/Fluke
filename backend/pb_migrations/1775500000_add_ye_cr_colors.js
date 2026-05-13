/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  // Add YE and CR to alpr_records color field
  try {
    const alpr = app.findCollectionByNameOrId("alpr_records");
    if (alpr) {
      const colorField = alpr.fields.getByName("color");
      if (colorField && colorField.type === "select") {
        const values = new Set(colorField.values || []);
        values.add("YE");
        values.add("CR");
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
