import express, { Router } from 'express';
import helmet from 'helmet';
import swaggerUiDist from 'swagger-ui-dist';
import { buildOpenApiDocument } from '../openapi.js';

/**
 * Swagger UI is served from the `swagger-ui-dist` package rather than a CDN, so
 * /api/docs works with no outbound network access (and inside docker compose).
 */
const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FlowDesk API — reference</title>
    <link rel="stylesheet" href="./assets/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="./assets/swagger-ui-bundle.js"></script>
    <script src="./assets/swagger-ui-standalone-preset.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'BaseLayout',
        persistAuthorization: true,
      });
    </script>
  </body>
</html>
`;

export const docsRouter = Router();

// Swagger UI needs inline scripts; scope the relaxed policy to this router only.
docsRouter.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);

docsRouter.get('/openapi.json', (req, res) => {
  const proto = req.protocol;
  const host = req.get('host') ?? 'localhost';
  res.json(buildOpenApiDocument(`${proto}://${host}`));
});

docsRouter.use('/assets', express.static(swaggerUiDist.getAbsoluteFSPath(), { index: false }));

docsRouter.get('/', (_req, res) => {
  res.type('html').send(page);
});
