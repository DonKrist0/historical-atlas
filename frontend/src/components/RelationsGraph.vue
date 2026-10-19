<script setup lang="ts">
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
  import { groups, type Person } from '../data/people'
  import { scopeRelations } from '../utils/countries'
  import { buildRelationsGraph, firstRegionRoot, graphNameLines, NODE_HEIGHT, NODE_WIDTH } from '../utils/graph'
  import { isBundledEdge } from '../utils/graphRules'
  import { relationPeriod } from '../utils/relationPeriod'

  const props = defineProps<{ people: Person[], collection?: Person[], perspective?: string, genealogy?: boolean, canEdit?: boolean }>()
  const emit = defineEmits<{ edit: [person: Person] }>()
  const region = ref('*')
  const rootId = ref('')
  const selectedId = ref('')
  const hoveredId = ref('')
  const search = ref('')
  const showLabels = ref(true)
  const includeContext = ref(true)
  const grouped = ref(!props.genealogy)
  const settingsOpen = ref(false)
  const helpOpen = ref(false)
  const canvas = ref<HTMLDivElement>()
  const viewport = ref({ width: 1000, height: 620 })
  const camera = ref({ x: 30, y: 30, scale: 1 })
  const dragging = ref(false)
  let drag: { x: number, y: number, cameraX: number, cameraY: number } | undefined
  let observer: ResizeObserver | undefined

  const regions = computed(() => [...new Set(props.people.map(person => person.region?.trim()).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, 'ru')))
  const regionPeople = computed(() => props.people.filter(person => region.value === '*' || (person.region?.trim() ?? '') === region.value))
  const root = computed(() => regionPeople.value.find(person => person.id === rootId.value) ?? firstRegionRoot(props.people, region.value))
  const graph = computed(() => buildRelationsGraph(scopeRelations(props.people, props.collection ?? props.people), root.value?.id, { includeContext: !props.genealogy && includeContext.value, grouped: grouped.value, sameCountryPerspective: props.perspective !== undefined }))
  const visibleEdges = computed(() => graph.value.edges.filter(edge => !edge.hidden))
  const selected = computed(() => props.people.find(person => person.id === selectedId.value))
  const activeId = computed(() => hoveredId.value || selectedId.value)
  const neighbors = computed(() => {
    const ids = new Set([activeId.value])
    for (const edge of graph.value.edges) {
      if (edge.members.includes(activeId.value)) {
        for (const id of edge.members) ids.add(id)
      }
    }
    return ids
  })
  const selectedRelations = computed(() => graph.value.edges.flatMap(edge => edge.records.map(record => ({ ...record, kind: edge.kind }))).filter(record => record.source === selectedId.value || record.target === selectedId.value))
  const selectedContext = computed(() => visibleEdges.value.filter(edge => edge.context && edge.members.includes(selectedId.value)))
  const matches = computed(() => {
    const query = search.value.trim().toLocaleLowerCase('ru')
    return query ? props.people.filter(person => person.name.toLocaleLowerCase('ru').includes(query)) : []
  })
  const linkedCount = computed(() => new Set(graph.value.edges.flatMap(edge => [edge.source, edge.target])).size)
  const colors = { family: '#b5a0d4', close: '#83b69c', service: '#d7b66e', contemporary: '#7bafcf', clergy: '#d29c87', other: '#86abc9', context: '#a6ad89' }

  function personName (id: string) {
    return props.people.find(person => person.id === id)?.name ?? id
  }

  function groupColor (person: Person) {
    return groups.find(group => group.id === person.group)?.color ?? '#c6a568'
  }

  function fit () {
    const scale = Math.min(1.1, (viewport.value.width - 48) / graph.value.width, (viewport.value.height - 48) / graph.value.height)
    camera.value = { scale, x: (viewport.value.width - graph.value.width * scale) / 2, y: (viewport.value.height - graph.value.height * scale) / 2 }
  }

  function focusPerson (id: string) {
    selectedId.value = id
    const node = graph.value.nodes.find(node => node.person.id === id)
    if (!node) return
    const scale = Math.max(0.7, camera.value.scale)
    const compact = window.matchMedia('(max-width: 650px)').matches
    const availableWidth = compact ? viewport.value.width : Math.max(240, viewport.value.width - 324)
    const availableHeight = compact ? viewport.value.height * 0.58 - 32 : viewport.value.height
    camera.value = { scale, x: availableWidth / 2 - (node.x + NODE_WIDTH / 2) * scale, y: availableHeight / 2 - (node.y + NODE_HEIGHT / 2) * scale }
    search.value = ''
  }

  function initialView () {
    fit()
    if (viewport.value.width < 600 && graph.value.root) focusPerson(selectedId.value || graph.value.root.id)
  }

  function zoomAt (factor: number, x = viewport.value.width / 2, y = viewport.value.height / 2) {
    const current = camera.value
    const scale = Math.max(0.05, Math.min(2.5, current.scale * factor))
    camera.value = { scale, x: x - (x - current.x) * scale / current.scale, y: y - (y - current.y) * scale / current.scale }
  }

  function wheel (event: WheelEvent) {
    const bounds = canvas.value!.getBoundingClientRect()
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - bounds.left, event.clientY - bounds.top)
  }

  function startPan (event: PointerEvent) {
    if (event.button !== 0) return
    event.preventDefault()
    const surface = event.currentTarget as SVGSVGElement
    surface.focus({ preventScroll: true })
    drag = { x: event.clientX, y: event.clientY, cameraX: camera.value.x, cameraY: camera.value.y }
    dragging.value = true
    surface.setPointerCapture(event.pointerId)
  }

  function pan (event: PointerEvent) {
    if (!drag) return
    camera.value = { ...camera.value, x: drag.cameraX + event.clientX - drag.x, y: drag.cameraY + event.clientY - drag.y }
  }

  function stopPan () {
    drag = undefined
    dragging.value = false
  }

  function keyboardPan (event: KeyboardEvent) {
    const offsets: Record<string, [number, number]> = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }
    const offset = offsets[event.key]
    if (!offset) return
    event.preventDefault()
    camera.value = { ...camera.value, x: camera.value.x + offset[0], y: camera.value.y + offset[1] }
  }

  watch(regions, values => {
    if (region.value !== '*' && region.value !== '' && !values.includes(region.value)) region.value = '*'
    if (!props.people.some(person => person.id === rootId.value)) rootId.value = ''
  })
  watch(region, () => {
    rootId.value = ''
  })
  watch(graph, () => {
    if (selectedId.value && !props.people.some(person => person.id === selectedId.value)) selectedId.value = ''
    initialView()
  })
  onMounted(() => {
    observer = new ResizeObserver(entries => {
      const rect = entries[0]!.contentRect
      viewport.value = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) }
      initialView()
    })
    observer.observe(canvas.value!)
  })
  onUnmounted(() => observer?.disconnect())
