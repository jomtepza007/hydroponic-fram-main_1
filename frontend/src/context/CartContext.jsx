import { createContext, useContext, useState, useEffect } from 'react'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('equipment_cart') || '[]')
    } catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem('equipment_cart', JSON.stringify(cart))
  }, [cart])

  function addToCart(product) {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...prev, { ...product, qty: 1 }]
    })
  }

  function removeFromCart(productId) {
    setCart(prev => prev.filter(i => i.id !== productId))
  }

  function updateQty(productId, qty) {
    if (qty < 1) { removeFromCart(productId); return }
    setCart(prev => prev.map(i => i.id === productId ? { ...i, qty } : i))
  }

  function clearCart() { setCart([]) }

  const totalItems = cart.reduce((s, i) => s + i.qty, 0)
  const totalPrice = cart.reduce((s, i) => s + i.qty * Number(i.price_per_kg), 0)

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQty, clearCart, totalItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be inside CartProvider')
  return ctx
}
