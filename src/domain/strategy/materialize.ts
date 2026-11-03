import { CT, ctVal, person } from '../mfEngine.ts'
import type { PlannedCase, ValueBinding } from './types.ts'

const GENERATORS = new Set(CT as string[])

export function bindingTargets(cases: PlannedCase[]) {
  const targets: { ownerId: string; label: string; value: string }[] = []
  const seen = new Set<string>()
  for (const item of cases) {
    if (!item.bindable) continue
    for (const input of item.inputs) {
      if (input.bind === false || !input.value || input.value === 'indiferente') continue
      const key = `${input.key}|${input.value}`
      if (seen.has(key)) continue
      seen.add(key)
      targets.push({ ownerId: input.key, label: input.label, value: input.value })
    }
  }
  return targets
}

export function materialize(cases: PlannedCase[], bindings: ValueBinding[], random: () => number): PlannedCase[] {
  return cases.map((item) => {
    if (!item.bindable) return item
    const relevant = item.inputs.filter((input) => input.bind !== false && input.value && input.value !== 'indiferente')
    if (!relevant.length) {
      return { ...item, concrete: 'pendente' as const, note: 'A massa concreta ainda não foi configurada.' }
    }
    const linked = relevant.map((input) => ({
      input,
      binding: bindings.find((binding) => binding.ownerId === input.key && binding.value === input.value && binding.generator && GENERATORS.has(binding.generator)),
    }))
    if (linked.some((entry) => !entry.binding)) {
      return { ...item, concrete: 'pendente' as const, note: 'A massa concreta ainda não foi configurada.' }
    }
    const profile = person(random)
    const generated = linked.map((entry) => {
      const binding = entry.binding as ValueBinding
      const produced = ctVal(binding.generator, binding.rule, random, profile) as { t: string }
      return {
        key: `valor_${entry.input.key}`,
        label: binding.field.trim() || binding.generator,
        value: produced.t,
      }
    })
    return {
      ...item,
      inputs: [...item.inputs, ...generated],
      concrete: 'gerado' as const,
      note: '',
    }
  })
}
