import express = require('express');

const httpContext  = require ('express-http-context');
const cors = require('cors');
var bodyParser = require('body-parser');

import {log} from './log';
import {JsonRequest} from "./models/jsonTypes";

import {generatePdf} from './pdf_generator';

export const app: express.Application = express();

app.use(httpContext.middleware);

app.use((req, res, next) => {
  httpContext.ns.bindEmitter(req);
  httpContext.ns.bindEmitter(res);
  let requestId = req.headers['x-request-id'];
  httpContext.set('requestId', requestId);
  next();
});

app.use(cors());
app.use(bodyParser.json({limit: '50mb'}));

// Default responses to application/json
app.use(express.json());

app.get('/running', (req, res) => res.send({'running': true}));

app.use('/healthcheck', require('express-healthcheck')());

app.get('/dhos/v1/sample_send_pdf', async function (req, res, next) {
  // Generate a sample SEND pdf using data from the tests folder.
  // Optional query string parameter page can be used to select a single page by number,
  // Or a range of pages (give two numbers separated by a colon)
  // e.g.
  //     /sample_send_pdf?page=2 for pages 2 only.
  //     /sample_send_pdf?page=3:5 for pages 3 to 5 inclusive.

  const trustomer = require('../__tests__/sample_trustomer.json');
  const trustomer_ouh = require('../__tests__/sample_trustomer_ouh.json');

  const jsonBody: JsonRequest = {
    patient: require('../__tests__/sample_patient.json'),
    encounter: require('../__tests__/sample_encounter.json'),
    observation_sets: require('../__tests__/sample_observations2.json'),
    location: require('../__tests__/sample_location.json'),
    trustomer: req.query.trust === 'ouh'? trustomer_ouh: trustomer
  };

  let pageRange = req.query.page;
  if (pageRange) {
    let [first, last] = pageRange.split(':').map((s: string) => parseInt(s));
    if (isNaN(first)) {
      first = 0;
    }
    if (last === undefined) {
      last = first;
    } else if (isNaN(last)) {
      last = 99999;
    }
    jsonBody.pages = {first, last};
  }
  const startTime = new Date().getTime();
  log.info('Starting PDF generation');
  log.debug(`Running on patient data: ${JSON.stringify(jsonBody)}`);
  try {
    await generatePdf(jsonBody, res);
    log.info('Completed PDF generation');
  } catch(err) {
      log.error(err);
      next(err);
  }
  log.info(`${req.url} endpoint hit`, {
      httpRequest: {
        status: res.statusCode,
        requestUrl: req.url,
        requestMethod: req.method,
        remoteIp: req.connection.remoteAddress,
        responseSize: res.hasHeader('content-length') ? res.getHeader('content-length') : 0,
        userAgent: req.get('user-agent'),
        latency: `${(new Date().getTime() - startTime) / 1000}s`
      }
    });
});

app.post('/dhos/v1/send_pdf', async function (req, res, next) {
  const jsonBody = req.body;
  const startTime = new Date().getTime();

  log.info('Starting PDF generation');
  log.debug(`Running on patient data: ${JSON.stringify(jsonBody)}`);
  try {
    await generatePdf(jsonBody, res);
    log.info('Completed PDF generation');
  } catch(err) {
      log.error(err);
      next(err);
  }
  log.info(`${req.url} endpoint hit`, {
      httpRequest: {
        status: res.statusCode,
        requestUrl: req.url,
        requestMethod: req.method,
        remoteIp: req.connection.remoteAddress,
        responseSize: res.hasHeader('content-length') ? res.getHeader('content-length') : 0,
        userAgent: req.get('user-agent'),
        latency: `${(new Date().getTime() - startTime) / 1000}s`
      }
    });
});
