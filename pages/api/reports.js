export default function handler(req, res) {
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Point',
          // Kristiansand sentrum (demo)
          coordinates: [7.995, 58.146],
        },
        properties: {
          id: 'demo-1',
          status: 'Ny melding',
          text: 'Demo-markør (erstatt med Supabase)',
        },
      },
    ],
  };

  res.status(200).json(geojson);
}
