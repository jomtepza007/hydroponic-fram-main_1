import { Leaf, Heart, Phone, Mail, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-forest-dark text-white mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">

          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                <Leaf className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl">HydroFarm</span>
            </div>
            <p className="text-white/60 text-sm leading-relaxed">
              ระบบสั่งจองผักไฮโดรโปนิกออร์แกนิก สด สะอาด ปลอดภัย ตรงจากฟาร์มถึงมือคุณ
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-white mb-4">ลิงก์ด่วน</h4>
            <ul className="space-y-2">
              {[
                { to: '/products', label: 'รายการผัก' },
                { to: '/products?category=equipment', label: 'อุปกรณ์ปลูก' },
                { to: '/orders', label: 'ออเดอร์ของฉัน' },
              ].map(link => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="text-white/60 hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-white mb-4">ติดต่อเรา</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-mint-400" />
                <span>ใส่เบอร์</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-mint-400" />
                <span>ไว้ใส่เมล</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-mint-400 mt-0.5 flex-shrink-0" />
                <span>ฟาร์มไฮโดรโปนิกส์ อ.หาดใหญ่ จ.สงขลา</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-white/40 text-xs">
            © 2024 HydroFarm. All rights reserved.
          </p>
          <p className="text-white/40 text-xs flex items-center gap-1">
            Made with <Heart className="w-3 h-3 text-red-400" /> for organic farming
          </p>
        </div>
      </div>
    </footer>
  )
}
