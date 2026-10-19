<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
  import { authApi, type Identity } from './api/auth'
  import { peopleApi } from './api/people'
  import GenealogyPage from './components/GenealogyPage.vue'
  import PersonDetails from './components/PersonDetails.vue'
  import RelationsGraph from './components/RelationsGraph.vue'
  import { isStatic } from './config'
  import { type GroupId, groups, type Person, type PersonRelation } from './data/people'
  import { collectionPeriod } from './utils/collectionPeriod'
  import { relationPeriod } from './utils/relationPeriod'
  import { packTimelineColumns } from './utils/timeline'

  function migrateRelations (person: Person): Person {
    const { relation, ...details } = person
    return { ...details, relations: (person.relations ?? (relation ? [relation] : [])).map(item => ({ ...item })) }
  }

  const loading = ref(true)
  const identity = ref<Identity>({ username: null, canEdit: false })
  const canEdit = computed(() => !isStatic && identity.value.canEdit)
  const loginDialog = ref(false)
  const loginForm = reactive({ username: '', password: '' })
  const authBusy = ref(false)
  const authError = ref('')
  const authChecking = ref(true)

  async function refreshIdentity () {
    try {
      identity.value = await authApi.me()
    } catch {
      identity.value = { username: null, canEdit: false }
    } finally {
      authChecking.value = false
    }
  }
  function sessionExpired () {
    identity.value = { username: null, canEdit: false }
    authError.value = 'Сессия завершена. Войдите снова для редактирования.'
  }
  async function login () {
    if (authBusy.value) return
    authBusy.value = true
    authError.value = ''
    try {
      identity.value = await authApi.login(loginForm.username, loginForm.password)
      loginDialog.value = false
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Не удалось войти.'
    } finally {
      loginForm.password = ''
      authBusy.value = false
    }
  }
  async function logout () {
    if (authBusy.value || saving.value || importing.value) return
    authBusy.value = true
    authError.value = ''
    try {
      identity.value = await authApi.logout()
      dialog.value = false
    } catch (error) {
      authError.value = error instanceof Error ? error.message : 'Не удалось выйти. Повторите попытку.'
    } finally {
      authBusy.value = false
    }
  }
  onMounted(() => {
    void refreshIdentity()
    window.addEventListener('chronicle-session-expired', sessionExpired)
    window.addEventListener('focus', refreshIdentity)
  })
  onUnmounted(() => {
    window.removeEventListener('chronicle-session-expired', sessionExpired)
    window.removeEventListener('focus', refreshIdentity)
  })
  watch(loginDialog, () => {
    loginForm.password = ''
  })
  const loaded = ref(false)
  const saving = ref(false)
  const importing = ref(false)
  const apiError = ref('')
  const legacyPeople = ref<Person[]>([])
  const legacyError = ref('')
  const people = ref<Person[]>([])
  const storageStatus = computed(() => {
    if (loading.value) return 'Загрузка коллекции…'
    if (saving.value || importing.value) return 'Сохранение…'
    if (apiError.value) return 'Коллекция недоступна'
    return isStatic ? 'Опубликованная коллекция' : 'Коллекция в базе данных'
  })

  function readLegacyPeople () {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem('chronicle-v1') || 'null')
      if (saved === null) return
      if (!Array.isArray(saved) || !saved.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && Number.isInteger(p.start) && Number.isInteger(p.end) && p.end >= p.start && groups.some(g => g.id === p.group))) {
        throw new Error('Некорректный формат')
      }
      legacyPeople.value = saved.map(person => migrateRelations(person))
    } catch {
      legacyError.value = 'Не удалось прочитать прежние данные браузера. Исходная копия сохранена без изменений.'
    }
  }

  async function loadPeople () {
    loading.value = true
    apiError.value = ''
    try {
      people.value = await peopleApi.list()
      loaded.value = true
    } catch (error) {
      apiError.value = error instanceof Error ? error.message : 'Не удалось загрузить коллекцию.'
    } finally {
      loading.value = false
    }
  }

  async function importLegacyPeople () {
    if (!canEdit.value || importing.value || saving.value || !loaded.value) return
    importing.value = true
    apiError.value = ''
    try {
      people.value = await peopleApi.import(legacyPeople.value)
      legacyPeople.value = []
      // Keep the old copy as a backup, but stop offering it after a successful transfer.
      try {
        localStorage.setItem('chronicle-postgres-imported', 'true')
      } catch { /* Backup remains available. */ }
      toast.value = 'Прежние записи перенесены в базу данных'
    } catch (error) {
      apiError.value = error instanceof Error ? error.message : 'Не удалось перенести записи.'
    } finally {
      importing.value = false
    }
  }

  onMounted(() => {
    if (isStatic) {
      void loadPeople()
      return
    }
    try {
      if (localStorage.getItem('chronicle-postgres-imported') !== 'true') readLegacyPeople()
    } catch {
      readLegacyPeople()
    }
    void loadPeople()
  })
  const query = ref('')
  const enabled = ref<GroupId[]>(groups.map(g => g.id))
  const zoom = ref(100)
  const yearHeight = 22
  const period = computed(() => collectionPeriod(people.value))
  const range = ref('Все годы')
  const startYear = computed(() => range.value === 'Все годы' ? period.value.start ?? 1 : Number(range.value.split('–', 1)[0]))
  const endYear = computed(() => range.value === 'Все годы' ? period.value.end ?? startYear.value : Number(range.value.split('–', 2)[1]))
  watch(period, value => {
    if (!value.centuries.some(item => `${item.start}–${item.end}` === range.value)) range.value = 'Все годы'
  })
  const years = computed(() => period.value.start === null ? [] : Array.from({ length: endYear.value - startYear.value + 1 }, (_, i) => startYear.value + i))
  const shown = computed(() => people.value.filter(p => enabled.value.includes(p.group) && p.name.toLocaleLowerCase('ru').includes(query.value.toLocaleLowerCase('ru')) && p.end >= startYear.value && p.start <= endYear.value))
  const lanes = computed(() => groups.filter(group => enabled.value.includes(group.id)).map(group => {
    const members = shown.value.filter(person => person.group === group.id)
    return {
      ...group,
      people: members,
      columns: packTimelineColumns(members),
    }
  }))
  const chartWidth = computed(() => `${88 + lanes.value.reduce((sum, group) => sum + Math.max(group.columns.length, 1) * 128, 0)}px`)
  const dialog = ref(false)
  const selected = ref<Person | null>(null)
  const form = reactive({ firstName: '', lastName: '', patronymic: '', country: '', region: '', dynasty: '', start: Number.NaN, end: Number.NaN, group: 'family' as GroupId, note: '', biography: '', sources: '', before: false, relations: [] as PersonRelation[] })
  const formFullName = computed(() => [form.lastName, form.firstName, form.patronymic].map(part => part.trim()).filter(Boolean).join(' '))
  function savedOptions (field: 'country' | 'region' | 'dynasty') {
    const values = people.value.map(person => person[field]?.trim()).filter((value): value is string => !!value)
    return [...new Map(values.map(value => [value.toLocaleLowerCase('ru'), value])).values()].sort((a, b) => a.localeCompare(b, 'ru'))
  }
  const countryOptions = computed(() => savedOptions('country'))
  const regionOptions = computed(() => savedOptions('region'))
  const dynastyOptions = computed(() => savedOptions('dynasty'))
  const relatedPeople = computed(() => people.value
    .filter(person => person.id !== selected.value?.id)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru')))
  const relationshipRoles = ['Сын', 'Дочь', 'Брат', 'Сестра', 'Отец', 'Мать', 'Муж', 'Жена', 'Дед', 'Бабушка', 'Внук', 'Внучка', 'Дядя', 'Тётя', 'Племянник', 'Племянница', 'Двоюродный брат', 'Двоюродная сестра', 'Друг', 'Советник', 'Соратник', 'Сподвижник']
  const incomingRelations = computed(() => selected.value
    ? people.value.flatMap(person =>
      (person.relations ?? []).filter(relation => relation.personId === selected.value?.id).map(relation => ({ ...relation, personId: person.id, name: person.name })))
    : [])
  const formError = ref('')
  const toast = ref('')
  const timeline = ref<HTMLElement | null>(null)
  const timelineDragging = ref(false)
  let panStart: { pointerId: number, x: number, y: number, left: number, top: number } | null = null
  let suppressTimelineClick = false
  async function setTimelineZoom (value: number, anchor?: { x: number, y: number }) {
    const next = Math.max(25, Math.min(200, value))
    if (next === zoom.value) return
    const element = timeline.value
    const x = anchor?.x ?? (element?.clientWidth ?? 0) / 2
    const y = anchor?.y ?? (element?.clientHeight ?? 0) / 2
    const ratio = next / zoom.value
    const left = ((element?.scrollLeft ?? 0) + x) * ratio - x
    const top = ((element?.scrollTop ?? 0) + y) * ratio - y
    zoom.value = next
    await nextTick()
    element?.scrollTo({ left, top })
  }
  function timelineWheel (event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    if (event.deltaY === 0) return
    const bounds = timeline.value!.getBoundingClientRect()
    void setTimelineZoom(zoom.value + (event.deltaY < 0 ? 5 : -5), { x: event.clientX - bounds.left, y: event.clientY - bounds.top })
  }
  function startTimelinePan (event: PointerEvent) {
    suppressTimelineClick = false
    if (event.pointerType === 'touch' || event.button !== 0 || !timeline.value) return
    const target = event.target as HTMLElement
    if (target.closest('button:not(.person-bar), input, select, a')) return
    // Ignore native scrollbar interaction.
    const bounds = timeline.value.getBoundingClientRect()
    if (event.clientX - bounds.left >= timeline.value.clientWidth || event.clientY - bounds.top >= timeline.value.clientHeight) return
    panStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: timeline.value.scrollLeft, top: timeline.value.scrollTop }
  }
  function moveTimelinePan (event: PointerEvent) {
    if (!panStart || panStart.pointerId !== event.pointerId || !timeline.value) return
    const dx = event.clientX - panStart.x
    const dy = event.clientY - panStart.y
    if (!timelineDragging.value && Math.hypot(dx, dy) < 5) return
    timelineDragging.value = true
    suppressTimelineClick = true
    timeline.value.setPointerCapture(event.pointerId)
    timeline.value.scrollLeft = panStart.left - dx
    timeline.value.scrollTop = panStart.top - dy
    event.preventDefault()
  }
  function stopTimelinePan (event: PointerEvent) {
    if (panStart?.pointerId !== event.pointerId) return
    panStart = null
    timelineDragging.value = false
    if (timeline.value?.hasPointerCapture(event.pointerId)) timeline.value.releasePointerCapture(event.pointerId)
  }
  function timelineClick (event: MouseEvent) {
    if (!suppressTimelineClick || event.detail === 0) return
    event.preventDefault()
    event.stopPropagation()
    suppressTimelineClick = false
  }
  type Page = 'overview' | 'timeline' | 'people' | 'relations' | 'genealogy'
  function pageFromHash (): Page {
    if (window.location.hash === '#/genealogy') return 'genealogy'
    if (window.location.hash === '#/relations') return 'relations'
    if (window.location.hash === '#/timeline') return 'timeline'
    if (window.location.hash === '#/people') return 'people'
    return 'overview'
  }
  const activeNav = ref<Page>(pageFromHash())
  function syncPage () {
    activeNav.value = pageFromHash()
    window.scrollTo({ top: 0 })
  }
  onMounted(() => window.addEventListener('hashchange', syncPage))
  onUnmounted(() => window.removeEventListener('hashchange', syncPage))
  watch(activeNav, page => {
    const titles = { overview: 'Обзор атласа', timeline: 'Шкала времени', people: 'Коллекция персон', relations: 'Карта связей', genealogy: 'Генеалогия' }
    document.title = `Хроника — ${titles[page]}`
  }, { immediate: true })
  const groupStats = computed(() => groups.map(group => ({
    ...group,
    count: people.value.filter(person => person.group === group.id).length,
  })))
  const collectionStart = computed(() => period.value.start)
  const collectionEnd = computed(() => period.value.end)
  const collectionSpan = computed(() => collectionStart.value === null || collectionEnd.value === null ? 0 : collectionEnd.value - collectionStart.value + 1)
  const recentPeople = computed(() => people.value.slice(-4).reverse())
  function openGroup (id: GroupId) {
    enabled.value = [id]
    query.value = ''
    range.value = 'Все годы'
    window.location.hash = '/people'
  }
  function toggleGroup (id: GroupId) {
    enabled.value = enabled.value.includes(id) ? enabled.value.filter(g => g !== id) : [...enabled.value, id]
  }
  function openForm () {
    if (!canEdit.value || !loaded.value || loading.value || importing.value) return
    selected.value = null
    Object.assign(form, { firstName: '', lastName: '', patronymic: '', country: '', region: '', dynasty: '', start: Number.NaN, end: Number.NaN, group: 'family', note: '', biography: '', sources: '', before: false, relations: [] })
    formError.value = ''
    dialog.value = true
  }
  function editPerson (person: Person) {
    selected.value = person
    Object.assign(form, {
      firstName: person.firstName ?? person.name, lastName: person.lastName ?? '', patronymic: person.patronymic ?? '',
      country: person.country ?? '', region: person.region ?? '', dynasty: person.dynasty ?? '',
      start: person.start, end: person.end, group: person.group,
      note: person.note, before: person.before ?? false,
      biography: person.biography ?? '',
      sources: person.sources ?? '',
      relations: (person.relations ?? []).map(relation => ({ ...relation })),
    })
    formError.value = ''
    dialog.value = true
  }
  async function savePerson () {
    if (!canEdit.value || saving.value || importing.value || !loaded.value) return
    formError.value = ''
    if (!form.firstName.trim()) {
      formError.value = 'Укажите имя персоны.'
      return
    }
    if (!Number.isInteger(form.start) || !Number.isInteger(form.end) || form.start < 1 || form.end > 2100 || form.end < form.start) {
      formError.value = 'Укажите целые годы от 1 до 2100. Конец периода должен быть не раньше начала.'
      return
    }
    const { relations, ...details } = form
    const relationKeys = new Set<string>()
    for (const relation of relations) {
      if (!people.value.some(person => person.id === relation.personId) || relation.personId === selected.value?.id) {
        formError.value = 'В каждой связи выберите другую персону из атласа.'
        return
      }
      if (!relation.role.trim()) {
        formError.value = 'В каждой связи укажите, кем эта персона приходится выбранному человеку.'
        return
      }
      const target = people.value.find(person => person.id === relation.personId)!
      const years = [relation.startYear, relation.endYear].filter((year): year is number => year !== undefined)
      if (years.some(year => !Number.isInteger(year) || year < 1 || year > 2100 || year > form.end || (!form.before && year < form.start) || year > target.end || (!target.before && year < target.start)) || (relation.startYear !== undefined && relation.endYear !== undefined && relation.startYear > relation.endYear)) {
        formError.value = 'Проверьте период связи: целые годы в пределах жизни обеих персон, начало не позже конца.'
        return
      }
      const key = JSON.stringify([relation.personId, relation.role.trim().toLocaleLowerCase('ru')])
      if (relationKeys.has(key)) {
        formError.value = 'Одинаковая связь с этой персоной уже добавлена.'
        return
      }
      relationKeys.add(key)
    }
    const payload = {
      ...details, name: formFullName.value,
      firstName: form.firstName.trim(), lastName: form.lastName.trim(), patronymic: form.patronymic.trim(),
      country: form.country.trim(), region: form.region.trim(), dynasty: form.dynasty.trim(),
      relations: relations.map(relation => ({ ...relation, role: relation.role.trim() })),
    }
    saving.value = true
    try {
      const person = selected.value
        ? await peopleApi.update(selected.value.id, payload)
        : await peopleApi.create(payload)
      if (selected.value) people.value = people.value.map(p => p.id === person.id ? person : p)
      else people.value.push(person)
      if (!enabled.value.includes(person.group)) enabled.value.push(person.group)
      query.value = ''
      if (person.start < startYear.value || person.end > endYear.value) range.value = 'Все годы'
      dialog.value = false
      toast.value = selected.value ? 'Изменения сохранены' : 'Персона добавлена на шкалу'
    } catch (error) {
      formError.value = error instanceof Error ? error.message : 'Не удалось сохранить персону.'
    } finally {
      saving.value = false
    }
  }
  function barStyle (person: Person) {
    return { top: `${(Math.max(person.start, startYear.value) - startYear.value) * yearHeight + 2}px`, height: `${Math.max(3, (Math.min(person.end, endYear.value) - Math.max(person.start, startYear.value) + 1) * yearHeight - 4)}px` }
  }
  function exportData () {
    const url = URL.createObjectURL(new Blob([JSON.stringify(people.value, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'chronicle.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.value = 'Хроника выгружена в JSON'
  }
</script>

<template>
  <v-app>
    <div class="atlas-app" :class="{ 'relations-mode': ['relations', 'genealogy'].includes(activeNav) }">
      <aside class="sidebar">
        <a aria-label="Хроника — главная" class="brand" href="#/"><span class="brand-mark">х</span><span>хроника<span class="brand-dot">.</span></span></a>
        <div class="workspace-label">ЛИЧНЫЙ ИСТОРИЧЕСКИЙ АТЛАС</div>

        <nav aria-label="Основная навигация" class="main-nav">
          <a :aria-current="activeNav === 'overview' ? 'page' : undefined" aria-label="Обзор атласа" :class="{ active: activeNav === 'overview' }" href="#/"><i aria-hidden="true" class="mdi mdi-view-dashboard-outline" />Обзор атласа</a>
          <a :aria-current="activeNav === 'timeline' ? 'page' : undefined" aria-label="Шкала времени" :class="{ active: activeNav === 'timeline' }" href="#/timeline"><i aria-hidden="true" class="mdi mdi-chart-timeline-variant" />Шкала времени<span class="nav-dot" /></a>
          <a :aria-current="activeNav === 'people' ? 'page' : undefined" aria-label="Персоны" :class="{ active: activeNav === 'people' }" href="#/people"><i aria-hidden="true" class="mdi mdi-account-group-outline" />Персоны<span class="nav-count">{{ people.length }}</span></a>
          <a :aria-current="activeNav === 'relations' ? 'page' : undefined" aria-label="Карта связей" :class="{ active: activeNav === 'relations' }" href="#/relations"><i aria-hidden="true" class="mdi mdi-graph-outline" />Карта связей</a>
          <a :aria-current="activeNav === 'genealogy' ? 'page' : undefined" aria-label="Генеалогия" :class="{ active: activeNav === 'genealogy' }" href="#/genealogy"><i aria-hidden="true" class="mdi mdi-family-tree" />Генеалогия</a>
        </nav>

        <div class="sidebar-divider" />
        <div class="section-label">КТО ЕСТЬ КТО <span>{{ String(groups.length).padStart(2, '0') }}</span></div>

        <div class="group-menu">
          <button
            v-for="group in groups"
            :key="group.id"
            :aria-pressed="enabled.includes(group.id)"
            :class="{ muted: !enabled.includes(group.id) }"
            @click="toggleGroup(group.id)"
          ><span class="color-dot" :style="{ background: group.color }" /><span>{{ group.label }}</span><small>{{ people.filter(p => p.group === group.id).length }}</small><i v-if="enabled.includes(group.id)" class="mdi mdi-check" /></button>
        </div>

        <div class="sidebar-note"><span class="note-spark">✧</span><p>История становится понятнее,<br>когда видишь связи.</p><span class="small-rule" /></div>
        <button v-if="canEdit" class="sidebar-add" @click="openForm"><i aria-hidden="true" class="mdi mdi-plus" /><span>Дополнить историю<small>У каждой эпохи больше героев</small></span></button>
        <div class="sidebar-bottom"><span class="status-dot" /> Ваша личная коллекция <span>↗</span></div>
      </aside>

      <main class="main-content" :class="{ 'timeline-page': activeNav === 'timeline' }">
        <header v-if="!['timeline', 'relations', 'genealogy'].includes(activeNav)" class="topbar"><div>Атлас <span>/</span> <strong>Коллекция персон</strong></div><span class="topbar-right"><span class="status-dot" /> {{ storageStatus }}<span class="avatar">Я</span></span></header>

        <div aria-live="polite" class="data-notice auth-bar">
          <span>{{ isStatic ? 'Опубликованная коллекция · только просмотр' : authChecking ? 'Проверяем вход…' : canEdit ? `Редактор: ${identity.username}` : 'Режим просмотра' }}</span>
          <button v-if="canEdit" :disabled="authBusy || saving || importing" @click="logout">Выйти</button>
          <button v-else-if="!isStatic" :disabled="authChecking || authBusy" @click="authError = ''; loginDialog = true">Войти как редактор</button>
        </div>

        <div v-if="authError && !loginDialog" class="data-notice data-notice-error" role="alert">{{ authError }}</div>
        <div v-if="loading" class="data-notice" role="status">Загружаем коллекцию…</div>
        <div v-if="apiError" class="data-notice data-notice-error" role="alert">{{ apiError }}<button :disabled="loading || saving || importing" @click="loadPeople">Повторить загрузку</button></div>
        <div v-if="legacyError" class="data-notice" role="alert">{{ legacyError }}</div>
        <div v-if="canEdit && legacyPeople.length > 0" class="data-notice"><span>В браузере есть прежние записи: {{ legacyPeople.length }}. Перенос обновит совпадающие записи в базе; остальные останутся. Копия в браузере сохранится.</span><button :disabled="!loaded || loading || importing || saving" @click="importLegacyPeople">{{ importing ? 'Переносим…' : 'Перенести в базу' }}</button></div>

        <section v-if="activeNav === 'overview'" class="intro">
          <div class="intro-copy"><div class="eyebrow"><span /> ЛЮДИ. ВРЕМЯ. СВЯЗИ.</div><h1>У каждой эпохи —<br>своё <em>окружение.</em></h1><p>Правители и те, кто был рядом. Исследуйте историю<br class="desktop-break"> через жизни людей на одной шкале времени.</p><div class="intro-meta"><span><i aria-hidden="true" class="mdi mdi-map-marker-outline" /> Исторический атлас</span><span class="meta-separator" /><span>{{ period.label }}</span><span v-if="collectionStart !== null" class="era-tag">{{ collectionStart }}–{{ collectionEnd }}</span></div></div>
          <div aria-hidden="true" class="era-art"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><div class="art-cross cross-one">+</div><div class="art-cross cross-two">+</div><div class="art-label">МОСКОВСКОЕ КНЯЖЕСТВО</div><svg class="tower-art" fill="none" viewBox="0 0 240 200"><g stroke="currentColor" stroke-width="1"><path d="M30 177H210M43 177V136H74V177M166 177V136H197V177M49 136V121H68V136M172 136V121H191V136M78 177V102H162V177M87 102V91H153V102M96 91V66H144V91M104 66V51H136V66M110 51L120 27L130 51M120 27V13M113 20H127M89 177V120H108V177M132 177V120H151V177M114 177V143Q120 134 126 143V177M52 151H61M179 151H188M101 79H108M132 79H139M113 111H127M20 183H220M82 184V190H158V184" /></g></svg><div class="art-bottom">ОТ КНЯЗЕЙ — К ЦАРЯМ <span>01 / 04</span></div></div>
        </section>

        <section v-if="activeNav === 'overview'" aria-label="Обзор коллекции" class="dashboard">
          <div class="section-heading">
            <div><span class="section-number">01</span><h2>Атлас в цифрах</h2><span class="count-badge">Ваша коллекция</span></div>
            <button v-if="canEdit" class="primary-button" @click="openForm"><i aria-hidden="true" class="mdi mdi-plus" />Добавить персону</button>
          </div>

          <div class="stat-grid">
            <article class="stat-card total-stat"><span class="stat-label"><i aria-hidden="true" class="mdi mdi-account-group-outline" />Всего персон</span><strong data-testid="total-people">{{ people.length }}</strong><small>Жизни, собранные на одной шкале</small></article>
            <article class="stat-card"><span class="stat-label"><i aria-hidden="true" class="mdi mdi-crown-outline" />Правители</span><strong>{{ groupStats.find(group => group.id === 'rulers')?.count ?? 0 }}</strong><small>Стержень исторического атласа</small></article>
            <article class="stat-card"><span class="stat-label"><i aria-hidden="true" class="mdi mdi-calendar-range-outline" />Охват коллекции</span><strong>{{ collectionSpan }}<span>лет</span></strong><small>{{ collectionStart ?? '—' }} — {{ collectionEnd ?? '—' }} · по указанным датам</small></article>
            <article class="stat-card"><span class="stat-label"><i aria-hidden="true" class="mdi mdi-palette-outline" />Группы персон</span><strong>{{ groupStats.filter(group => group.count > 0).length }}<span>из {{ groups.length }}</span></strong><small>Правители и их окружение</small></article>
          </div>

          <div class="dashboard-panels">
            <section class="dashboard-panel"><div class="panel-heading"><h3>Окружение эпохи</h3><span>ПО ГРУППАМ</span></div>

              <button
                v-for="group in groupStats"
                :key="group.id"
                class="group-stat-row"
                :style="{ '--group-color': group.color }"
                @click="openGroup(group.id)"
              ><span class="group-stat-name"><span class="color-dot" :style="{ background: group.color }" />{{ group.label }}<strong>{{ group.count }}</strong></span><span class="group-stat-track"><span :style="{ width: `${people.length > 0 ? group.count / people.length * 100 : 0}%` }" /></span></button></section>

            <section class="dashboard-panel"><div class="panel-heading"><h3>Последние в коллекции</h3><a href="#/people">Все персоны ↗</a></div><button v-for="person in recentPeople" :key="person.id" class="recent-person" @click="editPerson(person)"><span class="color-dot" :style="{ background: groups.find(group => group.id === person.group)?.color }" /><span>{{ person.name }}<small>{{ person.note || 'Персона атласа' }}</small></span><span class="recent-dates">{{ person.before ? 'до ' : '' }}{{ person.start }} — {{ person.end }}</span></button><p v-if="recentPeople.length === 0" class="empty-results">Добавьте первую персону, чтобы начать коллекцию.</p></section>
          </div>

          <a class="timeline-link" href="#/timeline"><span class="timeline-link-icon"><i aria-hidden="true" class="mdi mdi-chart-timeline-variant" /></span><span><strong>Увидеть эпоху целиком</strong><small>Откройте шкалу времени и узнайте, кто жил одновременно.</small></span><span class="timeline-link-action">Перейти к графику <i aria-hidden="true" class="mdi mdi-arrow-right" /></span></a>
        </section>

        <RelationsGraph v-else-if="activeNav === 'relations'" :can-edit="canEdit" :people="people" @edit="editPerson" />
        <GenealogyPage v-else-if="activeNav === 'genealogy'" :can-edit="canEdit" :people="people" @edit="editPerson" />

        <section v-else aria-label="Исторический атлас" class="atlas-section">
          <div class="section-heading"><div><span class="section-number">01</span><h2>{{ activeNav === 'timeline' ? 'Шкала времени' : 'Коллекция персон' }}</h2><span class="count-badge">{{ people.length }} персон</span></div><button v-if="canEdit" class="primary-button" @click="openForm"><i aria-hidden="true" class="mdi mdi-plus" />Добавить персону</button></div>
          <div class="chart-toolbar"><label class="search-field"><i aria-hidden="true" class="mdi mdi-magnify" /><input v-model="query" aria-label="Найти персону" placeholder="Найти персону…"><button v-if="query" aria-label="Очистить поиск" @click="query = ''">×</button><span v-else class="search-shortcut">⌕</span></label><div class="toolbar-options"><label class="range-select"><i aria-hidden="true" class="mdi mdi-calendar-range-outline" /><select v-model="range" aria-label="Период"><option value="Все годы">Все годы{{ collectionStart !== null ? ` · ${collectionStart}–${collectionEnd}` : '' }}</option><option v-for="item in period.centuries" :key="item.start" :value="`${item.start}–${item.end}`">{{ item.label }} · {{ item.start }}–{{ item.end }}</option></select></label><div v-if="activeNav === 'timeline'" aria-label="Масштаб диаграммы" class="zoom-control" role="group"><button aria-label="Уменьшить масштаб" :disabled="zoom <= 25" @click="setTimelineZoom(zoom - 25)">−</button><button aria-label="Сбросить масштаб на 100%" class="zoom-reset" title="Сбросить масштаб на 100%" @click="setTimelineZoom(100)">{{ zoom }}%</button><button aria-label="Увеличить масштаб" :disabled="zoom >= 200" @click="setTimelineZoom(zoom + 25)">+</button></div><button aria-label="Выгрузить данные" class="export-button" title="Выгрузить JSON" @click="exportData"><i aria-hidden="true" class="mdi mdi-tray-arrow-down" /></button></div></div>

          <div aria-label="Фильтры групп" class="mobile-filters"><button
            v-for="group in groups"
            :key="group.id"
            :aria-pressed="enabled.includes(group.id)"
            :class="{ muted: !enabled.includes(group.id) }"
            @click="toggleGroup(group.id)"
          ><span class="color-dot" :style="{ background: group.color }" />{{ group.label }}</button></div>

          <template v-if="activeNav === 'timeline'">
            <div
              ref="timeline"
              aria-label="Шкала времени. Перетаскивайте для перемещения, Ctrl + колесо — масштаб."
              class="timeline-scroll"
              :class="{ dragging: timelineDragging }"
              role="region"
              tabindex="0"
              @click.capture="timelineClick"
              @lostpointercapture="stopTimelinePan"
              @pointercancel="stopTimelinePan"
              @pointerdown="startTimelinePan"
              @pointermove="moveTimelinePan"
              @pointerup="stopTimelinePan"
              @wheel="timelineWheel"
            >
              <div class="timeline-inner" :style="{ minWidth: chartWidth, width: `${10000 / zoom}%`, zoom: zoom / 100 }">
                <div class="lane-headers"><div class="year-header">ГОД <i aria-hidden="true" class="mdi mdi-arrow-down" /></div><div v-for="group in lanes" :key="group.id" class="lane-heading" :style="{ width: `${Math.max(group.columns.length, 1) * 128}px`, '--group-color': group.color }"><i aria-hidden="true" :class="`mdi ${group.icon}`" /><span>{{ group.label }}</span><small>{{ group.people.length }}</small></div></div>

                <div class="timeline-body" :style="{ height: `${years.length * yearHeight}px`, '--year-height': `${yearHeight}px` }">
                  <div
                    v-for="year in years"
                    :key="year"
                    class="year-row"
                    :class="{ decade: year % 10 === 0 }"
                    :style="{ top: `${(year - startYear) * yearHeight}px`, height: `${yearHeight}px` }"
                  ><span>{{ year }}</span></div>

                  <div class="person-lanes"><div
                    v-for="group in lanes"
                    :key="group.id"
                    class="group-lanes"
                    :class="group.id"
                    :style="{ width: `${Math.max(group.columns.length, 1) * 128}px`, '--group-color': group.color }"
                  ><div v-for="(column, columnIndex) in group.columns" :key="columnIndex" class="person-lane"><button
                     v-for="person in column"
                     :key="person.id"
                     :aria-label="`${person.name}, ${person.before ? 'до ' : ''}${person.start}–${person.end}. ${canEdit ? 'Редактировать' : 'Просмотреть'}`"
                     class="person-bar"
                     :class="{ 'before-start': person.before || person.start < startYear }"
                     :style="barStyle(person)"
                     @click="editPerson(person)"
                   >
                     <span class="bar-name">{{ person.name }}</span>

                     <v-tooltip activator="parent" location="end" :open-delay="180" open-on-focus>
                       <div class="person-tooltip">
                         <strong>{{ person.name }}</strong>
                         <span class="tooltip-years">{{ person.before ? 'до ' : '' }}{{ person.start }} — {{ person.end }}</span>
                         <span class="tooltip-group">{{ group.label }}</span>
                         <p v-if="person.note">{{ person.note }}</p>
                         <span v-if="person.country || person.region || person.dynasty" class="tooltip-details">{{ [person.country, person.region, person.dynasty].filter(Boolean).join(' · ') }}</span>
                       </div>
                     </v-tooltip>
                   </button></div>

                    <div v-if="group.people.length === 0" class="empty-lane"><button v-if="canEdit" @click="openForm(); form.group = group.id"><i aria-hidden="true" class="mdi mdi-plus" /><span>Добавьте<br>персону</span></button></div></div></div>
                </div>
              </div>

              <div v-if="shown.length === 0" class="empty-results">Персоны не найдены. Измените поиск или включите группы слева.</div>
            </div>

            <div class="chart-footer"><span><span class="footer-line" /> Одна строка — один год жизни</span><span><i aria-hidden="true" class="mdi mdi-mouse" /> Перетаскивайте диаграмму · Ctrl + колесо — масштаб</span><button @click="timeline?.scrollTo({ top: 0, behavior: 'smooth' })">К началу <i aria-hidden="true" class="mdi mdi-arrow-up" /></button></div>
          </template>

          <div v-else class="people-grid"><button v-for="person in shown" :key="person.id" class="person-card" @click="editPerson(person)"><span class="color-dot" :style="{ background: groups.find(g => g.id === person.group)?.color }" /><strong>{{ person.name }}</strong><span>{{ person.before ? 'до ' : '' }}{{ person.start }} — {{ person.end }}</span><small>{{ person.note }}</small><i aria-hidden="true" :class="canEdit ? 'mdi mdi-pencil-outline' : 'mdi mdi-eye-outline'" /></button><p v-if="shown.length === 0" class="empty-results">По вашему запросу никого не найдено.</p></div>
        </section>

        <footer v-if="!['timeline', 'relations', 'genealogy'].includes(activeNav)" class="page-footer"><span>Не просто даты. Люди, которые создавали историю.</span><span>ХРОНИКА <span class="footer-star">✧</span> ЛЮДИ И СВЯЗИ</span></footer>
      </main>
    </div>

    <v-dialog v-model="loginDialog" max-width="440" :persistent="authBusy" theme="dark">
      <div class="person-dialog">
        <div class="dialog-top"><span class="eyebrow">ДОСТУП РЕДАКТОРА</span><button aria-label="Закрыть" :disabled="authBusy" @click="loginDialog = false"><i aria-hidden="true" class="mdi mdi-close" /></button></div>
        <h2>Вход<span>.</span></h2><p>Войдите, чтобы добавлять и изменять данные атласа.</p>

        <form @submit.prevent="login">
          <fieldset class="person-form-fields" :disabled="authBusy">
            <label>Логин<input v-model="loginForm.username" autocomplete="username" maxlength="100" required></label>

            <label>Пароль<input
              v-model="loginForm.password"
              autocomplete="current-password"
              maxlength="1024"
              required
              type="password"
            ></label>
          </fieldset>

          <p v-if="authError" class="form-error" role="alert">{{ authError }}</p>
          <div class="form-actions"><button class="secondary-button" :disabled="authBusy" type="button" @click="loginDialog = false">Отмена</button><button class="primary-button" :disabled="authBusy" type="submit">{{ authBusy ? 'Входим…' : 'Войти' }}</button></div>
        </form>
      </div>
    </v-dialog>

    <v-dialog v-model="dialog" :max-width="canEdit ? 530 : 680" :persistent="saving" theme="dark">
      <PersonDetails
        v-if="!canEdit && selected"
        :people="people"
        :person="selected"
        @close="dialog = false"
        @select="editPerson"
      />

      <div v-else-if="canEdit" class="person-dialog"><div class="dialog-top"><span class="eyebrow">ДОПОЛНИТЬ ИСТОРИЮ</span><button aria-label="Закрыть" :disabled="saving" @click="dialog = false"><i aria-hidden="true" class="mdi mdi-close" /></button></div><h2>{{ selected ? 'Редактировать персону' : 'Новая персона' }}<span>.</span></h2><p>Добавьте ещё одну жизнь на общую шкалу времени.</p>

        <form @submit.prevent="savePerson"><fieldset class="person-form-fields" :disabled="saving || !canEdit"><div class="name-fields">
                                                                                                                 <label>Фамилия <span class="optional">если есть</span><input v-model="form.lastName" autocomplete="family-name" maxlength="100" placeholder="Фамилия"></label>

                                                                                                                 <label>Имя <span class="optional">обязательно</span>

                                                                                                                   <input
                                                                                                                     v-model="form.firstName"
                                                                                                                     autocomplete="given-name"
                                                                                                                     autofocus
                                                                                                                     maxlength="150"
                                                                                                                     placeholder="Например, Дмитрий"
                                                                                                                     required
                                                                                                                   ></label>

                                                                                                                 <label>Отчество <span class="optional">если есть</span><input v-model="form.patronymic" autocomplete="additional-name" maxlength="100" placeholder="Например, Иванович"></label>
                                                                                                               </div>

                                             <p v-if="selected && selected.firstName === undefined" class="legacy-name-hint">Прежнее имя сохранено целиком в поле «Имя». При необходимости распределите его по отдельным полям.</p>

                                             <div class="person-classification">
                                               <label>Страна<input v-model="form.country" list="person-countries" maxlength="150" placeholder="Выберите или введите страну"></label>
                                               <label>Регион<input v-model="form.region" list="person-regions" maxlength="150" placeholder="Выберите или введите регион"></label>
                                               <label>Династия<input v-model="form.dynasty" list="person-dynasties" maxlength="150" placeholder="Выберите или введите династию"></label>
                                               <p>Необязательные поля. Можно выбрать ранее сохранённое значение или ввести новое.</p>
                                               <datalist id="person-countries"><option v-for="value in countryOptions" :key="value" :value="value" /></datalist>
                                               <datalist id="person-regions"><option v-for="value in regionOptions" :key="value" :value="value" /></datalist>
                                               <datalist id="person-dynasties"><option v-for="value in dynastyOptions" :key="value" :value="value" /></datalist>
                                             </div>

                                             <div class="date-inputs"><label>Начало периода<input
                                                                        max="2100"
                                                                        min="1"
                                                                        required
                                                                        type="number"
                                                                        :value="Number.isNaN(form.start) ? '' : form.start"
                                                                        @input="form.start = ($event.target as HTMLInputElement).valueAsNumber"
                                                                      ></label>

                                               <label>Конец периода<input
                                                 max="2100"
                                                 min="1"
                                                 required
                                                 type="number"
                                                 :value="Number.isNaN(form.end) ? '' : form.end"
                                                 @input="form.end = ($event.target as HTMLInputElement).valueAsNumber"
                                               ></label></div>

                                             <label class="checkbox-label"><input v-model="form.before" type="checkbox"> Точный год начала неизвестен (до указанного)</label><label>Группа<select v-model="form.group"><option v-for="group in groups" :key="group.id" :value="group.id">{{ group.label }}</option></select></label><label>Кем был / была <span class="optional">необязательно</span><input v-model="form.note" maxlength="150" placeholder="Например, великий князь московский"></label>

                                             <label>Краткая справка <span class="optional">необязательно</span>
                                               <textarea v-model="form.biography" placeholder="Кто этот человек, чем известен и какую роль сыграл в истории…" rows="5" />
                                             </label>

                                             <label>Источники <span class="optional">необязательно</span><input v-model="form.sources" maxlength="5000" placeholder="Книга, статья или ссылка; несколько источников через точку с запятой"></label>

                                             <fieldset class="relationship-fields">
                                               <legend>Связи с персонами <span class="optional">необязательно</span></legend>
                                               <p id="relationship-direction">Роль относится к {{ formFullName || 'текущей персоне' }}. Например, добавляя ребёнка в карточку отца, выберите роль «Отец». Можно добавить несколько связей.</p>
                                               <div v-if="form.group === 'close'" class="service-help"><strong>Чьим сподвижником был этот человек?</strong><p>Добавьте каждого правителя отдельной связью и укажите годы службы. Периоды могут пересекаться; неизвестные даты оставьте пустыми.</p><button class="add-relation-button" :disabled="!relatedPeople.some(person => person.group === 'rulers')" type="button" @click="form.relations.push({ personId: '', role: 'Сподвижник' })"><i class="mdi mdi-crown-outline" />Добавить правителя и период службы</button></div>

                                               <div v-for="(relation, index) in form.relations" :key="index" class="relationship-row">
                                                 <div class="relationship-row-heading"><span>Связь {{ index + 1 }}</span><button :aria-label="`Удалить связь ${index + 1}`" type="button" @click="form.relations.splice(index, 1)"><i aria-hidden="true" class="mdi mdi-close" /> Удалить</button></div>

                                                 <label>{{ relation.role.trim().toLocaleLowerCase('ru') === 'сподвижник' ? 'При каком правителе' : 'Другая персона атласа' }}
                                                   <select v-model="relation.personId" aria-describedby="relationship-direction" required>
                                                     <option disabled value="">Выберите персону</option>
                                                     <option v-for="person in relatedPeople.filter(person => relation.role.trim().toLocaleLowerCase('ru') !== 'сподвижник' || person.group === 'rulers' || person.id === relation.personId)" :key="person.id" :value="person.id">{{ person.name }} ({{ person.start }}–{{ person.end }})</option>
                                                   </select>
                                                 </label>

                                                 <label>Роль текущей персоны
                                                   <input
                                                     v-model="relation.role"
                                                     aria-describedby="relationship-direction"
                                                     list="relationship-roles"
                                                     maxlength="100"
                                                     placeholder="Выберите или напишите: сын, брат…"
                                                     required
                                                   >
                                                 </label>

                                                 <div class="relation-period"><label>Начало связи / службы<input
                                                                                max="2100"
                                                                                min="1"
                                                                                placeholder="Год, если известен"
                                                                                step="1"
                                                                                type="number"
                                                                                :value="relation.startYear ?? ''"
                                                                                @input="relation.startYear = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)"
                                                                              ></label>

                                                   <label>Конец связи / службы<input
                                                     max="2100"
                                                     min="1"
                                                     placeholder="Год, если известен"
                                                     step="1"
                                                     type="number"
                                                     :value="relation.endYear ?? ''"
                                                     @input="relation.endYear = ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value)"
                                                   ></label></div>

                                                 <p v-if="relation.personId && relation.role.trim()" class="relationship-preview">{{ formFullName || 'Текущая персона' }} — {{ relation.role }} → {{ people.find(person => person.id === relation.personId)?.name }}<small>{{ relationPeriod(relation) }} · слева — кто приходится; справа — кому.</small></p>
                                               </div>

                                               <datalist id="relationship-roles"><option v-for="role in relationshipRoles" :key="role" :value="role" /></datalist>
                                               <button class="add-relation-button" :disabled="relatedPeople.length === 0" type="button" @click="form.relations.push({ personId: '', role: '' })"><i aria-hidden="true" class="mdi mdi-plus" />Добавить связь</button>

                                               <div v-if="incomingRelations.length > 0" class="incoming-relations">
                                                 <h3>Связи, указанные у других персон</h3>
                                                 <p>Видны автоматически. Изменяются в форме соответствующей персоны.</p>
                                                 <div v-for="(relation, index) in incomingRelations" :key="`${relation.personId}-${index}`" class="incoming-relation"><strong>{{ relation.name }}</strong><span>{{ relation.role }} · {{ relationPeriod(relation) }} · по отношению к текущей персоне</span></div>
                                               </div>
                                             </fieldset></fieldset>

          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p><div class="form-actions"><button class="secondary-button" :disabled="saving" type="button" @click="dialog = false">{{ canEdit ? 'Отмена' : 'Закрыть' }}</button><button v-if="canEdit" class="primary-button" :disabled="saving || importing" type="submit"><i aria-hidden="true" class="mdi mdi-plus" />{{ saving ? 'Сохраняем…' : selected ? 'Сохранить' : 'Добавить на шкалу' }}</button></div><p v-if="canEdit" class="local-note">Изменения сохраняются в общей коллекции после подтверждения сервера.</p></form></div>
    </v-dialog>

    <v-snackbar color="#d1b57f" :model-value="!!toast" :timeout="3500" @update:model-value="toast = ''">{{ toast }}</v-snackbar>
  </v-app>
</template>
