const options = {
  info: {
    version: '1.0.0',
    title: 'Online Store API',
    description: 'Tài liệu API cho dự án Online Store (Laptop & Gear)',
    contact: {
      name: 'API Support',
    },
  },
  servers: [
    {
      url: process.env.BACKEND_URL || 'http://localhost:5000',
      description: 'Development server',
    },
  ],
  security: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    },
  },
  baseDir: __dirname,
  // Glob pattern to find your jsdoc files (can be an array)
  filesPattern: ['../routes/*.js', '../models/*.js'],
  // URL where SwaggerUI will be rendered
  swaggerUIPath: '/api-docs',
  // Expose OpenAPI UI
  exposeSwaggerUI: true,
  // Expose Open API JSON Docs documentation in `apiDocsPath` path.
  apiDocsPath: '/v3/api-docs',
  // Set non-required fields as nullable by default
  notRequiredAsNullable: false,
};

module.exports = options;