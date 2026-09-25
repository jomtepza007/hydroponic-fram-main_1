import { CheckCircle2, Circle, Clock, Truck, PackageCheck, FileText, Check } from 'lucide-react'
import {
  ORDER_STATUS_LABELS,
  STATUS_FLOW,
  EQUIPMENT_STATUS_FLOW,
  EQUIPMENT_STATUS_LABELS,
} from '../../utils/dateUtils'

/**
 * StatusTimeline — แสดง timeline ความคืบหน้าคำสั่งซื้อ/การปลูก
 */
export default function StatusTimeline({ currentStatus, isEquipment = false }) {
  const flow = isEquipment ? EQUIPMENT_STATUS_FLOW : STATUS_FLOW
  const labels = isEquipment ? EQUIPMENT_STATUS_LABELS : ORDER_STATUS_LABELS
  const currentIdx = flow.indexOf(currentStatus)

  const equipmentIcons = {
    pending: FileText,
    confirmed: Check,
    ready: Truck,
    completed: PackageCheck,
  }

  return (
    <div className="w-full">
      <div className="flex items-center">
        {flow.map((status, idx) => {
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx
          const isPending = idx > currentIdx

          const EquipIcon = equipmentIcons[status] || Circle

          return (
            <div key={status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                {/* Icon */}
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${isCompleted ? 'bg-forest text-white' : ''}
                  ${isCurrent ? 'bg-mint-500 text-white ring-4 ring-mint-200 shadow-md' : ''}
                  ${isPending ? 'bg-gray-100 text-gray-300' : ''}
                `}>
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : isCurrent ? (
                    isEquipment ? <EquipIcon className="w-4 h-4 animate-pulse" /> : <Clock className="w-4 h-4 animate-pulse" />
                  ) : (
                    isEquipment ? <EquipIcon className="w-4 h-4" /> : <Circle className="w-4 h-4" />
                  )}
                </div>
                {/* Label */}
                <p className={`text-xs mt-1.5 font-medium whitespace-nowrap text-center
                  ${isCompleted ? 'text-forest' : isCurrent ? 'text-mint-600 font-semibold' : 'text-gray-300'}`}>
                  {labels[status] || status}
                </p>
              </div>

              {/* Connector line */}
              {idx < flow.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 transition-all duration-500
                  ${idx < currentIdx ? 'bg-forest' : 'bg-gray-200'}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
