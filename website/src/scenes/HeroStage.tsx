import { ConnectionPath } from './ConnectionPath'
import { DeviceFrame } from './DeviceFrame'
import { TerminalStage } from './TerminalStage'

export function HeroStage() {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1.3fr_auto_1fr]">
      <TerminalStage />
      <ConnectionPath />
      <DeviceFrame />
    </div>
  )
}
