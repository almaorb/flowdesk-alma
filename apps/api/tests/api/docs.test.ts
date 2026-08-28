import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { app } from '../helpers/fixtures.js';
import { buildOpenApiDocument } from '../../src/openapi.js';

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  name: string;
  regexp: RegExp;
  handle?: { stack?: Layer[] };
}

/** Walks the Express router tree and returns every mounted route. */
function listRoutes(target: Express): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = [];

  const mountPath = (regexp: RegExp): string =>
    regexp
      .toString()
      .replace('/^\\', '')
      .replace('\\/?(?=\\/|$)/i', '')
      .replace(/\\\//g, '/')
      .replace(/\(\?:\(\[\^\\\/]\+\?\)\)/g, ':param');

  const walk = (layers: Layer[], prefix: string): void => {
    for (const layer of layers) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          routes.push({
            method: method.toUpperCase(),
            path: `${prefix}${layer.route.path}`.replace(/\/$/, '') || '/',
          });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        walk(layer.handle.stack, prefix + mountPath(layer.regexp));
      }
    }
  };

  const stack = (target as unknown as { _router: { stack: Layer[] } })._router.stack;
  walk(stack, '');
  return routes;
}

const toOpenApiPath = (path: string): string => path.replace(/:(\w+)/g, '{$1}');

describe('/api/docs', () => {
  it('serves the Swagger UI page without needing a CDN', async () => {
    const response = await request(app).get('/api/docs/').expect(200);
    expect(response.text).toContain('swagger-ui');
    expect(response.text).not.toMatch(/https?:\/\/(cdn|unpkg)/);
  });

  it('serves the bundled Swagger UI asset', async () => {
    await request(app).get('/api/docs/assets/swagger-ui-bundle.js').expect(200);
  });

  it('serves a valid OpenAPI 3.1 document', async () => {
    const response = await request(app).get('/api/docs/openapi.json').expect(200);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info.title).toBe('FlowDesk API');
    expect(Object.keys(response.body.paths).length).toBeGreaterThan(15);
    expect(response.body.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('is reachable without authentication', async () => {
    await request(app).get('/api/docs/openapi.json').expect(200);
  });
});

describe('spec coverage', () => {
  const spec = buildOpenApiDocument();
  const documented = new Set(
    Object.entries(spec.paths).flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((key) => ['get', 'post', 'patch', 'put', 'delete'].includes(key))
        .map((method) => `${method.toUpperCase()} ${path}`),
    ),
  );

  it('documents every route the app actually mounts', () => {
    const mounted = listRoutes(app)
      .filter((route) => route.path.startsWith('/api'))
      // The docs router serves static assets, which are not API operations.
      .filter((route) => !route.path.startsWith('/api/docs'))
      .map((route) => `${route.method} ${toOpenApiPath(route.path)}`);

    expect(mounted.length).toBeGreaterThan(15);
    const undocumented = mounted.filter((route) => !documented.has(route));
    expect(undocumented).toEqual([]);
  });

  it('describes the machine-readable error codes clients switch on', () => {
    const codes = spec.components.schemas.Error.properties.error.properties.code.enum;
    expect(codes).toEqual(
      expect.arrayContaining([
        'INVALID_TRANSITION',
        'FORBIDDEN_TRANSITION',
        'VALIDATION_ERROR',
        'RATE_LIMITED',
      ]),
    );
  });
});

describe('GET /api/health', () => {
  it('reports the database as reachable', async () => {
    const response = await request(app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({ status: 'ok', database: 'up' });
  });
});
