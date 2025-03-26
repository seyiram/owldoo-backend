import express from 'express';
import cors from 'cors';
import connectDB from './config/database';
import router from './routes';
import calendarRoutes from './routes/calendar.routes';
import cookieParser from 'cookie-parser';
// import taskRoutes from './routes/taskRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: function(origin, callback) {
    // Allow all origins that match the pattern
    const allowedOrigins = [
      'http://localhost:5173', 
      'http://localhost:3000', 
      'http://localhost:5174', 
      'http://localhost:5175', 
      'http://127.0.0.1:5173', 
      'http://127.0.0.1:3000', 
      'http://127.0.0.1:5174', 
      'http://127.0.0.1:5175'
    ];
    
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked for origin:', origin);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin', 'Accept', 'Cookie'],
  exposedHeaders: ['Set-Cookie', 'Date', 'ETag', 'X-Calendar-Auth-Required'],
  credentials: true,
  maxAge: 86400
}));
app.use(express.json());
app.use(cookieParser());

// Content Security Policy
app.use((req, res, next) => {
  res.header(
    'Content-Security-Policy', 
    "default-src 'self' https://accounts.google.com https://*.googleapis.com; " +
    "frame-src https://accounts.google.com https://*.google.com; " +
    "connect-src 'self' https://accounts.google.com https://*.googleapis.com; " +
    "img-src 'self' https://*.googleusercontent.com data:; " +
    "script-src 'self' 'unsafe-inline' https://accounts.google.com https://*.googleapis.com;"
  );
  
  // Let the CORS middleware handle OPTIONS requests - don't set duplicate headers
  if (req.method === 'OPTIONS') {
    // Preflight request - respond immediately with 204
    return res.status(204).end();
  }
  
  next();
});

// Health check route - useful for testing CORS
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    time: new Date().toISOString(),
    cors: 'enabled',
    origin: req.headers.origin || 'unknown'
  });
});

// Routes
app.use('/api', router);
app.use('/calendar', calendarRoutes);

// Database connection
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});