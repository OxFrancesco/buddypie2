import { defineCatalog } from '@json-render/core'
import type { Spec } from '@json-render/core'
import { JSONUIProvider, Renderer, defineRegistry } from '@json-render/react'
import { schema } from '@json-render/react/schema'
import type { SandboxArtifactManifestV1 } from '~/lib/artifacts'
import { shadcnComponents } from '@json-render/shadcn'
import { shadcnComponentDefinitions } from '@json-render/shadcn/catalog'

const artifactCatalog = defineCatalog(schema, {
  components: {
    ...shadcnComponentDefinitions,
  },
  actions: {},
})

const { registry } = defineRegistry(artifactCatalog, {
  components: {
    ...shadcnComponents,
  },
})

export function SandboxArtifactRenderer(props: {
  manifest: SandboxArtifactManifestV1
}) {
  return (
    <JSONUIProvider
      registry={registry}
      initialState={((props.manifest.spec as unknown) as Spec).state ?? {}}
    >
      <Renderer
        spec={(props.manifest.spec as unknown) as Spec}
        registry={registry}
      />
    </JSONUIProvider>
  )
}
