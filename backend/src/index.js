import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

// Routes
import authRoutes from './api/routes/auth.js'
import vegetableRoutes from './api/routes/vegetables.js'
import orderRoutes from './api/routes/orders.js'
import resourceRoutes from './api/routes/resources.js'
import farmRoutes from './api/routes/farmSettings.js'
import userRoutes from './api/routes/users.js'
import reportRoutes from './api/routes/reports.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
].filter(Boolean)

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true)
    }
    return callback(new Error('Blocked by CORS policy'))
  },
  credentials: true,
}))
app.use(express.json())

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'HydroFarm API is running 🌱' })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/vegetables', vegetableRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/resources', resourceRoutes)
app.use('/api/farm', farmRoutes)
app.use('/api/users', userRoutes)
app.use('/api/reports', reportRoutes)

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: err.message || 'Internal Server Error' })
})

app.listen(PORT, () => {
  console.log(`🌱 HydroFarm API running on http://localhost:${PORT}`)
})
