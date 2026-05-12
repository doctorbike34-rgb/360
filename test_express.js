import express from 'express';

const app = express();

app.get(/\.(env|git|php|yaml|yml|xml|ini|conf)/, (req, res) => {
  res.status(404).send('Not Found via regex');
});

app.get('*', (req, res) => {
  res.status(200).send('Caught by star');
});

app.listen(3001, () => console.log('Listening on 3001'));
