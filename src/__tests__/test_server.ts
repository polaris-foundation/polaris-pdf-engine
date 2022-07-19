/* global describe test */
const request = require('supertest');
import {app} from '../server/app';

const contentType = 'Content-Type';
const contentTypePdf = /application\/pdf/;
const contentTypeJson = /application\/json/;

describe('Test the /running path response code', () => {
  test('It should respond to a GET', () => {
    return request(app).get('/running').expect(200);
  });
});

describe('Test the /running path response type', () => {
  test('It should respond to a GET with application/JSON', () => {
    return request(app).get('/running').expect(contentType,contentTypeJson);
  });
});

describe('Test the /dhos/v1/send_pdf path error response', () => {
  test('It should respond to a POST with bad data with a 400 error', (done) => {
    request(app)
      .post('/dhos/v1/send_pdf')
      .send({})
      .expect(400)
      .end(done);
  });
});

describe('Test the /dhos/v1/send_pdf path response type', () => {
  let jsonBody: any;
  beforeEach(() => {
    jsonBody = {
      patient: require('./sample_patient.json'),
      encounter: require('./sample_encounter.json'),
      observation_sets: require('./sample_observations2.json'),
      location: require('./sample_location.json'),
      trustomer: require('./sample_trustomer.json'),
      pages: {first: 3, last: 3}
    };
  });
  test('It should respond to a POST with application/pdf', (done) => {
    request(app)
      .post('/dhos/v1/send_pdf')
      .send(jsonBody)
      .set('X-REQUEST-ID', "recordId TEST")
      .expect(200)
      .expect(contentType, contentTypePdf)
      .end(done);
  });
});

describe('Test the sample URL used for development only.', () => {
  test('It should generate a single page for OUH', () => {
    return request(app)
      .get('/dhos/v1/sample_send_pdf?page=1&trust=ouh')
      .expect(200)
      .expect(contentType, contentTypePdf);
  });
  test('It should generate a single page for DEV', () => {
    return request(app)
      .get('/dhos/v1/sample_send_pdf')
      .expect(200)
      .expect(contentType, contentTypePdf);
  });
});
