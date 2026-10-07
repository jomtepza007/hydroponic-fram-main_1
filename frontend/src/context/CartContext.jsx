import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useAuth } from './AuthContext'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id || null

  const getCartKey = (uid) => uid ? `hydro_cart_${uid}` : 'hydro_cart_guest'

  const normalizeCartItem = (i) => {
    if (!i) return i
    const rawPrice = i.price_per_kg ?? i.price ?? 0
    const unitPrice = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
    return {
      ...i,
      price: unitPrice,
      price_per_kg: unitPrice,
    }
  }

  // โหลด cart เฉพาะของบัญชีปัจจุบัน
  const [cart, setCart] = useState(() => {
    try {
      const key = userId ? `hydro_cart_${userId}` : 'hydro_cart_guest'
      const saved = localStorage.getItem(key)
      const list = saved ? JSON.parse(saved) : []
      return Array.isArray(list) ? list.map(normalizeCartItem) : []
    } catch { return [] }
  })

  // เมื่อเปลี่ยนบัญชีผู้ใช้ (Switch user หรือ Logout) ให้โหลดตะกร้าของบัญชีนั้นๆ ทันที
  useEffect(() => {
    try {
      const key = getCartKey(userId)
      const saved = localStorage.getItem(key)
      const list = saved ? JSON.parse(saved) : []
      setCart(Array.isArray(list) ? list.map(normalizeCartItem) : [])
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
    if (!userId) {
      return false
    }
    const isVeg = product.category === 'vegetable'
    const defaultQty = isVeg ? 1 : 1
    const qtyToAdd = quantity !== null && Number(quantity) > 0 ? Number(quantity) : defaultQty

    const rawPrice = product.price_per_kg ?? product.price ?? 0
    const unitPrice = isNaN(Number(rawPrice)) ? 0 : Number(rawPrice)
    const normalizedProduct = {
      ...product,
      price: unitPrice,
      price_per_kg: unitPrice,
    }

    setCart(prev => {
      const existing = prev.find(i => i.id === normalizedProduct.id)
      if (existing) {
        const rawNewQty = Number(existing.qty) + qtyToAdd
        const roundedQty = isVeg ? Math.round(rawNewQty * 10) / 10 : Math.round(rawNewQty)
        const existingPrice = Number(existing.price_per_kg ?? existing.price ?? 0)
        const finalPrice = unitPrice > 0 ? unitPrice : existingPrice
        return prev.map(i => i.id === normalizedProduct.id ? {
          ...i,
          ...normalizedProduct,
          price: finalPrice,
          price_per_kg: finalPrice,
          qty: roundedQty
        } : i)
      }
      const initialQty = isVeg ? Math.round(qtyToAdd * 10) / 10 : Math.round(qtyToAdd)
      return [...prev, { ...normalizedProduct, qty: initialQty }]
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

  const getItemPrice = (i) => {
    const p = Number(i?.price_per_kg ?? i?.price ?? 0)
    return isNaN(p) ? 0 : p
  }

  const totalItems = cart.reduce((s, i) => s + (Number(i.qty) > 0 ? 1 : 0), 0)
  const totalItemCount = cart.reduce((s, i) => s + Number(i.qty), 0)

  const vegTotalPrice = vegItems.reduce((s, i) => s + (Number(i.qty) * getItemPrice(i)), 0)
  const equipTotalPrice = equipItems.reduce((s, i) => s + (Number(i.qty) * getItemPrice(i)), 0)
  const totalPrice = cart.reduce((s, i) => s + (Number(i.qty) * getItemPrice(i)), 0)

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

