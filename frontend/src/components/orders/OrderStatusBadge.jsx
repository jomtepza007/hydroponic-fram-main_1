import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CLASSES,
  EQUIPMENT_STATUS_LABELS,
  EQUIPMENT_STATUS_CLASSES,
} from '../../utils/dateUtils'

/**
 * OrderStatusBadge — แสดง Badge สถานะออเดอร์
 */
export default function OrderStatusBadge({ status, isEquipment = false }) {
  const labels = isEquipment ? EQUIPMENT_STATUS_LABELS : ORDER_STATUS_LABELS
  const classes = isEquipment ? EQUIPMENT_STATUS_CLASSES : ORDER_STATUS_CLASSES

  const label = labels[status] || ORDER_STATUS_LABELS[status] || status
  const className = classes[status] || ORDER_STATUS_CLASSES[status] || 'badge-pending'

  const dots = {
    pending:   'bg-gray-400',
    confirmed: 'bg-teal-500',
    seeding:   'bg-yellow-500',
    growing:   'bg-blue-500',
    ready:     'bg-green-500',
    completed: 'bg-primary-600',
    cancelled: 'bg-red-500',
  }

  return (
    <span className={className}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[status] || 'bg-gray-400'}`} />
      {label}
    </span>
  )
}
