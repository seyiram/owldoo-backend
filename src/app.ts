import express from 'express';
import cors from 'cors';
import connectDB from './config/database';
import router from './routes';
// import taskRoutes from './routes/taskRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(express.json());

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
  next();
});

// Routes
app.use('/api', router);

// Database connection
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});