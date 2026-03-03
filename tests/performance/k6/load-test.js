import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5021';

export const options = {
  scenarios: {
    load: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 10 },
        { duration: '60s', target: 50 },
        { duration: '60s', target: 100 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/health`, { tags: { name: 'health' } });
  check(res, {
    'health status 200': (r) => r.status === 200,
    'health has body': (r) => (r.body || '').length > 0,
  });
  sleep(0.2);
}

