import express from 'express';
import cors from 'cors';

import { fileURLToPath } from 'url';

console.log('--- SERVER STARTING ---');
import path from 'path';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  let stripe: Stripe | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  // Webhook needs raw body
  app.post('/api/webhook', express.raw({type: 'application/json'}), (req, res) => {
    if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).send('Stripe not configured.');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig as string, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        console.log('PaymentIntent was successful!');
        // Fulfillment logic goes here
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send();
  });

  app.use(express.json());
  app.use(cors());

  // API Routes
  app.get(['/api/health', '/healthz'], (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Block common scanner requests to prevent weird logs or index.html serving
  app.get(/\.(env|git|php|yaml|yml|xml|ini|conf)/, (req, res) => {
    res.status(404).send('Not Found');
  });

  app.get('/api/geoip', async (req, res) => {
    try {
      const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
      if (!response.ok) throw new Error('GeoJS failed');
      const data = await response.json();
      res.json(data);
    } catch (err) {
      // Fallback if geojs is down
      res.json({ latitude: 41.9028, longitude: 12.4964, city: 'Rome', country: 'Italy' });
    }
  });

  app.post('/api/create-payment-intent', async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    const { amount, currency = 'eur', metadata } = req.body;

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // amount in cents
        currency,
        metadata: {
            ...metadata,
            platform: 'AIBikeRescue'
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error('Stripe Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`Node Environment: ${process.env.NODE_ENV || 'undefined'} (isProduction: ${isProduction})`);

  // Vite middleware for development
  if (!isProduction) {
    console.log('Starting Vite in development mode...');
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware integrated.');
    } catch (viteError) {
      console.error('Failed to start Vite:', viteError);
    }
  } else {
    // In production, serve the built static files
    // Use __dirname to find dist if we're already inside it (bundled), otherwise use cwd/dist
    const isBundled = __dirname.endsWith('dist') || __dirname.includes('/dist');
    const distPath = isBundled ? __dirname : path.join(__dirname, 'dist');
    
    console.log(`Serving static files from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
