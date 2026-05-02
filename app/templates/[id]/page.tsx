import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import GlobalFooter from '@/app/_components/GlobalFooter'
import TemplateClient from './TemplateClient'

type TemplateAssignment = {
  title: string
  description: string | null
  stages: { name: string }[]
}

type ReadingRef = {
  filename: string
}

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: idParam } = await params
  const templateId = parseInt(idParam, 10)
  if (!Number.isFinite(templateId)) notFound()

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

  const { data: template } = await supabase
    .from('course_templates')
    .select('id, name, course_title_default, assignments, previous_readings, created_at')
    .eq('id', templateId)
    .single()

  if (!template) notFound()

  const assignments = (template.assignments ?? []) as TemplateAssignment[]
  const previousReadings = (template.previous_readings ?? []) as ReadingRef[]

  return (
    <main className="gl-page">
      <div className="gl-shell">
        <div className="gl-page-header">
          <div>
            <p className="gl-eyebrow">
              <Link
                href="/templates"
                style={{
                  color: 'var(--gl-mute)',
                  textDecoration: 'none',
                  borderBottom: '1px solid var(--gl-hairline)',
                  paddingBottom: 1,
                }}
              >
                ← Templates
              </Link>
            </p>
            <h1 className="gl-h1" style={{ marginTop: 4 }}>
              {template.name}
            </h1>
          </div>
        </div>

        <TemplateClient
          templateId={template.id}
          courseTitleDefault={template.course_title_default}
        />

        <div className="gl-section" style={{ marginTop: 32 }}>
          <h2 className="gl-h2">Assignments</h2>
          {assignments.length === 0 ? (
            <div className="gl-empty">No assignments in this template.</div>
          ) : (
            assignments.map((a, i) => (
              <div
                key={i}
                style={{
                  padding: '14px 0',
                  borderBottom: '0.5px solid var(--gl-hairline)',
                }}
              >
                <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
                  {a.title}
                </p>
                {a.description && (
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: 13,
                      color: 'var(--gl-mute)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {a.description}
                  </p>
                )}
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: 12,
                    color: 'var(--gl-mute)',
                  }}
                >
                  Stages: {a.stages.map((s) => s.name).join(', ')}
                </p>
              </div>
            ))
          )}
        </div>

        {previousReadings.length > 0 && (
          <div className="gl-section">
            <h2 className="gl-h2">Previous readings</h2>
            <p
              style={{
                fontSize: 13,
                color: 'var(--gl-mute)',
                margin: '0 0 12px',
                lineHeight: 1.5,
              }}
            >
              Reference list of reading filenames from the source course. Not
              copied automatically — you'll re-upload PDFs in the new course.
            </p>
            {previousReadings.map((r, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  padding: '6px 0',
                  fontSize: 13,
                  color: 'var(--gl-mute)',
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  borderBottom: '0.5px solid var(--gl-hairline)',
                }}
              >
                {r.filename}
              </p>
            ))}
          </div>
        )}

        <GlobalFooter signedInAs={profile?.email ?? null} />
      </div>
    </main>
  )
}
