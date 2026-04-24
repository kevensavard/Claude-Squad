import { SupabaseStep } from './components/steps/SupabaseStep'
import { MigrationsStep } from './components/steps/MigrationsStep'
import { GithubStep } from './components/steps/GithubStep'
import { AnthropicStep } from './components/steps/AnthropicStep'
import { PartykitStep } from './components/steps/PartykitStep'

export const metadata = { title: 'Setup — Squad' }

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900">Squad Setup</h1>
      <p className="mt-2 text-gray-600">
        Verify each service connection before creating your first session. Click{' '}
        <strong>Verify</strong> on each step.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        <SupabaseStep />
        <MigrationsStep />
        <GithubStep />
        <AnthropicStep />
        <PartykitStep />
      </div>
      <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-600">All steps passing?</p>
        <a
          href="/sessions/new"
          className="mt-3 inline-block rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Create your first session →
        </a>
      </div>
    </main>
  )
}
