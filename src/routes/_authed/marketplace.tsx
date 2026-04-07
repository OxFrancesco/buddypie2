import { useState } from 'react'
import { convexQuery } from '@convex-dev/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { api } from 'convex/_generated/api'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { createDefaultMarketplaceDraft } from '~/features/marketplace/server'
import { getBuiltinMarketplaceEntries } from '~/lib/opencode/marketplace'

export const Route = createFileRoute('/_authed/marketplace')({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(convexQuery(api.user.current, {})),
      context.queryClient.ensureQueryData(convexQuery(api.marketplace.gallery, {})),
      context.queryClient.ensureQueryData(
        convexQuery(api.marketplace.myAgents, {}),
      ),
    ])
  },
  component: MarketplaceRoute,
})

function MarketplaceRoute() {
  const navigate = useNavigate()
  const { data: galleryAgents } = useSuspenseQuery(
    convexQuery(api.marketplace.gallery, {}),
  )
  const { data: myAgents } = useSuspenseQuery(
    convexQuery(api.marketplace.myAgents, {}),
  )
  const [isCreating, setIsCreating] = useState(false)
  const builtinAgents = getBuiltinMarketplaceEntries()
  const publishedCommunityAgents = galleryAgents.filter(
    (agent) => agent.publicStatus === 'published',
  )

  async function handleCreateDraft() {
    setIsCreating(true)

    try {
      const draft = await createDefaultMarketplaceDraft()
      await navigate({
        to: '/marketplace/drafts/$agentId',
        params: { agentId: draft._id },
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Marketplace
          </p>
          <h1 className="mt-1 text-3xl font-black uppercase">
            Build And Share Agents
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            Browse verified BuddyPie agents, clone community agents into your
            own drafts, and compose production-ready OpenCode agents from the
            curated modules BuddyPie already understands.
          </p>
        </div>

        <Button
          onClick={() => {
            void handleCreateDraft()
          }}
          disabled={isCreating}
          className="border-2 border-foreground bg-foreground text-sm font-black uppercase tracking-wider text-background shadow-[3px_3px_0_var(--accent)] transition-all hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
        >
          {isCreating ? 'Creating...' : 'New draft →'}
        </Button>
      </section>

      <MarketplaceSection
        title="Verified BuddyPie Agents"
        description="Code-owned built-ins. These are the same verified workflows available on the dashboard."
        items={builtinAgents.map((agent) => ({
          id: agent.slug,
          href: `/marketplace/${agent.slug}`,
          name: agent.name,
          summary: agent.shortDescription,
          badges: agent.tags,
        }))}
      />

      <MarketplaceSection
        title="Community Agents"
        description="Approved public agents published from Marketplace drafts."
        items={publishedCommunityAgents.map((agent) => ({
          id: String(agent._id),
          href: `/marketplace/${agent.slug}`,
          name: agent.name,
          summary: agent.shortDescription,
          badges: [...agent.tags, agent.reviewStatus, agent.publicStatus],
        }))}
        emptyLabel="No community agents are published yet."
      />

      <MarketplaceSection
        title="My Agents"
        description="Your drafts and published community agents."
        items={myAgents.map((agent) => ({
          id: String(agent._id),
          href: `/marketplace/drafts/${agent._id}`,
          name: agent.name,
          summary: agent.shortDescription,
          badges: [agent.reviewStatus, agent.publicStatus, ...agent.tags],
        }))}
        emptyLabel="You do not have any Marketplace drafts yet."
      />
    </main>
  )
}

function MarketplaceSection(props: {
  title: string
  description: string
  items: Array<{
    id: string
    href: string
    name: string
    summary: string
    badges: Array<string>
  }>
  emptyLabel?: string
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-black uppercase">{props.title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {props.description}
        </p>
      </div>

      {props.items.length === 0 ? (
        <div className="border-2 border-dashed border-foreground bg-muted p-8 text-sm font-bold text-muted-foreground">
          {props.emptyLabel ?? 'Nothing here yet.'}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {props.items.map((item) => (
            <Card
              key={item.id}
              className="border-2 border-foreground shadow-[4px_4px_0_var(--foreground)]"
            >
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase">
                  {item.name}
                </CardTitle>
                <p className="text-sm text-muted-foreground">{item.summary}</p>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {item.badges.map((badge) => (
                    <span
                      key={badge}
                      className="border-2 border-foreground bg-muted px-2 py-1 text-[10px] font-black uppercase tracking-widest"
                    >
                      {badge}
                    </span>
                  ))}
                </div>

                <Button
                  asChild
                  variant="outline"
                  className="border-2 border-foreground text-xs font-bold uppercase shadow-[2px_2px_0_var(--foreground)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                >
                  <a href={item.href}>Open</a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
