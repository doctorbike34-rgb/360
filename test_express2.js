import express from 'express';
import request from 'supertest';

const app = express();

app.get(/\.(env|git|php|yaml|yml|xml|ini|conf)/, (req, res) => {
  res.status(404).send('Not Found via regex');
});

app.get('*', (req, res) => {
  res.status(200).send('Caught by star');
});

request(app)
  .get('/')
  .expect(200)
  .end(function(err, res) {
    if (err) throw err;
    console.log("Response for /:", res.text, res.status);
    
    request(app)
      .get('/.env')
      .expect(404)
      .end(function(err, res2) {
        if (err) throw err;
        console.log("Response for /.env:", res2.text, res2.status);
        process.exit(0);
      });
  });
