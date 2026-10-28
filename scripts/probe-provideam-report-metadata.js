import { request, saveSample } from './provideam-client.js';

const availableEndpoints = [
  {
    name: 'objects',
    path: '/api/v1/report/getavailableobjects',
  },
  {
    name: 'fields',
    path: '/api/v1/report/getavailablefields',
  },
  {
    name: 'functions',
    path: '/api/v1/report/getavailablefunctions',
  },
  {
    name: 'losses',
    path: '/api/v1/report/getavailablelosses',
  },
  {
    name: 'periods',
    path: '/api/v1/report/getavailableperiods',
  },
];

for (const endpoint of availableEndpoints) {
  const query = { dataSetType: '__invalid_probe__' };
  const response = await request('GET', endpoint.path, { query });
  await saveSample(
    `available-${endpoint.name}-invalid-dataset-type`,
    {
      request: {
        method: 'GET',
        path: endpoint.path,
        query,
      },
      response,
    },
  );
  console.log(`${endpoint.name}: HTTP ${response.status}`);
}
