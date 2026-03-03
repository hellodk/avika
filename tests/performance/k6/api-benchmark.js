import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5021';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
  },
};

export default function () {
  group('health', () => {
    const res = http.get(`${BASE_URL}/health`, { tags: { name: 'health' } });
    check(res, { '200': (r) => r.status === 200 });
  });

  group('ready', () => {
    const res = http.get(`${BASE_URL}/ready`, { tags: { name: 'ready' } });
    check(res, { '200': (r) => r.status === 200 || r.status === 404 });
  });

  sleep(0.2);
}