</script>

<template>
  <section :aria-label="genealogy ? 'Генеалогическое дерево' : 'Граф связей исторического атласа'" class="relations-page">
    <div class="graph-heading">
      <div class="graph-title"><h1 v-if="genealogy">Генеалогия<em>.</em></h1><h1 v-else>Карта <em>связей.</em></h1><span>{{ people.length }} персон · {{ graph.explicitCount }} связей</span></div>
      <div class="graph-search"><label><span class="sr-only">Найти на карте</span><input v-model="search" placeholder="Имя персоны…" type="search"></label><div v-if="search.trim()" class="graph-search-results"><button v-for="person in matches.slice(0, 8)" :key="person.id" @click="focusPerson(person.id)">{{ person.name }}</button><span v-if="matches.length === 0">Никого не найдено</span><small v-if="matches.length > 8">Уточните имя: найдено {{ matches.length }}</small></div></div>
      <div class="graph-heading-actions"><button aria-controls="graph-settings" :aria-expanded="settingsOpen" aria-label="Настройки карты" @click="settingsOpen = !settingsOpen"><i class="mdi mdi-tune-variant" /><span>Настройки</span></button><button aria-controls="graph-help" :aria-expanded="helpOpen" aria-label="Как читать карту" @click="helpOpen = !helpOpen"><i class="mdi mdi-help-circle-outline" /><span>Как читать</span></button></div>
    </div>

    <slot name="filters" />

    <div v-show="settingsOpen" id="graph-settings" class="graph-settings">
      <div class="graph-toolbar">
        <label v-if="!genealogy">Регион точки отсчёта<select v-model="region"><option value="*">Все регионы</option><option v-for="value in regions" :key="value" :value="value">{{ value }}</option><option value="">Без региона</option></select></label>
        <label>Точка отсчёта<select v-model="rootId"><option value="">{{ firstRegionRoot(people, region)?.name ?? 'В регионе пока нет персон' }} · автоматически</option><option v-for="person in regionPeople" :key="person.id" :value="person.id">{{ person.name }}</option></select></label>
      </div>

      <div v-if="!genealogy" class="graph-options"><label><input v-model="includeContext" type="checkbox">Связи по времени <span>+{{ graph.contextCount }}</span></label><small>Современники и духовенство соединяются с правителями по пересечению лет жизни, независимо от региона. Для сподвижников без выбранного правителя учитывается и регион. Это совпадения по времени, а не подтверждение личного знакомства.</small></div>
      <div class="graph-options"><label><input v-model="grouped" type="checkbox">Группировать по роду и роли</label><small>Указанный род или династия определяет колонку. Если род не заполнен, используется группа персоны. Супруги остаются рядом в колонке точки отсчёта или одного из указанных родов; поколения идут сверху вниз.</small></div>
    </div>

    <p class="graph-context"><i aria-hidden="true" class="mdi mdi-crown-outline" /><span v-if="root" :title="root.name">Отсчёт: <strong>{{ root.name }}</strong></span><span v-else>В выбранном регионе нет персон.</span><small>Выберите персону, чтобы увидеть её связи</small></p>
    <p v-if="visibleEdges.length === 0 && people.length > 0" class="graph-notice">{{ genealogy ? 'Для выбранных персон пока нет родственных связей. Их можно добавить в карточке персоны или включить родственников вне рода.' : 'Пока нет введённых связей. Выберите персону на карте, откройте редактирование и добавьте родственников или соратников.' }}</p>
    <p v-if="graph.missingLinks > 0" class="graph-notice" role="alert">Связи с отсутствующими персонами: {{ graph.missingLinks }}. Проверьте исходные записи.</p>

    <details v-if="graph.warnings.length > 0" class="graph-notice"><summary>Проверьте семейные записи: {{ graph.warnings.length }}</summary><p v-for="warning in graph.warnings" :key="warning.id">{{ warning.people.map(personName).join(' · ') }}: {{ warning.message }}</p></details>

    <div class="graph-workspace" :class="{ 'has-selection': selected }">
      <div ref="canvas" class="graph-canvas" :class="{ dragging }">
        <svg
          aria-label="Диаграмма связей. Стрелками клавиатуры можно перемещать карту."
          role="group"
          tabindex="0"
          :viewBox="`0 0 ${viewport.width} ${viewport.height}`"
          @keydown="keyboardPan"
          @lostpointercapture="stopPan"
          @pointercancel="stopPan"
          @pointerdown="startPan"
          @pointermove="pan"
          @pointerup="stopPan"
          @wheel.prevent="wheel"
        >
          <defs><marker
            v-for="(color, kind) in colors"
            :id="`graph-arrow-${kind}`"
            :key="kind"
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="9"
            refY="5"
            viewBox="0 0 10 10"
          ><path d="M 0 0 L 10 5 L 0 10 z" :fill="color" /></marker></defs>

          <g :transform="`translate(${camera.x} ${camera.y}) scale(${camera.scale})`">
            <g v-for="section in graph.sections" :key="section.id" class="graph-section"><rect
                                                                                           :height="section.height"
                                                                                           rx="18"
                                                                                           :width="section.width"
                                                                                           x="32"
                                                                                           :y="section.y"
                                                                                         />

              <text x="58" :y="section.y + 30">{{ section.title }}</text><text v-if="section.entourageX !== undefined" :x="section.entourageX" :y="section.y + 62">ОКРУЖЕНИЕ И СОВРЕМЕННИКИ</text></g>

            <g
              v-for="cluster in graph.clusters"
              :key="cluster.id"
              class="graph-cluster"
              :class="{ faded: activeId && !cluster.members.includes(activeId) }"
              :style="{ color: cluster.color }"
            >
              <rect
                :height="cluster.height"
                rx="14"
                :width="cluster.width"
                :x="cluster.x"
                :y="cluster.y"
              />

              <path :d="`M ${cluster.x + 18} ${cluster.y + 1} H ${cluster.x + cluster.width - 18}`" />
              <text lengthAdjust="spacingAndGlyphs" :textLength="cluster.title.length * 8 > cluster.width - 40 ? cluster.width - 40 : undefined" :x="cluster.x + 20" :y="cluster.y + 24">{{ cluster.title }}</text>
              <text class="graph-cluster-meta" :x="cluster.x + 20" :y="cluster.y + 46">{{ cluster.subtitle }}</text>
              <title>{{ cluster.title }}. {{ cluster.subtitle }}</title>
            </g>

            <g
              v-for="segment in graph.serviceBundles.segments"
              :key="segment.id"
              class="graph-service-segment"
              :class="{ faded: activeId && !segment.members.includes(activeId) }"
              :data-kind="segment.kind"
              :data-links="segment.edgeIds.length"
              :data-source="segment.source"
            >
              <title>{{ personName(segment.source) }} · {{ segment.edgeIds.length > 1 ? `Общая ветка: ${segment.edgeIds.length} связей` : segment.kind === 'service' ? 'Служба правителю' : 'Пересечение лет жизни' }}</title>

              <path
                :d="segment.path"
                fill="none"
                :marker-end="segment.arrow && segment.kind === 'service' ? 'url(#graph-arrow-service)' : undefined"
                :stroke="colors[segment.kind]"
                :stroke-dasharray="segment.kind === 'service' ? undefined : '5 5'"
                stroke-linecap="round"
                stroke-linejoin="round"
                :stroke-width="segment.edgeIds.length > 1 ? 3 : 2.4"
              />
            </g>

            <circle
              v-for="junction in graph.serviceBundles.junctions"
              :key="junction.id"
              class="graph-service-junction"
              :class="{ faded: activeId && !junction.members.includes(activeId) }"
              :cx="junction.x"
              :cy="junction.y"
              :fill="colors[junction.kind]"
              r="3.5"
            />

            <g
              v-for="edge in visibleEdges"
              :key="edge.id"
              class="graph-edge"
              :class="{ faded: activeId && !edge.members.includes(activeId), conflict: edge.conflict }"
              :data-shape="edge.shape"
              :style="{ color: edge.conflict ? '#d99b85' : colors[edge.kind] }"
            >
              <title>{{ edge.context ? `${personName(edge.source)} и ${personName(edge.target)}: ${edge.context.region ? `${edge.context.region}, ` : ''}пересечение лет жизни ${edge.context.start}–${edge.context.end}. Совпадение по времени, не подтверждение знакомства или службы.` : edge.records.map(record => `${personName(record.source)} — ${record.role} → ${personName(record.target)} · ${relationPeriod(record)}`).join('; ' ) }}{{ edge.conflict ? ' · Противоречие поколений' : '' }}</title>

              <path
                v-if="!isBundledEdge(edge)"
                :d="edge.path"
                fill="none"
                :marker-end="['close', 'other', 'service'].includes(edge.kind) ? `url(#graph-arrow-${edge.kind})` : undefined"
                stroke="currentColor"
                :stroke-dasharray="edge.conflict ? '4 4' : edge.kind === 'context' ? '2 6' : ['ancestor', 'extended', 'cousin', 'sibling'].includes(edge.shape) ? '5 4' : edge.kind === 'close' ? '7 5' : undefined"
                stroke-width="1.8"
              />

              <line
                v-if="showLabels && (edge.labelY !== edge.anchorY || edge.labelX !== edge.anchorX)"
                stroke="currentColor"
                stroke-dasharray="2 3"
                stroke-opacity=".45"
                :x1="edge.anchorX"
                :x2="edge.labelX"
                :y1="edge.anchorY"
                :y2="edge.labelY"
              />

              <g v-if="showLabels" class="graph-edge-label" :transform="`translate(${edge.labelX} ${edge.labelY})`"><rect
                                                                                                                      height="24"
                                                                                                                      rx="12"
                                                                                                                      :width="Math.min(178, edge.role.length * 7 + 22)"
                                                                                                                      :x="-Math.min(178, edge.role.length * 7 + 22) / 2"
                                                                                                                      y="-12"
                                                                                                                    />

                <text dominant-baseline="central" text-anchor="middle">{{ edge.role.length > 22 ? `${edge.role.slice(0, 21)}…` : edge.role }}</text></g>
            </g>

            <g
              v-for="node in graph.nodes"
              :key="node.person.id"
              :aria-label="`${node.person.name}, ${node.person.start}–${node.person.end}. Показать связи`"
              class="graph-node"
              :class="{ root: node.person.id === graph.root?.id, selected: selectedId === node.person.id, faded: activeId && !neighbors.has(node.person.id), match: search.trim() && matches.some(person => person.id === node.person.id) }"
              role="button"
              :style="{ '--node-color': groupColor(node.person) }"
              tabindex="0"
              :transform="`translate(${node.x} ${node.y})`"
              @blur="hoveredId = ''"
              @click="selectedId = node.person.id"
              @focus="hoveredId = node.person.id"
              @keydown.enter.stop.prevent="selectedId = node.person.id"
              @keydown.space.stop.prevent="selectedId = node.person.id"
              @mouseenter="hoveredId = node.person.id"
              @mouseleave="hoveredId = ''"
              @pointerdown.stop
            >
              <title>{{ node.person.name }} · {{ node.person.note }}</title>
              <rect class="graph-node-body" :height="NODE_HEIGHT" rx="10" :width="NODE_WIDTH" />

              <rect
                class="graph-node-stripe"
                :height="NODE_HEIGHT - 28"
                rx="2"
                width="4"
                x="0"
                y="14"
              />

              <text class="graph-node-group" x="17" y="21">{{ node.person.id === graph.root?.id ? '✦ ТОЧКА ОТСЧЁТА' : groups.find(group => group.id === node.person.group)?.label }}</text>
              <text class="graph-node-name" x="17" y="43"><tspan v-for="(line, index) in graphNameLines(node.person.name)" :key="index" :dy="index === 0 ? 0 : 18" x="17">{{ line }}</tspan></text>
              <text class="graph-node-years" x="17" y="83">{{ node.person.before ? 'до ' : '' }}{{ node.person.start }} — {{ node.person.end }}</text>
            </g>
          </g>
        </svg>

        <div v-if="people.length === 0" class="graph-empty"><i class="mdi mdi-graph-outline" /><strong>{{ genealogy ? 'Здесь появится генеалогическое дерево' : 'Здесь появится карта связей' }}</strong><span>{{ genealogy ? 'Укажите род и родственные связи в карточках персон.' : 'Добавьте персон и укажите связи в их карточках.' }}</span></div>
        <div class="graph-controls"><button aria-label="Уменьшить граф" @click="zoomAt(1 / 1.25)">−</button><span>{{ Math.round(camera.scale * 100) }}%</span><button aria-label="Увеличить граф" @click="zoomAt(1.25)">+</button><button aria-label="Показать всю карту" title="Показать всю карту" @click="fit"><i class="mdi mdi-fit-to-screen-outline" /></button><button v-if="root" aria-label="К точке отсчёта" title="К точке отсчёта" @click="focusPerson(root.id)"><i class="mdi mdi-crown-outline" /></button></div>
        <label class="graph-label-toggle"><input v-model="showLabels" type="checkbox">Подписи связей</label>
      </div>

      <aside v-if="selected" aria-label="Подробности выбранной персоны" class="graph-inspector">
        <template v-if="selected">
          <div class="graph-inspector-top"><span class="eyebrow">В ФОКУСЕ</span><button aria-label="Снять выделение" @click="selectedId = ''"><i class="mdi mdi-close" /></button></div>
          <span class="graph-person-group" :style="{ color: groupColor(selected) }">{{ groups.find(group => group.id === selected?.group)?.label }}</span>
          <h2>{{ selected.name }}</h2><span class="graph-person-dates">{{ selected.before ? 'до ' : '' }}{{ selected.start }} — {{ selected.end }}</span>
          <p v-if="selected.note">{{ selected.note }}</p><p v-if="selected.country || selected.region || selected.dynasty" class="graph-person-place">{{ [selected.country, selected.region, selected.dynasty].filter(Boolean).join(' · ') }}</p>
          <button class="graph-edit" @click="emit('edit', selected)"><i aria-hidden="true" :class="canEdit ? 'mdi mdi-pencil-outline' : 'mdi mdi-account-details-outline'" />{{ canEdit ? 'Редактировать персону' : 'Открыть карточку' }}</button>
          <h3>Введённые связи <span>{{ selectedRelations.length }}</span></h3>
          <p v-if="selectedRelations.length === 0">{{ canEdit ? 'Связи пока не указаны. Добавьте их в форме редактирования.' : 'Связи пока не указаны.' }}</p>

          <button
            v-for="edge in selectedRelations"
            :key="edge.id"
            class="graph-relation-item"
            :style="{ '--edge-color': colors[edge.kind] }"
            @click="focusPerson(edge.source === selected.id ? edge.target : edge.source)"
          ><span>{{ personName(edge.source) }}</span><strong>{{ edge.role }} →</strong><span>{{ personName(edge.target) }}</span><small>{{ relationPeriod(edge) }}</small></button>

          <template v-if="selectedContext.length > 0"><h3>Совпадения <span>{{ selectedContext.length }}</span></h3><p>Показано пересечение лет жизни. Личное знакомство и служба требуют отдельного подтверждения.</p>

            <button
              v-for="edge in selectedContext"
              :key="edge.id"
              class="graph-relation-item"
              :style="{ '--edge-color': colors[edge.kind] }"
              @click="focusPerson(edge.source === selected.id ? edge.target : edge.source)"
            ><span>{{ personName(edge.source === selected.id ? edge.target : edge.source) }}</span><strong>{{ edge.context?.region ? `${edge.context.region} · ` : '' }}{{ edge.context?.start }}–{{ edge.context?.end }}{{ edge.context?.approximate ? ' · даты приблизительны' : '' }}</strong></button></template>
        </template>

      </aside>

      <aside v-if="helpOpen" id="graph-help" aria-label="Как читать карту" class="graph-help"><div class="graph-inspector-top"><span class="eyebrow">КАК ЧИТАТЬ КАРТУ</span><button aria-label="Закрыть подсказку" @click="helpOpen = false"><i class="mdi mdi-close" /></button></div><div class="graph-reading"><span>Как читать карту</span><p>Родители расположены выше детей. Супругов соединяет горизонтальная линия; дети пары отходят от её середины. У каждой родительской семьи своя дорожка. Дуга над пересечением означает проход без соединения.</p><p v-if="!genealogy">Золотая сплошная стрелка ведёт от правителя к его сподвижнику; подпись показывает роль и известные годы службы. Для каждого правителя — отдельная линия.</p><p v-if="!genealogy">Синие и терракотовые ветки — современники и духовенство с пересекающимися годами жизни. Общий ствол объединяет совпадения одного вида.</p><p>Пунктиром показано непрямое родство без добавления неизвестных предков. Остальные стрелки читаются: «кто — роль → кому». Точные записи доступны в карточке.</p></div></aside>

    </div>

    <div v-if="genealogy" class="graph-footer"><div><span><i style="background: #b5a0d4" />Родители, дети и супруги</span><span><i style="border-top: 2px dashed #b5a0d4" />Непрямое родство</span><span><i style="background: #86abc9" />Родство через брак →</span></div></div>
    <div v-else class="graph-footer"><div><span><i style="background: #b5a0d4" />Родственные</span><span><i style="background: #d7b66e" />Служба правителю →</span><span><i style="border-top: 2px dashed #83b69c" />Друзья и соратники</span><span><i style="border-top: 2px dashed #7bafcf" />Современники</span><span><i style="border-top: 2px dashed #d29c87" />Духовенство</span><span><i style="background: #86abc9" />Другие роли</span><span><i style="border-top: 2px dotted #a6ad89" />Совпадение региона и лет</span></div><span>{{ linkedCount }} персон со связями · {{ people.length - linkedCount }} без связей</span><span>Колесо — масштаб · перетаскивание — перемещение</span></div>
  </section>
