export default function handler(req, res) {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [7.995, 58.146],
        },
        properties: {
          id: 'demo-root-1',
          status: 'Ny melding',
          text: 'Demo-marker (root api/ reports)'
        },
      },
    ],
  };

  res.status(200).json(geojson);
}
