import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id || null

  const getCartKey = (uid) => uid ? `hydro_cart_${uid}` : 'hydro_cart_guest'

  // โหลด cart เฉพาะของบัญชีปัจจุบัน
  const [cart, setCart] = useState(() => {
    try {
      const key = userId ? `hydro_cart_${userId}` : 'hydro_cart_guest'
      const saved = localStorage.getItem(key)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })

  // เมื่อเปลี่ยนบัญชีผู้ใช้ (Switch user หรือ Logout) ให้โหลดตะกร้าของบัญชีนั้นๆ ทันที
  useEffect(() => {
    try {
      const key = getCartKey(userId)
      const saved = localStorage.getItem(key)
      setCart(saved ? JSON.parse(saved) : [])
    } catch {
      setCart([])
    }
  }, [userId])

  // บันทึกตะกร้าลงใน localStorage ของบัญชีปัจจุบัน
  useEffect(() => {
    try {
      const key = getCartKey(userId)
      localStorage.setItem(key, JSON.stringify(cart))
    } catch {}
  }, [cart, userId])

  /**
   * เพิ่มสินค้าลงตะกร้า
   * @param {Object} product - ข้อมูลสินค้า/ผัก
   * @param {number} [quantity] - ปริมาณที่ต้องการเพิ่ม (ถ้าไม่ระบุ ผัก=1 หรือ 0.5, อุปกรณ์=1)
   */
  function addToCart(product, quantity = null) {
    const isVeg = product.category === 'vegetable'
    const defaultQty = isVeg ? 1 : 1
    const qtyToAdd = quantity !== null && Number(quantity) > 0 ? Number(quantity) : defaultQty

    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        const rawNewQty = Number(existing.qty) + qtyToAdd
        const roundedQty = isVeg ? Math.round(rawNewQty * 10) / 10 : Math.round(rawNewQty)
        return prev.map(i => i.id === product.id ? { ...i, qty: roundedQty } : i)
      }
      const initialQty = isVeg ? Math.round(qtyToAdd * 10) / 10 : Math.round(qtyToAdd)
      return [...prev, { ...product, qty: initialQty }]
    })
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.id !== productId))
  }

  /**
   * ปรับจำนวนสินค้าในตะกร้า
   * @param {string} productId 
   * @param {number} newQty 
   */
  function updateQty(productId, newQty) {
    const num = Number(newQty)
    const item = cart.find(i => i.id === productId)
    const isVeg = item?.category === 'vegetable'
    const minQty = isVeg ? 0.5 : 1

    if (isNaN(num) || num < minQty) {
      removeFromCart(productId)
      return
    }

    const rounded = isVeg ? Math.round(num * 10) / 10 : Math.round(num)
    setCart(prev => prev.map(i => i.id === productId ? { ...i, qty: rounded } : i))
  }

  function clearCart() {
    setCart([])
  }

  function clearCartCategory(category) {
    setCart(prev => prev.filter(i => i.category !== category))
  }

  // ตัวแยกหมวดหมู่
  const vegItems = cart.filter(i => i.category === 'vegetable')
  const equipItems = cart.filter(i => i.category !== 'vegetable')

  const totalItems = cart.reduce((s, i) => s + (Number(i.qty) > 0 ? 1 : 0), 0)
  const totalItemCount = cart.reduce((s, i) => s + Number(i.qty), 0)

  const vegTotalPrice = vegItems.reduce((s, i) => s + (Number(i.qty) * Number(i.price_per_kg || 0)), 0)
  const equipTotalPrice = equipItems.reduce((s, i) => s + (Number(i.qty) * Number(i.price_per_kg || 0)), 0)
  const totalPrice = cart.reduce((s, i) => s + (Number(i.qty) * Number(i.price_per_kg || 0)), 0)

  const vegTotalWeight = vegItems.reduce((s, i) => s + Number(i.qty), 0)

  return (
    <CartContext.Provider value={{
      cart,
      vegItems,
      equipItems,
      addToCart,
      removeFromCart,
      updateQty,
      clearCart,
      clearCartCategory,
      totalItems,
      totalItemCount,
      totalPrice,
      vegTotalPrice,
      equipTotalPrice,
      vegTotalWeight
    }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}

