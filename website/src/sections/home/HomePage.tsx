import { RouteRail } from '../../components/RouteRail'
import { ConnectionStory } from './ConnectionStory'
import { HomeHero } from './HomeHero'
import { OneCommand } from './OneCommand'
import { RealDevelopment } from './RealDevelopment'
import { ShareIntent } from './ShareIntent'
import { Signoff } from './Signoff'
import { Transparency } from './Transparency'

const railStops = [
  { id: 'one-command', label: 'One command' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'sharing', label: 'Sharing' },
  { id: 'development', label: 'Development' },
  { id: 'limits', label: 'Limits' },
  { id: 'start', label: 'Start' },
] as const

export function HomePage() {
  return (
    <>
      <RouteRail stops={railStops} />
      <HomeHero />
      <OneCommand />
      <ConnectionStory />
      <ShareIntent />
      <RealDevelopment />
      <Transparency />
      <Signoff />
    </>
  )
}
