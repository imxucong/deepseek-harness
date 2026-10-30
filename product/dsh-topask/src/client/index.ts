/** TopAsk occupants for the generic sidebar and conversation brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { TopAskBrandName, TopAskHeroMark, TopAskSidebarMark } from './Brand.tsx'

// The slot declarations live with the shell packages that own them. This
// package is built and loaded on its own, so it restates the three entries it
// occupies instead of importing those packages' whole client graphs.
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'sidebar.brand.mark': { kind: 'single'; scope: 'root'; owner: { size: number } }
    'sidebar.brand.name': { kind: 'single'; scope: 'root'; owner: { children?: never } }
    'conversation.hero.brand.mark': {
      kind: 'single'
      scope: 'root'
      owner: { size: number; className?: string | undefined }
    }
  }
}

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar and conversation-hero brand slots with TopAsk occupants.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, TopAskSidebarMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, TopAskBrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark' }, TopAskHeroMark))
}
