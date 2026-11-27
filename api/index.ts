import express from 'express';
import { createCatalogRouter } from './_catalog.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const catalogRouter = createCatalogRouter();
app.use('/api', catalogRouter);
app.use('/', catalogRouter);

export default app;
