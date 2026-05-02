import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'

type TemplateRow = {
  id: number
  name: string
  course_title_default: string
  created_at: string
  assignments: unknown[]
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('email, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'instructor') {
    redirect('/courses')
  }

  const { data: templates } = await supabase
    .from('course_templates')
    .select('id, name, course_title_default, created_at, assignments')
    .order('name', { ascending: true })

  const rows = (templates ?? []) as TemplateRow[]

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">
              <Link
                href="/courses"
                style={{
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                ← Courses
              </Link>
            </p>
            <h1 className="gl-h1" style={{ marginTop: 4 }}>
              Templates
            </h1>
            <p
              style={{
                fontSize: 13,
                color: 'var(--gl-mute)',
                margin: '6px 0 0',
                lineHeight: 1.5,
              }}
            >
              Reusable course skeletons. Save a template from any course's
              settings page.
            </p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="gl-empty">
            No templates yet. Visit a course's settings page to save one.
          </div>
        ) : (
          rows.map((t) => (
            <Link
              key={t.id}
              href={`/templates/${t.id}`}
              className="gl-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                padding: '14px 0',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 16 }}>{t.name}</p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 12,
                    color: 'var(--gl-mute)',
                  }}
                >
                  {Array.isArray(t.assignments) ? t.assignments.length : 0}{' '}
                  assignments · saved {formatDate(t.created_at)}
                </p>
              </div>
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--gl-mute)',
                }}
              >
                Use →
              </span>
            </Link>
          ))
        )}

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
