import express from 'express';
import cors from 'cors';
import connectDB from './config/database';
// import taskRoutes from './routes/taskRoutes';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
// app.use('/api/tasks', taskRoutes);

// Database connection
connectDB();

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});