import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import systemRouter from './routes/system.js';
import authRouter from './routes/auth.js';
import tutorRouter from './routes/tutors.js';
import courseRouter from './routes/courses.js';
import reviewRouter from './routes/reviews.js';
import favoriteRouter from './routes/favorites.js';

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api', systemRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/tutors', tutorRouter);
  app.use('/api/courses', courseRouter);
  app.use('/api', reviewRouter);
  app.use('/api', favoriteRouter);

  return app;
};

export default createApp();