</template>

<style scoped>
  .relations-page { display: flex; flex: 1; flex-direction: column; min-height: 0; gap: 10px; }
  .graph-heading { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
  .graph-heading h1 { font: 42px/1.2 Georgia, serif; letter-spacing: -1.3px; margin: 12px 0; color: #eee8d9; }
  .graph-heading h1 em { color: #cbb17b; }
  .graph-heading p, .graph-context { color: #8f9b87; font-size: 12px; line-height: 1.7; }
  .graph-totals { display: flex; gap: 28px; align-items: center; }
  .graph-totals strong { font: 36px Georgia, serif; color: #dbc38f; }
  .graph-totals small { display: block; font: 10px Roboto, sans-serif; color: #8f9b87; margin-top: 8px; }
  .graph-totals > span { height: 42px; width: 1px; background: #39412f; }
  .graph-toolbar { display: flex; gap: 16px; padding: 18px; background: #1c2119; border: 1px solid #394330; border-radius: 8px; }
  .graph-toolbar label { display: grid; gap: 8px; flex: 1; color: #9da88f; font-size: 10px; min-width: 0; }
  .graph-toolbar select, .graph-toolbar input { background: #131910; border: 1px solid #3c4732; border-radius: 4px; color: #dddcca; padding: 10px; font-size: 12px; width: 100%; outline: none; }
  .graph-toolbar :is(select, input):focus { border-color: #b79f6c; }
  .graph-search { flex: 1; position: relative; min-width: 160px; }
  .graph-search-results { position: absolute; top: 100%; width: 100%; z-index: 8; display: grid; border: 1px solid #596047; background: #22291c; box-shadow: 0 12px 30px #0007; }
  .graph-search-results > * { padding: 12px; text-align: left; font-size: 12px; color: #dedfcf; }
  .graph-search-results button:hover { background: #37402a; }
  .graph-context { display: flex; align-items: center; gap: 8px; margin: 14px 0; font-size: 11px; }
  .graph-context .mdi { color: #cbb17b; font-size: 18px; }
  .graph-notice { padding: 12px 16px; border-left: 2px solid #cbb17b; background: #cbb17b0a; color: #c0c5b3; font-size: 12px; margin-bottom: 16px; line-height: 1.6; }
  .graph-options { display: flex; align-items: center; gap: 16px; padding: 12px 0 18px; color: #b3bda1; }
  .graph-options label { display: flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 11px; }
  .graph-options input { accent-color: #cbb17b; }
  .graph-options span { color: #cbb17b; }
  .graph-options small { font-size: 10px; line-height: 1.6; color: #89977a; max-width: 650px; }
  .graph-notice summary { cursor: pointer; }
  @media (max-width: 650px) { .graph-options { align-items: flex-start; flex-direction: column; gap: 8px; }.graph-footer > div { flex-wrap: wrap; } }
  .graph-workspace { display: grid; grid-template-columns: minmax(0, 1fr) 270px; border: 1px solid #3a4430; border-radius: 10px; overflow: hidden; }
  .graph-canvas { position: relative; height: clamp(520px, 70vh, 850px); min-width: 0; background-color: #131a11; background-image: radial-gradient(#63704b3b .8px, transparent .8px); background-size: 22px 22px; }
  .graph-canvas svg { width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
  .graph-canvas.dragging svg { cursor: grabbing; }
  .graph-section > rect { fill: #1c231742; stroke: #3a4730; stroke-dasharray: 4 7; }
  .graph-section > text { fill: #8b9b7d; font: 11px Roboto, sans-serif; letter-spacing: 1px; }
  .graph-cluster { pointer-events: none; transition: opacity .15s; }
  .graph-cluster > rect { fill: currentColor; fill-opacity: .045; stroke: currentColor; stroke-opacity: .23; }
  .graph-cluster > path { stroke: currentColor; stroke-width: 3; stroke-opacity: .65; }
  .graph-cluster > text { fill: currentColor; font: 16px Georgia, serif; }
  .graph-cluster > .graph-cluster-meta { fill: #929f85; font: 10px Roboto, sans-serif; letter-spacing: .4px; }
  .graph-edge { transition: opacity .2s; }
  .graph-edge-label rect { fill: #1b2317; stroke: currentColor; stroke-opacity: .35; }
  .graph-edge-label text { fill: currentColor; font: 10px Roboto, sans-serif; }
  .graph-node { cursor: pointer; outline: none; transition: opacity .2s; }
  .graph-node-body { fill: #242b20; stroke: var(--node-color); stroke-opacity: .5; }
  .graph-node-stripe { fill: var(--node-color); }
  .graph-node.root .graph-node-body { fill: #342f20; stroke: #d0b77e; stroke-width: 2; }
  .graph-node:is(:hover, :focus, .selected, .match) .graph-node-body { stroke: #f3e2b7; stroke-width: 2.5; filter: drop-shadow(0 0 6px #cfb57c44); }
  .graph-node-group { fill: var(--node-color); font: 8px Roboto, sans-serif; letter-spacing: 1px; }
  .graph-node-name { fill: #e8e7db; font: 16px Georgia, serif; }
  .graph-node-years { fill: #a0ac91; font: 10px 'Roboto Mono', monospace; }
  .faded { opacity: .22; }
  .graph-controls { position: absolute; bottom: 18px; left: 18px; display: flex; align-items: center; background: #252d20; border: 1px solid #505b3e; border-radius: 6px; color: #d8d9c3; box-shadow: 0 4px 20px #0003; }
  .graph-controls button { width: 36px; height: 36px; font-size: 20px; }
  .graph-controls span { font: 10px 'Roboto Mono', monospace; min-width: 38px; text-align: center; }
  .graph-label-toggle { position: absolute; top: 16px; right: 16px; padding: 9px 12px; background: #20271ce8; border: 1px solid #3d4932; border-radius: 4px; color: #b6c0a5; font-size: 10px; display: flex; align-items: center; gap: 8px; }
  .graph-label-toggle input { accent-color: #cbb17b; }
  .graph-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: #9ba88b; pointer-events: none; font-size: 12px; }
  .graph-empty .mdi { font-size: 44px; color: #cbb17b; }
  .graph-inspector { padding: 24px 20px; border-left: 1px solid #39432f; background: #1b2118; overflow-y: auto; max-height: clamp(520px, 70vh, 850px); }
  .graph-inspector-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .graph-inspector-top button { color: #9eaa8b; font-size: 19px; }
  .graph-person-group { font-size: 10px; }
  .graph-inspector h2 { font: 27px/1.25 Georgia, serif; color: #e2dfcc; margin: 12px 0; }
  .graph-person-dates { font: 11px 'Roboto Mono', monospace; color: #c5af7d; }
  .graph-inspector p { font-size: 12px; line-height: 1.8; color: #9eaa90; margin-top: 16px; }
  .graph-inspector .graph-person-place { font-size: 10px; color: #7f8e70; }
  .graph-edit { display: flex; gap: 8px; align-items: center; padding: 11px 12px; margin-top: 24px; border: 1px solid #5b6145; border-radius: 4px; color: #d0bd8f; font-size: 11px; text-align: left; }
  .graph-inspector h3 { font-size: 12px; color: #c6cdb8; border-top: 1px solid #35412b; padding-top: 24px; margin-top: 28px; }
  .graph-inspector h3 span { float: right; color: #cbb17b; }
  .graph-relation-item { display: grid; gap: 6px; width: 100%; padding: 14px 0 14px 12px; margin-top: 14px; text-align: left; border-left: 2px solid var(--edge-color); background: #ffffff03; color: #ced4be; font-size: 11px; overflow-wrap: anywhere; }
  .graph-relation-item strong { color: var(--edge-color); font-weight: 400; font-size: 10px; }
  .graph-inspector-symbol { font-size: 42px; color: #cbb17b; }
  .graph-inspector-empty { padding-top: 20px; }
  .graph-reading { margin-top: 34px; border-top: 1px solid #39432f; padding-top: 22px; }
  .graph-reading > span { color: #c2c9b2; font-size: 11px; }
  .graph-reading strong { color: #cbb17b; font-weight: 400; }
  .graph-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px; padding-top: 16px; color: #849274; font-size: 9px; }
  .graph-footer > div { display: flex; flex-wrap: wrap; gap: 16px; }
  .graph-footer span { display: inline-flex; align-items: center; gap: 6px; }
  .graph-footer i { width: 14px; height: 2px; }
  @media (max-width: 1150px) { .graph-workspace { grid-template-columns: minmax(0, 1fr); }.graph-inspector { border-left: 0; border-top: 1px solid #39432f; max-height: 350px; }.graph-inspector-empty { padding-top: 0; }.graph-inspector-empty h2 br { display: none; }.graph-reading { margin-top: 20px; }.graph-heading h1 { font-size: 34px; } }
  @media (max-width: 650px) { .graph-toolbar { flex-direction: column; }.graph-heading { align-items: flex-start; }.graph-totals { gap: 12px; }.graph-totals strong { font-size: 25px; }.graph-heading h1 { font-size: 28px; }.graph-heading p { font-size: 11px; }.graph-canvas { height: 560px; }.graph-context { align-items: flex-start; } }

  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .graph-heading { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 300px) auto; gap: 16px; margin: 0; flex-shrink: 0; }
  .graph-title { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 16px; }
  .graph-title h1 { font-size: 28px; margin: 0; letter-spacing: -.7px; }
  .graph-title > span { color: #89977a; font-size: 11px; white-space: nowrap; }
  .graph-search input { width: 100%; padding: 10px 12px; border: 1px solid #3c4732; border-radius: 6px; background: #1c2119; color: #dddcca; font-size: 12px; outline: none; }
  .graph-search input:focus { border-color: #b79f6c; }
  .graph-heading-actions { display: flex; gap: 8px; }
  .graph-heading-actions button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 38px; padding: 8px 10px; border: 1px solid #3c4732; border-radius: 6px; color: #b6c0a5; font-size: 11px; }
  .graph-heading-actions button[aria-expanded="true"] { background: #333927; border-color: #9b895d; color: #dbc38f; }
  .graph-heading-actions .mdi { font-size: 18px; }
  .graph-settings { flex-shrink: 0; border: 1px solid #394330; border-radius: 8px; background: #1c2119; max-height: 38dvh; overflow-y: auto; }
  .graph-settings .graph-toolbar { padding: 10px 12px; border: 0; }
  .graph-settings .graph-options { padding: 0 12px 10px; }
  .graph-context { flex-shrink: 0; margin: 0; gap: 8px; min-width: 0; }
  .graph-context > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .graph-context small { margin-left: auto; flex-shrink: 0; color: #738268; font-size: 10px; }
  .graph-notice { flex-shrink: 0; margin: 0; max-height: 120px; overflow-y: auto; }
  .graph-workspace { position: relative; display: block; flex: 1; min-height: 240px; }
  .graph-canvas { height: 100%; }
  .graph-inspector { position: absolute; z-index: 3; inset: 12px 12px 12px auto; width: 300px; max-width: calc(100% - 24px); max-height: none; padding: 20px; border: 1px solid #495338; border-radius: 8px; box-shadow: 0 12px 40px #0007; }
  .has-selection .graph-label-toggle { right: 328px; }
  .graph-help { position: absolute; z-index: 4; top: 12px; right: 12px; width: 330px; max-width: calc(100% - 24px); max-height: calc(100% - 80px); overflow-y: auto; padding: 20px; border: 1px solid #495338; border-radius: 8px; background: #1b2118; color: #a6b096; box-shadow: 0 12px 40px #0007; }
  .graph-help .graph-reading { margin: 0; padding: 0; border: 0; }
  .graph-help .graph-reading > span { display: none; }
  .graph-help p { margin-top: 12px; font-size: 12px; line-height: 1.7; }
  .graph-footer { padding: 0; gap: 0; flex-shrink: 0; min-width: 0; }
  .graph-footer > div { width: 100%; flex-wrap: nowrap; overflow-x: auto; gap: 18px; padding: 3px 0; scrollbar-width: thin; }
  .graph-footer > div > span { flex-shrink: 0; white-space: nowrap; }
  .graph-footer > span { display: none; }
  @media (max-width: 950px) {
    .graph-heading { grid-template-columns: minmax(0, 1fr) minmax(160px, 240px) auto; gap: 10px; }
    .graph-heading-actions button > span { display: none; }
    .graph-heading-actions button { width: 38px; }
    .graph-title h1 { font-size: 25px; }
    .graph-context small { display: none; }
  }
  @media (max-width: 650px) {
    .relations-page { gap: 8px; }
    .graph-heading { grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
    .graph-title h1 { font-size: 23px; }
    .graph-title > span { font-size: 10px; }
    .graph-heading .graph-search { grid-column: 1 / -1; grid-row: 2; min-width: 0; }
    .graph-context { font-size: 10px; align-items: center; }
    .graph-inspector { top: auto; bottom: 10px; left: 10px; right: 10px; width: auto; max-width: none; height: 42%; max-height: none; padding: 16px; }
    .graph-inspector-top { margin-bottom: 12px; }
    .graph-inspector h2 { font-size: 23px; }
    .graph-controls { bottom: 12px; left: 12px; }
    .has-selection .graph-controls { bottom: calc(42% + 20px); }
    .has-selection .graph-label-toggle { right: 12px; }
    .graph-label-toggle { top: 12px; right: 12px; }
  }
</style>
