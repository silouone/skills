import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import {
  appendRun,
  buildRun,
  commandKind,
  cwdOf,
  headline,
  historyTable,
  isTotalDrop,
  outputOf,
  parseOutput,
  relativeTime,
  sparkline,
  statusLine,
  summaryMarkdown,
  toastsFor,
  truncate,
} from './parsers'

const PANE = 'tests'
const runsAtom = atom({ plugin: 'test-pulse', key: 'runs' } as const, [])
const autoOpenedAtom = atom({ plugin: 'test-pulse', key: 'autoOpened' } as const, false)
const closedByPersonAtom = atom({ plugin: 'test-pulse', key: 'closedByPerson' } as const, false)

export const register: Register = on => {
  // Whether the terminal docks panes, learned from the prompt hint's render
  // (tool.call carries no viewport). A module variable: a render hook may not
  // write $.state, and a reload re-learns it on the next draw.
  let isFullscreen: boolean | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tests',
      description: 'Test status: last run, newly failing, skip-count warnings',
      argumentHint: '[history]',
    })
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    if (e.surface === 'terminal' && e.viewport?.isFullscreen !== undefined) isFullscreen = e.viewport.isFullscreen
    return next(e)
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (e.tool !== 'Bash') return ran
    const kind = commandKind(e.command)
    if (kind === null) return ran
    const parsed = parseOutput(outputOf(ran))
    if (parsed === null || (kind === 'script' && parsed.runner !== 'pytest')) return ran

    const { run, prev } = buildRun(await read($, runsAtom), parsed, {
      at: await $.clock.now(),
      command: e.command,
      cwd: cwdOf(e.command, await $.session.cwd()),
      ...(e.agentId !== undefined && { agentId: e.agentId }),
    })
    await update($, runsAtom, runs => appendRun(runs, run))

    // Headless (-p, SDK): record only.
    if ((await $.session.surfaces()).length === 0) return ran

    $.ui.status(statusLine(run))
    for (const text of toastsFor(prev, run)) $.ui.toast(text, { timeoutMs: 6000 })

    if (run.fail > 0 && isFullscreen === true && !(await read($, autoOpenedAtom)) && !(await read($, closedByPersonAtom))) {
      await update($, autoOpenedAtom, () => true)
      void $.ui.open({ id: PANE, title: 'Tests' })
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await update($, closedByPersonAtom, () => true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'tests' }, async ($, e) => {
    const runs = await read($, runsAtom)
    if (e.args.trim() === 'history') return { text: historyTable(runs) }
    if ((await $.session.surfaces()).length === 0) return { text: summaryMarkdown(runs, await $.clock.now()) }
    await $.ui.open({ id: PANE, title: 'Tests' })
    return { text: 'Tests pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const runs = await read($, runsAtom)
    const width = e.props.bodyColumns
    const last = runs[runs.length - 1]

    if (last === undefined) {
      return (
        <Box flexDirection="column">
          <Text dimColor>No test runs yet. Run your test command (bun test, pytest, ...).</Text>
        </Box>
      )
    }

    const now = await $.clock.now()
    const isRed = last.fail > 0
    const agent = last.agentId !== undefined ? ' (agent)' : ''
    const fit = (text: string) => truncate(text, width)

    return (
      <Box flexDirection="column">
        <Text key="headline" bold color={isRed ? 'error' : 'success'}>
          {fit(headline(last))}
        </Text>
        <Text key="meta" dimColor>
          {fit(`${last.runner}${agent} · ${relativeTime(last.at, now)} · ${last.command}`)}
        </Text>
        {last.skipDelta > 0 && (
          <Text key="skip-warn" bold color="warning">
            {fit(`skips +${last.skipDelta} ⚠ (possible test weakening)${agent}`)}
          </Text>
        )}
        {isTotalDrop(last) && (
          <Text key="total-warn" bold color="warning">
            {fit(`tests −${-last.totalDelta} ⚠${agent}`)}
          </Text>
        )}
        {last.newlyFailing.length > 0 && <Text color="error">newly failing</Text>}
        {last.newlyFailing.map(name => (
          <Text color="error">{fit(`  ${name}`)}</Text>
        ))}
        {last.newlyFixed.length > 0 && <Text color="success">newly fixed</Text>}
        {last.newlyFixed.map(name => (
          <Text color="success">{fit(`  ${name}`)}</Text>
        ))}
        <Text key="trend" dimColor>
          {fit(`trend ${sparkline(runs)}`)}
        </Text>
        {last.failing.length > 0 && <Text bold>failing</Text>}
        {last.failing.map(name => (
          <Text>{fit(`  ${name}`)}</Text>
        ))}
        <Box flexDirection="row" gap={1}>
          {last.failing.length > 0 && (
            <Button key="copy" onPress={press => void $.ui.copy({ text: last.failing.join('\n'), surface: press.surface })}>
              copy failing
            </Button>
          )}
          <Button
            key="clear"
            onPress={() => {
              $.ui.status(undefined)
              void update($, runsAtom, () => [])
            }}
          >
            clear
          </Button>
        </Box>
      </Box>
    )
  })
}
