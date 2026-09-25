/**
 * Role-based middleware factory
 * @param {...string} roles - roles ที่อนุญาต เช่น 'admin', 'farmer'
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.role) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!roles.includes(req.role)) {
      return res.status(403).json({
        error: `Forbidden: requires role ${roles.join(' or ')}`,
      })
    }
    next()
  }
}
