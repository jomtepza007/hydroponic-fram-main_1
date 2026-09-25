import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { Menu, X, Leaf, Bell, LogOut, User, ShoppingBag, LayoutDashboard, ShoppingCart } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useCart } from '../../context/CartContext'
import { signOut } from '../../api/auth'

export default function Navbar() {
  const { isLoggedIn, profile, user, isAdmin, isFarmer } = useAuth()
  const { totalItems } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const navLinks = [
    { to: '/products', label: 'รายการผัก' },
    { to: '/products?category=equipment', label: 'อุปกรณ์' },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-primary-100 shadow-sm">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 bg-gradient-green rounded-xl flex items-center justify-center shadow-md group-hover:shadow-glow transition-all duration-300">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-forest-dark text-lg leading-none">HydroFarm</span>
              <p className="text-xs text-gray-400 leading-none">Preorder System</p>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-forest hover:bg-primary-50 transition-all duration-200"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right Side */}
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                {/* Dashboard link */}
                {(isAdmin || isFarmer) && (
                  <Link
                    to={isAdmin ? '/admin' : '/farmer'}
                    className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-forest hover:bg-primary-50 transition-all"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    แดชบอร์ด
                  </Link>
                )}

                {/* Orders — แสดงเฉพาะ customer */}
                {!isAdmin && !isFarmer && (
                  <Link
                    to="/orders"
                    className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-forest hover:bg-primary-50 transition-all"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    ออเดอร์
                  </Link>
                )}

                {/* Cart icon — แสดงเฉพาะ customer */}
                {!isAdmin && !isFarmer && (
                  <Link
                    to="/cart"
                    className="relative p-2 rounded-lg text-gray-500 hover:text-forest hover:bg-primary-50 transition-all"
                    id="nav-cart-icon"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {totalItems > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-forest text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {totalItems > 9 ? '9+' : totalItems}
                      </span>
                    )}
                  </Link>
                )}

                {/* Notification Bell */}
                <button className="relative p-2 rounded-lg text-gray-500 hover:text-forest hover:bg-primary-50 transition-all">
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                </button>

                {/* Profile Dropdown */}
                <div className="relative group">
                  <button className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-primary-50 transition-all">
                    {user?.user_metadata?.avatar_url ? (
                      <img
                        src={user.user_metadata.avatar_url}
                        alt="avatar"
                        className="w-8 h-8 rounded-full object-cover border-2 border-primary-200"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-green flex items-center justify-center">
                        <User className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <span className="hidden md:block text-sm font-medium text-gray-700 max-w-[100px] truncate">
                      {profile?.full_name || user?.email?.split('@')[0]}
                    </span>
                  </button>

                  {/* Dropdown */}
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-card-hover border border-gray-100 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <p className="text-sm font-semibold text-gray-800 truncate">{profile?.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{user?.email}</p>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      ออกจากระบบ
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <Link to="/login" className="btn-primary btn-sm">
                เข้าสู่ระบบ
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-primary-50 transition-all"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-primary-100 py-3 space-y-1 animate-fade-in">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileOpen(false)}
                className="flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-forest transition-all"
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn && (
              <>
                {/* Orders mobile — แสดงเฉพาะ customer */}
                {!isAdmin && !isFarmer && (
                  <Link
                    to="/orders"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-forest transition-all"
                  >
                    ออเดอร์ของฉัน
                  </Link>
                )}
                {(isAdmin || isFarmer) && (
                  <Link
                    to={isAdmin ? '/admin' : '/farmer'}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center px-4 py-2.5 rounded-xl text-sm font-medium text-forest hover:bg-primary-50 transition-all"
                  >
                    แดชบอร์ด
                  </Link>
                )}
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-all"
                >
                  ออกจากระบบ
                </button>
              </>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
