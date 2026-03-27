import { http, HttpResponse } from 'msw';

export const handlers = [
  // Mocking GET streams based on your README's API schema
  http.get('/api/streams', () => {
    return HttpResponse.json({
      data: [
        { id: '1', sender: 'G_SENDER1', recipient: 'G_RECIPIENT1', totalAmount: 100, durationSeconds: 3600, status: 'active', progress: { vested: 50, remaining: 50 } }
      ],
      total: 1,
      page: 1,
      limit: 20
    });
  }),
  http.post('/api/streams', () => {
    return HttpResponse.json({ data: { id: '2', success: true } }, { status: 201 });
  }),
];