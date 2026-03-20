/*
 * Prayer Bioregion Map
 *
 * Leaflet map showing countries colored by bioregion membership.
 * Tap a country to see its bioregion(s) and navigate to the prayer briefing.
 */

(function () {
  'use strict';

  var mapEl = document.getElementById('prayer-map');
  if (!mapEl) return;

  if (typeof L === 'undefined') {
    console.error('Leaflet not loaded — prayer map disabled');
    mapEl.style.display = 'none';
    return;
  }

  var map = L.map('prayer-map', {
    center: [20, 0],
    zoom: 2,
    minZoom: 1,
    maxZoom: 5,
    scrollWheelZoom: false,
    zoomControl: false,
    attributionControl: false,
    maxBounds: [[-85, -200], [85, 200]],
    maxBoundsViscosity: 1.0,
  });

  // Dark background — no tile layer needed
  mapEl.style.background = '#12121e';

  var DEFAULT_STYLE = {
    fillColor: '#1e1e30',
    fillOpacity: 0.6,
    color: '#2a2a4a',
    weight: 0.5,
  };

  var bioData = null;

  function getStyle(feature) {
    if (!bioData) return DEFAULT_STYLE;
    var iso3 = feature.properties.iso3;
    var entries = bioData.countries[iso3];
    if (!entries || entries.length === 0) return DEFAULT_STYLE;
    // Use first bioregion's color
    var color = bioData.colors[entries[0].id] || DEFAULT_STYLE.fillColor;
    return {
      fillColor: color,
      fillOpacity: 0.55,
      color: '#2a2a4a',
      weight: 0.5,
    };
  }

  function highlightFeature(e) {
    var layer = e.target;
    layer.setStyle({ fillOpacity: 0.8, weight: 1, color: '#c4a882' });
    layer.bringToFront();
  }

  function resetHighlight(e) {
    geoLayer.resetStyle(e.target);
  }

  function buildPopup(iso3, name) {
    if (!bioData) return name;
    var entries = bioData.countries[iso3];
    if (!entries || entries.length === 0) {
      return '<div class="popup-title">' + name + '</div>' +
        '<div class="popup-meta">No bioregion data</div>';
    }
    var html = '<div class="popup-title">' + name + '</div>';
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      html += '<a class="popup-link" href="/pray/bioregion/' + e.id + '">' +
        e.name + '</a>';
      if (i < entries.length - 1) html += '<br>';
    }
    return html;
  }

  function onEachFeature(feature, layer) {
    layer.on({
      mouseover: highlightFeature,
      mouseout: resetHighlight,
      click: function () {
        var iso3 = feature.properties.iso3;
        var name = feature.properties.name;
        layer.bindPopup(buildPopup(iso3, name), {
          className: 'prayer-popup',
          maxWidth: 220,
        }).openPopup();
      },
    });
  }

  var geoLayer = null;

  // Fetch both data sources in parallel
  Promise.all([
    fetch('/pray/api/bioregion-map').then(function (r) { return r.json(); }),
    fetch('/static/geo/countries-110m.json').then(function (r) { return r.json(); }),
  ]).then(function (results) {
    bioData = results[0];
    var geojson = results[1];

    geoLayer = L.geoJSON(geojson, {
      style: getStyle,
      onEachFeature: onEachFeature,
    }).addTo(map);

    // Leaflet needs a size recalc if container was hidden/resized
    setTimeout(function () { map.invalidateSize(); }, 100);
  }).catch(function (err) {
    console.error('Prayer map failed to load:', err);
    mapEl.style.display = 'none';
  });
})();
