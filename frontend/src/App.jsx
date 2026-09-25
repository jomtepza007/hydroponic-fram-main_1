import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Home from './pages/Home'
import Login from './pages/Login'
import AuthCallback from './pages/AuthCallback'

// Customer
import ProductList from './pages/customer/ProductList'
import NewOrder from './pages/customer/NewOrder'
import OrderHistory from './pages/customer/OrderHistory'
import OrderTracking from './pages/customer/OrderTracking'
import Cart from './pages/customer/Cart'
import EquipmentCheckout from './pages/customer/EquipmentCheckout'

// Farmer
import FarmerDashboard from './pages/farmer/FarmerDashboard'
import FarmerOrders from './pages/farmer/FarmerOrders'
import FarmerOrderDetail from './pages/farmer/FarmerOrderDetail'

// Admin
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminVegetables from './pages/admin/AdminVegetables'
import AdminUsers from './pages/admin/AdminUsers'
import AdminReports from './pages/admin/AdminReports'

// Placeholder pages (built separately)
import ProductDetail from './pages/customer/ProductDetail'
import FarmerSchedule from './pages/farmer/FarmerSchedule'
import FarmerResources from './pages/farmer/FarmerResources'
import AdminOrders from './pages/admin/AdminOrders'
import AdminFarmSettings from './pages/admin/AdminFarmSettings'
import AdminGrowingAreas from './pages/admin/AdminGrowingAreas'
import AdminResources from './pages/admin/AdminResources'

function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <div className="text-6xl">🚫</div>
      <h1 className="text-2xl font-bold text-gray-700">ไม่มีสิทธิ์เข้าถึง</h1>
      <p className="text-gray-400">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      <a href="/" className="btn-primary">กลับหน้าหลัก</a>
    </div>
  )
}

function Banned() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <div className="text-6xl">⛔</div>
      <h1 className="text-2xl font-bold text-gray-700">บัญชีถูกระงับ</h1>
      <p className="text-gray-400">กรุณาติดต่อผู้ดูแลระบบ</p>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              borderRadius: '12px',
              fontFamily: 'Sarabun, sans-serif',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#2D6A4F', secondary: '#fff' } },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/banned" element={<Banned />} />

          {/* Auth Callback — รับ redirect จาก Google OAuth */}
          <Route path="/auth/callback" element={<AuthCallback />} />

          {/* Customer Routes */}
          <Route path="/products" element={<ProductList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route
            path="/order/new/:id"
            element={
              <ProtectedRoute allowedRoles={['customer', 'admin']}>
                <NewOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute allowedRoles={['customer', 'admin']}>
                <OrderHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/cart"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <Cart />
              </ProtectedRoute>
            }
          />
          <Route
            path="/equipment/checkout"
            element={
              <ProtectedRoute allowedRoles={['customer']}>
                <EquipmentCheckout />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <ProtectedRoute>
                <OrderTracking />
              </ProtectedRoute>
            }
          />

          {/* Farmer Routes */}
          <Route
            path="/farmer"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <FarmerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/schedule"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <FarmerSchedule />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/orders"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <FarmerOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/orders/:id"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <FarmerOrderDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/resources"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <FarmerResources />
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmer/vegetables"
            element={
              <ProtectedRoute allowedRoles={['farmer', 'admin']}>
                <AdminVegetables />
              </ProtectedRoute>
            }
          />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/vegetables"
            element={
              <ProtectedRoute allowedRoles={['admin', 'farmer']}>
                <AdminVegetables />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders/:id"
            element={
              <ProtectedRoute allowedRoles={['admin', 'farmer']}>
                <FarmerOrderDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/farm-settings"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminFarmSettings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/growing-areas"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminGrowingAreas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/resources"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminResources />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reports"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminReports />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  )
}
